// ==================================================================================================
// RECORDER — grava a performance ao vivo e exporta como arquivo .mid
// ==================================================================================================
// Fluxo em 3 estados: parado → arma (recordArmed); armado → desarma; gravando → para e exporta
// (é "punch-out": não interrompe a música). O início de fato acontece dentro de scheduler.js,
// em startBar(), sempre num início de compasso cheio — garante que o tick 0 do MIDI exportado
// caia certinho no grid.

import { state } from './state.js';
import { BPM_MIN, BPM_MAX } from './config.js';
import { setStatus } from './ui.js';
import { buildMidiFile } from './midi-writer.js';
import { downloadBlob, timestampStr } from './utils.js';
// Import "circular" com sample-player.js (que também importa deste arquivo). Isso é seguro em
// módulos ES: as funções só são de fato chamadas depois que ambos os módulos já terminaram de
// carregar, então os bindings já estão resolvidos.
import { initAudio, togglePlay } from './sample-player.js';

const ICON_RECORD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-record-fill" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 13A5 5 0 1 0 8 3a5 5 0 0 0 0 10"/></svg>';
const ICON_STOP = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-stop-fill" viewBox="0 0 16 16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5"/></svg>';
const ICON_PLAY = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill" viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/></svg>';

let recordingPlaybackSources = [];
let recordingPlaybackTimeoutId = null;

/** Registra uma mudança de BPM no histórico da gravação em andamento (usado ao exportar o MIDI). */
export function logTempoChange(atTime) {
	if (!state.isRecording || !state.audioCtx) return;
	state.tempoChanges.push({ time: atTime ?? state.audioCtx.currentTime, bpm: state.bpm });
}

/** Registra uma troca de fórmula de compasso (ReSync) no histórico da gravação em andamento. */
export function logTimeSigChange(atTime, num, den) {
	if (!state.isRecording) return;
	state.timeSigChanges.push({ time: atTime, num, den });
}

/**
 * Ponto único de entrada pra mudanças de BPM (tap tempo, +/-, input manual).
 * Durante uma gravação com a música tocando, a troca fica "armada" e só é aplicada
 * na próxima fronteira de quantização (mesma grade usada pelos Fills) — assim o BPM
 * gravado no MIDI cai exatamente no grid, igual às notas.
 */
export function requestBpmChange(newBpm) {
	newBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, newBpm));
	const bpmInput = document.getElementById('bpm-display');
	if (state.isRecording && state.isPlaying) {
		state.pendingBpm = newBpm;
		bpmInput.value = newBpm;
		setStatus(`BPM ${newBpm} agendado (quantização: ${state.quantization}).`);
	} else {
		state.bpm = newBpm;
		bpmInput.value = state.bpm;
		logTempoChange();
	}
}

/** Para a gravação em andamento e dispara a exportação do MIDI (se algo foi capturado). */
export function stopRecording() {
	if (!state.isRecording) return;
	state.isRecording = false;
	state.pendingBpm = null;
	if (state.recordEvents.length === 0) {
		setStatus('Gravação vazia — nenhuma nota capturada.');
		updateRecordUI();
		return;
	}
	state.recordedEventsForPlayback = state.recordEvents.slice();
	exportRecordingAsMidi();
	updateRecordUI();
}

/** Handler do botão de gravação: arma, desarma, ou para e exporta, conforme o estado atual. */
export function toggleRecording() {
	if (state.isPlayingRecording) { setStatus('Pare o playback antes de gravar.'); return; }
	if (state.isRecording) { stopRecording(); return; }
	if (state.recordArmed) {
		state.recordArmed = false;
		updateRecordUI();
		setStatus('Gravação cancelada.');
		return;
	}
	initAudio();
	state.recordArmed = true;
	updateRecordUI();
	setStatus(state.isPlaying
		? 'Gravação armada — começa no próximo compasso.'
		: 'Gravação armada — começa junto com o Start.');
}

/**
 * Converte um tempo absoluto (audioCtx.currentTime) em ticks MIDI, respeitando
 * mudanças de BPM registradas durante a gravação (tempoChanges já ordenado por tempo).
 * É o inverso exato de ticksToSeconds(): (t/ppq)*(60/bpm)/beatUnitFactor.
 */
export function secondsToRecordedTicks(tSec, ppq) {
	const factor = state.recordBeatUnitFactor || 1;
	let ticks = 0;
	for (let i = 0; i < state.tempoChanges.length; i++) {
		const segStart = state.tempoChanges[i].time;
		if (tSec <= segStart) break;
		const segEnd = (i + 1 < state.tempoChanges.length) ? state.tempoChanges[i + 1].time : tSec;
		const segBpm = state.tempoChanges[i].bpm;
		const dur = Math.min(tSec, segEnd) - segStart;
		if (dur > 0) ticks += dur * (segBpm / 60) * ppq * factor;
		if (tSec <= segEnd) break;
	}
	return Math.max(0, Math.round(ticks));
}

