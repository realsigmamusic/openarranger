// ==================================================================================================
// SAMPLE PLAYER — dispara samples via Web Audio API, e controla play/stop
// ==================================================================================================

import { state } from './state.js';
import { setStatus, updateUI, startCounterLoop, stopCounterLoop } from './ui.js';
import { startBar, scheduler } from './scheduler.js';
import { stopRecording } from './recorder.js';

/** Cria o AudioContext e os canais de volume (Rhythm/SubRhythm), se ainda não existirem. */
export function initAudio() {
	if (!state.audioCtx) {
		state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		state.masterGain = state.audioCtx.createGain();
		state.masterGain.gain.value = state.masterVolume;
		state.masterGain.connect(state.audioCtx.destination);
		state.masterGainSub = state.audioCtx.createGain();
		state.masterGainSub.gain.value = state.masterVolumeSub;
		state.masterGainSub.connect(state.audioCtx.destination);
	}
}

/** Toca uma nota do kit Rhythm no tempo dado (audioCtx.currentTime). Registra a nota se gravando. */
export function triggerSample(note, velocity, time) {
	if (state.isRecording) {
		state.recordEvents.push({ time, note, velocity, role: 'rhythm', channel: state.drumChannels[0] ?? 9 });
	}
	if (!state.kitLoaded || !state.kitBuffers[note] || !state.masterGain) return;
	const src = state.audioCtx.createBufferSource();
	const gain = state.audioCtx.createGain();
	src.buffer = state.kitBuffers[note];
	const volume = Math.pow(velocity / 127, 2);
	gain.gain.setValueAtTime(volume, time);
	src.connect(gain);
	gain.connect(state.masterGain);
	src.start(time);
}

/** Igual a triggerSample, mas para o kit SubRhythm. */
export function triggerSampleSub(note, velocity, time) {
	if (state.isRecording) {
		state.recordEvents.push({ time, note, velocity, role: 'sub', channel: state.drumChannelsSub[0] ?? 8 });
	}
	if (!state.kitLoadedSub || !state.kitBuffersSub[note] || !state.masterGainSub) return;
	const src = state.audioCtx.createBufferSource();
	const gain = state.audioCtx.createGain();
	src.buffer = state.kitBuffersSub[note];
	const volume = Math.pow(velocity / 127, 2);
	gain.gain.setValueAtTime(volume, time);
	src.connect(gain);
	gain.connect(state.masterGainSub);
	src.start(time);
}

/** Botão Start/Stop principal: liga ou desliga o arranjador. */
export function togglePlay() {
	if (!state.styleLoaded) {
		setStatus('Carregue um estilo primeiro!');
		return;
	}
	initAudio();
	if (!state.isPlaying) {
		state.isPlaying = true;
		state.barLengthTicks = state.stylePPQ * (4 / state.beatType) * state.beatsPerBar; // garante inicializado
		state.nextSection = state.currentSection;
		startBar(state.currentSection, 0, state.audioCtx.currentTime + 0.05);
		document.getElementById('btn-play').innerText = 'Stop';
		document.getElementById('btn-play').classList.add('playing');
		scheduler();
		startCounterLoop();
	} else {
		state.isPlaying = false;
		clearTimeout(state.timerId);
		stopCounterLoop();
		document.getElementById('btn-play').innerText = 'Start';
		document.getElementById('btn-play').classList.remove('playing');
		document.getElementById('beat-indicator').innerText = '*';
		state.recordArmed = false;
		if (state.isRecording) stopRecording();
	}
}

/** Agenda a parada do arranjador para um instante futuro exato (usado ao terminar uma Ending). */
export function scheduleStop(atTime) {
	const delay = Math.max(0, (atTime - state.audioCtx.currentTime) * 1000);
	setTimeout(() => {
		state.isPlaying = false;
		clearTimeout(state.timerId);
		stopCounterLoop();
		document.getElementById('btn-play').innerText = 'Start';
		document.getElementById('btn-play').classList.remove('playing');
		document.getElementById('beat-indicator').innerText = '*';
		state.recordArmed = false;
		if (state.isRecording) stopRecording();
		updateUI();
	}, delay);
}
