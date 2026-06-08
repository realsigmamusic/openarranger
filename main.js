// =============================================================================
// OpenArranger Drums - main.js
// =============================================================================

// ── CDN loader ────────────────────────────────────────────────────────────────
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
}

// ── Estado global ─────────────────────────────────────────────────────────────
let audioCtx   = null;
let isPlaying  = false;
let bpm        = 120;
let timerId    = null;

// Cérebro Musical
let currentSection = 'Main A';
let nextSection    = 'Main A';   // o que vai tocar no próximo compasso
let quantization   = 'measure';  // 'measure' | 'beat' | 'immediate'
let returnSection  = 'Main A';   // memória do Break

const scheduleAheadTime = 0.1;   // segundos à frente para agendar
const lookahead         = 25.0;  // intervalo do setTimeout em ms

// ── Data Layer ────────────────────────────────────────────────────────────────
const kitBuffers   = {};     // note → AudioBuffer
let   kitLoaded    = false;
let   kitName      = 'Sem kit';

let styleData      = null;   // style.json parseado
let styleMidiEvents = null;  // [{ tick, note, velocity }]
let stylePPQ       = 480;    // lido do cabeçalho MIDI
let beatsPerBar    = 4;      // lido do timeSignature do JSON
let styleLoaded    = false;
let styleName      = 'Sem estilo';
let drumChannels   = [8, 9]; // Padrão: canais 9 e 10 (0-based: 8 e 9)

// ── Scheduler state ───────────────────────────────────────────────────────────
// O scheduler avança tick a tick dentro do compasso atual.
// Ao fim de cada compasso verifica nextSection e troca se necessário.
let barEvents      = null;   // eventos do compasso atual (relativeTick 0..barTicks-1)
let barLengthTicks = 0;      // duração de 1 compasso em ticks
let barStartTime   = 0;      // audioCtx.currentTime do início do compasso atual
let barTickOffset  = 0;      // tick atual dentro do compasso
let eventIndex     = 0;      // próximo evento a agendar em barEvents

// ── MIDI Parser (zero-dependency) ─────────────────────────────────────────────
function parseMidi(buffer) {
    const data = new DataView(buffer);
    let pos = 0;

    const readUint16 = () => { const v = data.getUint16(pos); pos += 2; return v; };
    const readUint32 = () => { const v = data.getUint32(pos); pos += 4; return v; };
    const readByte   = () => data.getUint8(pos++);
    const readVarLen = () => {
        let val = 0, b;
        do { b = readByte(); val = (val << 7) | (b & 0x7f); } while (b & 0x80);
        return val;
    };

    if (readUint32() !== 0x4D546864) throw new Error('Não é MIDI válido');
    readUint32();                        // header length
    const format    = readUint16();
    const numTracks = readUint16();
    const ppq       = readUint16();
    const tracks    = [];

    for (let t = 0; t < numTracks; t++) {
        if (readUint32() !== 0x4D54726B) throw new Error('Track inválida');
        const trackEnd = pos + readUint32();
        const events   = [];
        let absTick = 0, running = 0;

        while (pos < trackEnd) {
            absTick += readVarLen();
            let status = data.getUint8(pos);
            if (status & 0x80) { running = status; pos++; } else { status = running; }

            const type = status & 0xf0;
            const ch   = status & 0x0f;

            if (type === 0x90 || type === 0x80) {
                const note = readByte(), vel = readByte();
                if (type === 0x90 && vel > 0)
                    events.push({ tick: absTick, note, velocity: vel, channel: ch });
            } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { pos += 2; }
            else if (type === 0xc0 || type === 0xd0)                  { pos += 1; }
            else if (status === 0xff) {
                readByte();
                const len = readVarLen();
                pos += len;
            }
            else if (status === 0xf0 || status === 0xf7) {
                const len = readVarLen();
                pos += len;
            }
            else { pos++; }
        }
        pos = trackEnd;
        tracks.push(events);
    }
    return { format, ppq, tracks };
}

