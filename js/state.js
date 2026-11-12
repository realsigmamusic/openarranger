// ==================================================================================================
// STATE — estado compartilhado do app
// ==================================================================================================
// Antes, o main.js tinha ~40 variáveis "let" soltas no topo do arquivo, e qualquer função em
// qualquer lugar podia ler ou alterar qualquer uma delas. Isso funciona, mas dificulta responder
// "quem mexeu nisso?" quando aparece um bug.
//
// Aqui, todo o estado mutável mora dentro de um único objeto `state`, importado por quem precisar.
// O comportamento é idêntico ao original — é só a variável `bpm` que virou `state.bpm`.
// A vantagem: dá pra ver TODO o estado do app num só lugar, e dá pra logar/inspecionar
// `state` inteiro no console pra debugar (experimente `console.log(state)` no devtools).

export const state = {
	// --- Áudio ---
	audioCtx: null,
	isPlaying: false,
	bpm: 120,
	timerId: null,

	// --- Cérebro musical (qual seção está tocando / qual vai tocar) ---
	currentSection: 'Intro A',
	nextSection: 'Main A',       // o que vai tocar no próximo compasso
	quantization: 'half',        // 'measure' | 'half' | 'beat' | 'immediate'
	returnSection: 'Main A',     // memória do Break: pra qual Main voltar
	repeatCurrent: false,        // usuário clicou na seção ativa → repetir do compasso 1

	// --- Kits (drumkits / samples) ---
	kitBuffers: {},              // Rhythm: nota MIDI → AudioBuffer
	kitBuffersSub: {},           // SubRhythm: nota MIDI → AudioBuffer
	kits: [],                    // array de { name, sfzNames, zip }
	activeKitIndex: -1,
	activeSfzIndex: 0,           // SFZ ativo no select Rhythm
	activeSfzIndexSub: 0,        // SFZ ativo no select SubRhythm
	kitLoaded: false,
	kitLoadedSub: false,
	kitName: 'Load drumkit',
	kitNameSub: 'Load drumkit',

	// --- Styles (padrões de acompanhamento) ---
	styles: [],                  // array de { name, styleData, styleMidiEvents, stylePPQ, ... }
	activeStyleIndex: -1,
	styleData: null,
	styleMidiEvents: null,
	styleMidiEventsSub: null,
	stylePPQ: 480,
	beatsPerBar: 4,
	beatType: 4,
	styleLoaded: false,
	styleName: 'Load style',
	drumChannels: [9],           // Rhythm    (canal 10 em 1-based → índice 9)
	drumChannelsSub: [8],        // SubRhythm (canal 9 em 1-based → índice 8)
	beatUnitFactor: 1,           // quantas semínimas vale 1 beat

	// --- Scheduler (agendamento de compasso a compasso) ---
	barEvents: null,             // eventos Rhythm do compasso atual
	barEventsSub: null,          // eventos SubRhythm do compasso atual
	barLengthTicks: 0,           // duração de 1 compasso, em ticks
	barStartTime: 0,             // audioCtx.currentTime do início do compasso atual
	barTickOffset: 0,            // tick atual dentro do compasso
	eventIndex: 0,               // próximo evento Rhythm a agendar
	eventIndexSub: 0,            // próximo evento SubRhythm a agendar
	currentBarIndexInSection: 0,
	resyncCutTick: null,         // ReSync pendente: tick (dentro do compasso atual) onde o compasso termina

	// --- Gravação de performance (exporta .mid) ---
	isRecording: false,
	recordArmed: false,          // vai começar no próximo início de compasso real
	isPlayingRecording: false,
	recordStartTime: 0,
	recordEvents: [],            // { time, note, velocity, role, channel }
	recordedEventsForPlayback: [],
	tempoChanges: [],            // { time, bpm }
	timeSigChanges: [],          // { time, num, den } — compassos curtos do ReSync
	recordTimeSig: { num: 4, beatType: 4 },
	recordBeatUnitFactor: 1,
	pendingBpm: null,            // BPM aguardando fronteira de quantização

	// --- Volume / mixer ---
	masterGain: null,
	masterGainSub: null,
	masterVolume: 1.0,
	masterVolumeSub: 1.0,
};
