// ==================================================================================================
// STYLE LOADER — carrega arquivos .style (um .zip com .mid + style.json) e ativa um deles
// ==================================================================================================

import { state } from './state.js';
import { ensureJSZip } from './utils.js';
import { setStatus, updateUI } from './ui.js';
import { parseMidi, extractDrumEvents } from './midi-parser.js';
import { parseBeatUnit } from './style-engine.js';
import { stopRecording, updateRecordUI } from './recorder.js';
import { togglePlay } from './sample-player.js';

/** Lê um arquivo .style, faz o parse do MIDI e do JSON de seções, e adiciona à lista de styles. */
export async function loadStyleFile(file) {
	await ensureJSZip();
	setStatus(`Carregando estilo: ${file.name}...`);

	const zip = await JSZip.loadAsync(file);
	const jsonEntry = Object.values(zip.files).find(f => f.name.endsWith('.json'));
	if (!jsonEntry) { setStatus('.json não encontrado'); return; }

	const sd = JSON.parse(await jsonEntry.async('string'));

	// Define os canais de bateria dinamicamente (1-based no JSON para facilitar).
	// Formato atual: { "Rhythm": 10, "subRhythm": 9 }.
	// Retrocompatível com: { "drumChannel": 10 } ou { "drumChannel": [9,10] }.
	let dc, dcSub;
	if (sd.Rhythm !== undefined || sd.subRhythm !== undefined) {
		dc = sd.Rhythm !== undefined ? [sd.Rhythm - 1] : [9];
		dcSub = sd.subRhythm !== undefined ? [sd.subRhythm - 1] : [];
	} else if (sd.drumChannel !== undefined) {
		const arr = Array.isArray(sd.drumChannel)
			? sd.drumChannel.map(ch => ch - 1)
			: [sd.drumChannel - 1];
		dc = [arr[0]];
		dcSub = arr.length > 1 ? [arr[1]] : [];
	} else {
		dc = [9];
		dcSub = [8];
	}

	const midEntry = Object.values(zip.files).find(f => f.name.endsWith('.mid'));
	if (!midEntry) { setStatus('.mid não encontrado'); return; }

	const midi = parseMidi(await midEntry.async('arraybuffer'));
	const ppq = midi.ppq;
	const bpb = sd.timeSignature?.[0] ?? 4;
	const bt = sd.timeSignature?.[1] ?? 4;
	const buf = parseBeatUnit(sd.beatUnit); // 1=semínima (default), 1.5=pontuada, 0.5=colcheia...
	const events = extractDrumEvents(midi, dc);
	const eventsSub = dcSub.length > 0 ? extractDrumEvents(midi, dcSub) : [];
	const sName = sd.name || file.name.replace(/\.style$/i, '');

	// Verifica se já existe um style com mesmo nome e substitui
	const existing = state.styles.findIndex(s => s.name === sName);
	const entry = {
		name: sName, styleData: sd, styleMidiEvents: events,
		styleMidiEventsSub: eventsSub,
		stylePPQ: ppq, beatsPerBar: bpb, beatType: bt, beatUnitFactor: buf,
		drumChannels: dc, drumChannelsSub: dcSub, bpm: sd.bpm || state.bpm,
	};

	if (existing >= 0) {
		state.styles[existing] = entry;
	} else {
		state.styles.push(entry);
	}

	updateStyleSelect(false); // atualiza UI sem aplicar style
}

/** Ativa o style pelo índice: copia seus dados para o `state` "atual" e reseta a posição de tela. */
export function applyStyle(index) {
	if (state.isRecording) {
		stopRecording(); // troca de style interrompe e exporta a gravação em andamento
	}
	if (state.recordArmed) {
		state.recordArmed = false;
		state.pendingBpm = null;
		updateRecordUI();
	}
	if (state.isPlaying) {
		togglePlay(); // Para a música se estiver tocando
	}
	if (index < 0 || index >= state.styles.length) return;
	state.activeStyleIndex = index;
	const s = state.styles[index];
	state.styleData = s.styleData;
	state.styleMidiEvents = s.styleMidiEvents;
	state.styleMidiEventsSub = s.styleMidiEventsSub ?? [];
	state.stylePPQ = s.stylePPQ;
	state.beatsPerBar = s.beatsPerBar;
	state.beatType = s.beatType;
	state.beatUnitFactor = s.beatUnitFactor ?? 1;
	state.drumChannels = s.drumChannels;
	state.drumChannelsSub = s.drumChannelsSub ?? [];
	state.styleLoaded = true;
	state.styleName = s.name;
	state.barLengthTicks = state.stylePPQ * (4 / state.beatType) * state.beatsPerBar;
	state.bpm = s.bpm;
	state.currentSection = 'Intro A';
	state.nextSection = 'Main A';
	updateUI();
	document.getElementById('bpm-display').value = state.bpm;
	setStatus(`Events ${state.styleMidiEvents.length} - PPQ ${state.stylePPQ} - Time ${state.beatsPerBar}/${state.beatType}`);
}

/** Reconstrói o <select> de styles carregados e, por padrão, aplica o selecionado. */
export function updateStyleSelect(autoApply = true) {
	const sel = document.getElementById('style-select');
	const prev = sel.value;
	sel.innerHTML = '';
	if (state.styles.length === 0) {
		const opt = document.createElement('option');
		opt.value = '';
		opt.textContent = 'Load style';
		sel.appendChild(opt);
		return;
	}
	state.styles.forEach((s, i) => {
		const opt = document.createElement('option');
		opt.value = i;
		opt.textContent = s.name;
		sel.appendChild(opt);
	});
	// Mantém seleção ou vai pro último
	const newIdx = state.styles.findIndex((_, i) => String(i) === prev);
	sel.value = newIdx >= 0 ? newIdx : state.styles.length - 1;
	if (autoApply) applyStyle(parseInt(sel.value));
}