function extractDrumEvents(midi) {
    let events = [];
    
    for (const track of midi.tracks) {
        for (const ev of track) {
            // Filtra dinamicamente usando os canais configurados
            if (drumChannels.includes(ev.channel)) {
                events.push(ev);
            }
        }
    }

    return events.sort((a, b) => a.tick - b.tick);
}


// ── Conversões ─────────────────────────────────────────────────────────────────
function barToTick(bar)       { return (bar - 1) * stylePPQ * beatsPerBar; }
function ticksToSeconds(t)    { return (t / stylePPQ) * (60 / bpm); }

// ── Eventos de uma seção ───────────────────────────────────────────────────────
function getSectionRange(sectionName) {
    const def = styleData?.sections?.[sectionName];
    if (!def) return null;
    const startTick = barToTick(def.startBar);
    const endTick   = barToTick(def.endBar);
    return { startTick, endTick, lengthTicks: endTick - startTick };
}

// Retorna os eventos de um compasso específico dentro de uma seção,
// com ticks relativos ao início desse compasso.
// barIndex: 0-based dentro da seção
function getBarEvents(sectionName, barIndex) {
    const range = getSectionRange(sectionName);
    if (!range || !styleMidiEvents) return [];

    const barStart = range.startTick + barIndex * barLengthTicks;
    const barEnd   = barStart + barLengthTicks;

    return styleMidiEvents
    .filter(e => e.tick >= barStart && e.tick < barEnd)
    .map(e => ({ ...e, relativeTick: e.tick - barStart }));
}

// Quantos compassos tem a seção?
function sectionBarCount(sectionName) {
    const range = getSectionRange(sectionName);
    if (!range) return 1;
    return Math.round(range.lengthTicks / barLengthTicks);
}