/** Monta o arquivo .mid da gravação (Conductor + Rhythm + SubRhythm) e inicia o download. */
export function exportRecordingAsMidi() {
	const ppq = state.stylePPQ || 480;
	const gateTicks = Math.max(10, Math.round(ppq / 16)); // duração curta (percussivo)

	const rhythmNotes = [];
	const subNotes = [];
	for (const ev of state.recordedEventsForPlayback) {
		const tickOn = secondsToRecordedTicks(ev.time, ppq);
		const bucket = ev.role === 'rhythm' ? rhythmNotes : subNotes;
		bucket.push({ tick: tickOn, note: ev.note, velocity: ev.velocity, channel: ev.channel, type: 'on' });
		bucket.push({ tick: tickOn + gateTicks, note: ev.note, velocity: 0, channel: ev.channel, type: 'off' });
	}

	// Fórmulas de compasso: a inicial + os pares de trocas do ReSync. Se duas caem no mesmo tick
	// (dois cortes seguidos), vale a última — o arquivo nunca tem duas fórmulas no mesmo instante.
	const timeSigByTick = new Map();
	timeSigByTick.set(0, { tick: 0, kind: 'timesig', num: state.recordTimeSig.num, beatType: state.recordTimeSig.beatType });
	for (const ts of state.timeSigChanges) {
		const tick = secondsToRecordedTicks(ts.time, ppq);
		timeSigByTick.set(tick, { tick, kind: 'timesig', num: ts.num, beatType: ts.den });
	}

	const conductorEvents = [
		...timeSigByTick.values(),
		...state.tempoChanges.map(tc => ({ tick: secondsToRecordedTicks(tc.time, ppq), kind: 'tempo', bpm: tc.bpm })),
	];

	const tracks = [{ name: 'Conductor', events: conductorEvents }];
	if (rhythmNotes.length) tracks.push({ name: 'Rhythm', events: rhythmNotes });
	if (subNotes.length) tracks.push({ name: 'SubRhythm', events: subNotes });

	const blob = buildMidiFile(ppq, tracks);
	downloadBlob(blob, `OpenArranger_${timestampStr()}.mid`);
	setStatus(`Gravação exportada: ${state.recordedEventsForPlayback.length} notas em ${tracks.length} tracks, ${state.recordTimeSig.num}/${state.recordTimeSig.beatType}, BPM inicial ${state.tempoChanges[0]?.bpm ?? state.bpm}.`);
}

/** Agenda uma nota gravada para tocar de novo, reaproveitando os samples já carregados. */
function scheduleRecordedNote(ev, when) {
	const buffersObj = ev.role === 'rhythm' ? state.kitBuffers : state.kitBuffersSub;
	const loaded = ev.role === 'rhythm' ? state.kitLoaded : state.kitLoadedSub;
	const destGain = ev.role === 'rhythm' ? state.masterGain : state.masterGainSub;
	if (!loaded || !buffersObj[ev.note] || !destGain) return null;

	const src = state.audioCtx.createBufferSource();
	const gain = state.audioCtx.createGain();
	src.buffer = buffersObj[ev.note];
	gain.gain.setValueAtTime(Math.pow(ev.velocity / 127, 2), when);
	src.connect(gain);
	gain.connect(destGain);
	src.start(when);
	return src;
}

/** Toca a última gravação de volta, do início ao fim. */
export function playRecording() {
	if (!state.recordedEventsForPlayback.length) { setStatus('Nenhuma gravação disponível.'); return; }
	if (state.isRecording || state.isPlayingRecording) return;

	if (state.isPlaying) togglePlay(); // não mistura com o arranjador ao vivo
	initAudio();

	state.isPlayingRecording = true;
	updateRecordUI();
	setStatus('Tocando gravação...');

	const startRef = state.recordedEventsForPlayback[0].time;
	const t0 = state.audioCtx.currentTime + 0.1;
	recordingPlaybackSources = [];
	for (const ev of state.recordedEventsForPlayback) {
		const when = t0 + (ev.time - startRef);
		const src = scheduleRecordedNote(ev, when);
		if (src) recordingPlaybackSources.push(src);
	}
	const lastEv = state.recordedEventsForPlayback[state.recordedEventsForPlayback.length - 1];
	const totalDurMs = ((lastEv.time - startRef) + 1) * 1000;
	recordingPlaybackTimeoutId = setTimeout(() => stopRecordingPlayback(false), totalDurMs);
}

/** Interrompe o playback da gravação (manual = usuário clicou; false = terminou sozinho). */
export function stopRecordingPlayback(manual = true) {
	if (!state.isPlayingRecording) return;
	clearTimeout(recordingPlaybackTimeoutId);
	for (const src of recordingPlaybackSources) {
		try { src.stop(); } catch (e) { /* já pode ter terminado sozinha */ }
	}
	recordingPlaybackSources = [];
	state.isPlayingRecording = false;
	updateRecordUI();
	setStatus(manual ? 'Playback interrompido.' : 'Playback concluído.');
}

/** Handler do botão de play da gravação: alterna entre tocar e parar. */
export function toggleRecordingPlayback() {
	if (state.isPlayingRecording) stopRecordingPlayback(true);
	else playRecording();
}

/** Atualiza o ícone/estado visual dos botões de gravação e playback. */
export function updateRecordUI() {
	const recBtn = document.getElementById('btn-record');
	const playBtn = document.getElementById('btn-play-recording');
	recBtn.classList.toggle('recording', state.isRecording);
	recBtn.classList.toggle('armed', state.recordArmed);
	recBtn.innerHTML = state.isRecording ? ICON_STOP : ICON_RECORD;
	playBtn.disabled = state.recordedEventsForPlayback.length === 0 || state.isRecording;
	playBtn.classList.toggle('playing', state.isPlayingRecording);
	playBtn.innerHTML = state.isPlayingRecording ? ICON_STOP : ICON_PLAY;
}