// ── Roteamento ─────────────────────────────────────────────────────────────────
// Automações padrão Yamaha (só disparam se o usuário não agendou nada)
function autoRoute(section) {
    // Extrai a letra da variação: "Fill In A" → "A", "Intro B" → "B"
    const letter = section.split(' ').pop(); // último token é sempre a letra

    if (section.startsWith('Fill In ') || section.startsWith('Intro '))
        return 'Main ' + letter;
    if (section === 'Break')
        return returnSection;
    if (section.startsWith('Ending '))
        return 'STOP';
    return section; // loop
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
// barIndex dentro da seção atual (para fazer loop correto de seções multi-compasso)
let currentBarIndexInSection = 0;

function startBar(sectionName, barIndexInSection, startTime, entryTick = 0) {
    currentSection           = sectionName;
    currentBarIndexInSection = barIndexInSection;
    // Em immediate, recua o barStartTime para que barTickOffset comece em entryTick
    barStartTime             = startTime - ticksToSeconds(entryTick);
    barTickOffset            = entryTick;
    eventIndex               = 0;
    barEvents                = styleLoaded
        ? getBarEvents(sectionName, barIndexInSection)
        : [];
    // Pula eventos anteriores ao ponto de entrada
    while (eventIndex < barEvents.length &&
           barEvents[eventIndex].relativeTick < entryTick) eventIndex++;

    if (sectionName.startsWith('Main ')) returnSection = sectionName;
    updateUI();
}

function scheduler() {
    if (!isPlaying) return;

    const horizon = audioCtx.currentTime + scheduleAheadTime;

    while (true) {
        const tickTime = barStartTime + ticksToSeconds(barTickOffset);
        if (tickTime >= horizon) break;

        // Dispara samples MIDI
        while (eventIndex < barEvents.length &&
            barEvents[eventIndex].relativeTick <= barTickOffset) {
            const ev  = barEvents[eventIndex++];
        const evT = barStartTime + ticksToSeconds(ev.relativeTick);
        triggerSample(ev.note, ev.velocity, evT);
            }

            // Beat indicator (1-based)
            const beat = Math.floor(barTickOffset / stylePPQ);
            requestAnimationFrame(() => {
                document.getElementById('beat-indicator').innerText = `Tempo: ${beat + 1}`;
            });

            barTickOffset++;

            // ── Verifica transição conforme quantização ───────────────────────
            const userQueued   = (nextSection !== currentSection) ? nextSection : null;
            const isMeasureEnd = barTickOffset >= barLengthTicks;
            const halfTicks    = Math.floor(barLengthTicks / 2);
            const isHalfEnd    = !isMeasureEnd && (barTickOffset % halfTicks === 0) && barTickOffset > 0;
            const isBeatEnd    = !isMeasureEnd && !isHalfEnd && (barTickOffset % stylePPQ === 0) && barTickOffset > 0;
            const isImmediate  = !isMeasureEnd && !isHalfEnd && !isBeatEnd;

            // Quantização só se aplica a Fills — todo o resto usa 'measure'
            const isFill = userQueued && userQueued.startsWith('Fill ');
            const activeQuant = isFill ? quantization : 'measure';

            // Decide se é hora de trocar agora
            const shouldTransition = isMeasureEnd || (
                userQueued && (
                    (activeQuant === 'half'      && isHalfEnd)  ||
                    (activeQuant === 'beat'      && isBeatEnd)  ||
                    (activeQuant === 'immediate' && isImmediate)
                )
            );

            if (shouldTransition) {
                // O tick absoluto dentro do compasso no momento da transição
                // (0 se fim do compasso, barTickOffset se corte antecipado)
                const cutTick      = isMeasureEnd ? barLengthTicks : barTickOffset;
                const nextBarStart = barStartTime + ticksToSeconds(cutTick);

                if (userQueued) {
                    if (userQueued === 'STOP') { scheduleStop(nextBarStart); return; }
                    // entryTick: posição absoluta no compasso onde a nova seção começa.
                    // Isso garante alinhamento musical perfeito independente do modo —
                    // a "agulha" continua no mesmo ponto do grid, só muda o conteúdo.
                    const entryTick = (isMeasureEnd || activeQuant === 'measure') ? 0 : cutTick;
                    startBar(userQueued, 0, nextBarStart, entryTick);
                } else {
                    // Automação: só roda no fim do compasso
                    const totalBars   = sectionBarCount(currentSection);
                    const nextBarIdx  = currentBarIndexInSection + 1;

                    if (nextBarIdx < totalBars) {
                        startBar(currentSection, nextBarIdx, nextBarStart);
                    } else {
                        const auto = autoRoute(currentSection);
                        if (auto === 'STOP') { scheduleStop(nextBarStart); return; }
                        nextSection = auto;
                        startBar(auto, 0, nextBarStart);
                    }
                }
            }
    }

    timerId = setTimeout(scheduler, lookahead);
}

// ── Carregamento de arquivos ──────────────────────────────────────────────────
async function ensureJSZip() {
    if (window.JSZip) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
}

async function loadKitFile(file) {
    await ensureJSZip();
    setStatus(`Carregando kit: ${file.name}…`);
    initAudio();

    const zip      = await JSZip.loadAsync(file);
    const sfzEntry = Object.values(zip.files).find(f => f.name.endsWith('.sfz'));
    if (!sfzEntry) { setStatus('❌ Kit inválido: nenhum .sfz encontrado'); return; }

    const mapping = parseSFZ(await sfzEntry.async('string'));
    let loaded = 0;

    for (const [note, path] of Object.entries(mapping)) {
        // Pega só o nome do arquivo (ex: "Hihat 046.wav") e converte pra minúsculo
        const targetName = path.replace(/\\/g, '/').split('/').pop().toLowerCase();
        
        // Vasculha todos os arquivos do ZIP ignorando pastas e letras maiúsculas
        const entryKey = Object.keys(zip.files).find(k => k.toLowerCase().endsWith(targetName));
        
        const entry = zip.files[entryKey];
        
        if (!entry) { 
            console.warn('⚠️ Sample não encontrado no ZIP:', path); 
            continue; 
        }
        
        try {
            kitBuffers[note] = await audioCtx.decodeAudioData(await entry.async('arraybuffer'));
            loaded++;
        } catch (e) { 
            console.warn('❌ Erro ao decodificar o áudio:', path, e); 
        }
    }

    kitLoaded = true;
    kitName   = file.name.replace(/\.kit$/i, '');
    setStatus(`✅ Kit "${kitName}" — ${loaded} samples`);
    updateHeaderLabels();
}

function parseSFZ(text) {
    const mapping = {};

    // Remove comentários de linha
    text = text.replace(/\/\/.*/g, '');

    // Divide em headers e blocos: <group>, <region>, <global>, etc.
    // Regex captura o tipo do header e tudo até o próximo header
    const blockRe = /<(\w+)>([^<]*)/g;
    let match;

    // Estado herdado do <global> e <group>
    let globalOpcodes = {};
    let groupOpcodes  = {};

    while ((match = blockRe.exec(text)) !== null) {
        const blockType = match[1].toLowerCase();
        const body      = match[2];

        // Parse todos os opcodes do bloco: opcode=valor (valor vai até o próximo opcode ou fim)
        const opcodes = {};
        const opRe = /(\w+)\s*=\s*(.+?)(?=\s+\w+\s*=|$)/g;
        let m;
        while ((m = opRe.exec(body.replace(/[\r\n]+/g, ' '))) !== null) {
            opcodes[m[1].toLowerCase()] = m[2].trim();
        }

        if (blockType === 'global') {
            globalOpcodes = opcodes;
            continue;
        }

        if (blockType === 'group') {
            // Herda global, sobrescreve com group
            groupOpcodes = { ...globalOpcodes, ...opcodes };
            continue;
        }

        if (blockType === 'region') {
            // Herda global → group → region (precedência crescente)
            const merged = { ...globalOpcodes, ...groupOpcodes, ...opcodes };

            const sample = merged['sample']?.replace(/["\']/g, '').trim();
            if (!sample) continue;

            // Determina a nota MIDI com precedência correta:
            // 1. key (define lokey=hikey=pitch_keycenter de uma vez)
            // 2. pitch_keycenter (nota "raiz" do sample)
            // 3. lokey (início do range — aceito como fallback)
            let note = null;
            if (merged['key']           !== undefined) note = parseMidiNote(merged['key']);
            if (note === null && merged['pitch_keycenter'] !== undefined) note = parseMidiNote(merged['pitch_keycenter']);
            if (note === null && merged['lokey']           !== undefined) note = parseMidiNote(merged['lokey']);

            if (note !== null) mapping[note] = sample;
        }
    }

    return mapping;
}

// Converte nota MIDI: aceita número "36" ou nome "C2", "F#3"
function parseMidiNote(val) {
    val = String(val).trim();
    const num = parseInt(val, 10);
    if (!isNaN(num)) return num;

    // Nome de nota: C-1, C#2, Db3, etc.
    const m = val.match(/^([A-Ga-g])([#b]?)([-]?\d+)$/);
    if (!m) return null;
    const noteMap = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
    const semitone = noteMap[m[1].toUpperCase()] + (m[2]==='#'?1: m[2]==='b'?-1:0);
    const octave   = parseInt(m[3], 10);
    return (octave + 1) * 12 + semitone; // MIDI: C-1 = 0
}


async function loadStyleFile(file) {
    await ensureJSZip();
    setStatus(`Carregando estilo: ${file.name}…`);

    const zip      = await JSZip.loadAsync(file);
    const jsonEntry = zip.files['style.json'];
    if (!jsonEntry) { setStatus('❌ style.json não encontrado'); return; }

    styleData = JSON.parse(await jsonEntry.async('string'));

    // Define os canais de bateria dinamicamente (1-based no JSON para facilitar)
    if (styleData.drumChannel !== undefined) {
        if (Array.isArray(styleData.drumChannel)) {
            drumChannels = styleData.drumChannel.map(ch => ch - 1);
        } else {
            drumChannels = [styleData.drumChannel - 1];
        }
    } else {
        drumChannels = [8, 9]; // Fallback se não existir no JSON
    }

    // Atualiza o BPM a partir do JSON (Item 4)
    if (styleData.bpm) {
        bpm = styleData.bpm;
        document.getElementById('bpm-display').value = bpm;
    }

    const midEntry = zip.files['style.mid'];
    if (!midEntry) { setStatus('❌ style.mid não encontrado'); return; }

    const midi      = parseMidi(await midEntry.async('arraybuffer'));
    stylePPQ        = midi.ppq;
    beatsPerBar     = styleData.timeSignature?.[0] ?? 4;
    barLengthTicks  = stylePPQ * beatsPerBar;
    styleMidiEvents = extractDrumEvents(midi);

    // Desabilita botões sem seção definida
    updateButtonAvailability();

    styleLoaded = true;
    // Usa o nome do JSON ou faz o fallback (Item 1)
    styleName   = styleData.name || file.name.replace(/\.style$/i, '');
    setStatus(`✅ Estilo "${styleName}" — ${styleMidiEvents.length} eventos | PPQ ${stylePPQ} | ${beatsPerBar}/4`);
    updateHeaderLabels();

    // showDebugInfo(); // Removido para não abrir o popup automaticamente (Item 2)
}

// ── Sample player ─────────────────────────────────────────────────────────────
function triggerSample(note, velocity, time) {
    if (!kitLoaded || !kitBuffers[note]) return;
    const src  = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    src.buffer = kitBuffers[note];
    gain.gain.setValueAtTime(velocity / 127, time);
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(time);
}

// ── Play / Stop ───────────────────────────────────────────────────────────────
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function togglePlay() {
    initAudio();
    if (!isPlaying) {
        isPlaying = true;
        barLengthTicks = stylePPQ * beatsPerBar; // garante inicializado
        nextSection    = currentSection;
        startBar(currentSection, 0, audioCtx.currentTime + 0.05);
        document.getElementById('btn-play').innerText = 'STOP';
        document.getElementById('btn-play').classList.add('playing');
        scheduler();
    } else {
        isPlaying = false;
        clearTimeout(timerId);
        document.getElementById('btn-play').innerText = 'PLAY';
        document.getElementById('btn-play').classList.remove('playing');
        document.getElementById('beat-indicator').innerText = 'Tempo: --';
    }
}

function scheduleStop(atTime) {
    const delay = Math.max(0, (atTime - audioCtx.currentTime) * 1000);
    setTimeout(() => {
        isPlaying = false;
        clearTimeout(timerId);
        currentSection = 'Main A';
        nextSection    = 'Main A';
        document.getElementById('btn-play').innerText = 'PLAY';
        document.getElementById('btn-play').classList.remove('playing');
        document.getElementById('beat-indicator').innerText = 'Tempo: --';
        updateUI();
    }, delay);
}

// ── Debug / Info ──────────────────────────────────────────────────────────────
function showDebugInfo() {
    if (!styleLoaded) { alert('Carregue um .style primeiro!'); return; }

    const totalBars = styleMidiEvents.length
    ? Math.ceil(Math.max(...styleMidiEvents.map(e => e.tick)) / barLengthTicks)
    : '?';

    let info = `ESTILO: ${styleName}\n`;
    info += `PPQ: ${stylePPQ}  |  Compasso: ${beatsPerBar}/4  |  Ticks/compasso: ${barLengthTicks}\n`;
    info += `Total de eventos: ${styleMidiEvents.length}  |  Compassos no arquivo: ${totalBars}\n\n`;
    info += `${'─'.repeat(45)}\nSEÇÕES\n${'─'.repeat(45)}\n`;

    for (const [name, def] of Object.entries(styleData.sections || {})) {
        const startTick  = barToTick(def.startBar);
        const endTick    = barToTick(def.endBar);
        const bars       = def.endBar - def.startBar;
        const evCount    = styleMidiEvents.filter(e => e.tick >= startTick && e.tick < endTick).length;
        const flag       = evCount === 0 ? ' ⚠️ vazia' : '';
        info += `${name.padEnd(12)} comp. ${def.startBar}–${def.endBar}  (${bars} comp.)  ${evCount} eventos${flag}\n`;
    }

    info += `\n${'─'.repeat(45)}\nPRIMEIROS 20 EVENTOS\n${'─'.repeat(45)}\n`;
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    for (let i = 0; i < Math.min(20, styleMidiEvents.length); i++) {
        const ev  = styleMidiEvents[i];
        const bar = Math.floor(ev.tick / barLengthTicks) + 1;
        const nm  = noteNames[ev.note % 12] + Math.floor(ev.note / 12);
        info += `[${String(i).padStart(2)}] tick ${String(ev.tick).padStart(6)}  comp.${String(bar).padStart(3)}  nota ${String(ev.note).padStart(3)} (${nm.padEnd(3)})  vel ${String(ev.velocity).padStart(3)}\n`;
    }

    document.getElementById('debug-info').innerText = info;
    document.getElementById('debug-modal').style.display = 'flex';
}

// ── UI ────────────────────────────────────────────────────────────────────────
function setStatus(msg) {
    document.getElementById('status-bar').innerText = msg;
}

function updateHeaderLabels() {
    document.getElementById('kit-label').innerText   = kitLoaded   ? `${kitName}`   : 'Sem kit';
    document.getElementById('style-label').innerText = styleLoaded ? `${styleName}` : 'Sem estilo';
}

function updateButtonAvailability() {
    document.querySelectorAll('.grid-container .btn').forEach(btn => {
        const sec = btn.dataset.section;
        const has = styleData?.sections?.[sec] != null;
        btn.disabled = !has;
        btn.style.opacity = has ? '1' : '0.3';
    });
}

function updateUI() {
    document.querySelectorAll('.grid-container .btn').forEach(b => {
        b.classList.remove('active', 'queued');
    });
    const activeBtn = document.querySelector(`.grid-container .btn[data-section="${currentSection}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (nextSection !== currentSection && nextSection !== 'STOP') {
        const queuedBtn = document.querySelector(`.grid-container .btn[data-section="${nextSection}"]`);
        if (queuedBtn) queuedBtn.classList.add('queued');
    }
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('quantization').addEventListener('change', e => {
    quantization = e.target.value;
});
document.getElementById('btn-play').addEventListener('click', togglePlay);

const bpmInput = document.getElementById('bpm-display');

// Alterado para ir de 1 em 1 (Item 3)
document.getElementById('bpm-plus').addEventListener('click', () => {
    bpm = Math.min(250, bpm + 1);
    bpmInput.value = bpm;
});

document.getElementById('bpm-minus').addEventListener('click', () => {
    bpm = Math.max(40, bpm - 1);
    bpmInput.value = bpm;
});

// Permite digitar o valor diretamente (Item 3)
bpmInput.addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) val = 120;
    bpm = Math.max(40, Math.min(250, val));
    bpmInput.value = bpm;
});

document.getElementById('btn-load-kit').addEventListener('click', () =>
document.getElementById('input-kit').click());
document.getElementById('btn-load-style').addEventListener('click', () =>
document.getElementById('input-style').click());
document.getElementById('btn-debug').addEventListener('click', showDebugInfo);
document.getElementById('close-debug').addEventListener('click', () =>
document.getElementById('debug-modal').style.display = 'none');

document.getElementById('input-kit').addEventListener('change', async e => {
    if (e.target.files[0]) await loadKitFile(e.target.files[0]);
    e.target.value = '';
});
document.getElementById('input-style').addEventListener('change', async e => {
    if (e.target.files[0]) await loadStyleFile(e.target.files[0]);
    e.target.value = '';
});

document.querySelectorAll('.grid-container .btn').forEach(btn => {
    btn.addEventListener('click', e => {
        const clicked = e.target.dataset.section;
        nextSection = clicked;
        if (!isPlaying) {
            currentSection = clicked;
            if (clicked.startsWith('Main ')) returnSection = clicked;
        }
        updateUI();
    });
});

// Inicialização
updateUI();
updateHeaderLabels();
setStatus('Pronto. Carregue um .kit e um .style para começar.');