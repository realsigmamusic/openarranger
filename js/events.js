// ==================================================================================================
// EVENTS — liga os elementos da tela (botões, selects, sliders) às funções dos outros módulos
// ==================================================================================================
// Este arquivo não tem lógica própria: só "aperta os parafusos" entre o HTML e o resto do app.
// Se quiser saber o que acontece quando o usuário clica em algo, comece por aqui.

import { state } from './state.js';
import { dbSave } from './persistence.js';
import { saveStyle, saveKit, syncStyleManifest, openLibrary, closeLibrary } from './library.js';
import { setStatus, showDebugInfo, updateUI } from './ui.js';
import { makeLongPress, vibrate } from './utils.js';
import { togglePlay } from './sample-player.js';
import { applyStyle, updateStyleSelect, loadStyleFile } from './style-loader.js';
import { applyKit, loadKitFile } from './kit-loader.js';
import { requestBpmChange, toggleRecording, toggleRecordingPlayback } from './recorder.js';
import { processTap } from './tap-tempo.js';
import { requestResync } from './resync.js';

export function wireUpEvents() {
	document.getElementById('volume-slider-rhythm').addEventListener('input', e => {
		state.masterVolume = parseInt(e.target.value, 10) / 100;
		if (state.masterGain) state.masterGain.gain.value = state.masterVolume;
	});
	document.getElementById('volume-slider-sub').addEventListener('input', e => {
		state.masterVolumeSub = parseInt(e.target.value, 10) / 100;
		if (state.masterGainSub) state.masterGainSub.gain.value = state.masterVolumeSub;
	});

	document.getElementById('quantization').addEventListener('change', e => {
		state.quantization = e.target.value;
	});
	document.getElementById('btn-play').addEventListener('click', togglePlay);
	document.getElementById('btn-resync').addEventListener('click', requestResync);

	const bpmInput = document.getElementById('bpm-display');

	makeLongPress(document.getElementById('bpm-plus'), () => {
		requestBpmChange((state.isRecording && state.isPlaying ? (state.pendingBpm ?? state.bpm) : state.bpm) + 1);
	});

	makeLongPress(document.getElementById('bpm-minus'), () => {
		requestBpmChange((state.isRecording && state.isPlaying ? (state.pendingBpm ?? state.bpm) : state.bpm) - 1);
	});

	document.getElementById('beat-indicator').addEventListener('click', processTap);
	document.getElementById('beat-indicator').title = 'Toque para fazer tap tempo';

	bpmInput.addEventListener('change', (e) => {
		let val = parseInt(e.target.value, 10);
		if (isNaN(val)) val = 120;
		requestBpmChange(val);
	});

	document.getElementById('btn-load-kit').addEventListener('click', () => document.getElementById('input-kit').click());
	document.getElementById('btn-add-style').addEventListener('click', () => document.getElementById('input-style').click());
	document.getElementById('input-style').addEventListener('change', async e => {
		for (const file of e.target.files) {
			const entry = await loadStyleFile(file);
			if (entry) await saveStyle(entry, file); // só salva o que carregou de verdade
		}
		e.target.value = '';
		updateStyleSelect(true);
		await syncStyleManifest(); // depois de aplicar, pra gravar o style ativo correto
	});
	document.getElementById('style-select').addEventListener('change', async e => {
		const idx = parseInt(e.target.value);
		if (!isNaN(idx)) {
			applyStyle(idx);
			await dbSave('style:active', idx);
		}
	});
	document.getElementById('kit-select-rhythm').addEventListener('change', async e => {
		const [ki, si] = e.target.value.split(':').map(Number);
		if (!isNaN(ki)) await applyKit(ki, si, 'rhythm');
	});
	document.getElementById('kit-select-sub').addEventListener('change', async e => {
		const [ki, si] = e.target.value.split(':').map(Number);
		if (!isNaN(ki)) await applyKit(ki, si, 'sub');
	});
	document.getElementById('btn-record').addEventListener('click', toggleRecording);
	document.getElementById('btn-play-recording').addEventListener('click', toggleRecordingPlayback);
	document.getElementById('btn-debug').addEventListener('click', showDebugInfo);
	document.getElementById('btn-library').addEventListener('click', openLibrary);
	document.getElementById('close-library').addEventListener('click', closeLibrary);
	document.getElementById('library-modal').addEventListener('click', e => {
		if (e.target.id === 'library-modal') closeLibrary(); // toque fora da caixa fecha
	});
	document.getElementById('close-debug').addEventListener('click', () =>
		document.getElementById('debug-modal').style.display = 'none');

	document.getElementById('input-kit').addEventListener('change', async e => {
		const file = e.target.files[0];
		if (file) {
			const entry = await loadKitFile(file);
			if (entry) await saveKit(entry, file);
		}
		e.target.value = '';
	});

	document.querySelectorAll('.grid-container .btn').forEach(btn => {
		btn.addEventListener('click', e => {
			const clicked = e.target.closest('[data-section]')?.dataset.section;
			if (!clicked) return;

			if (state.styleLoaded && !state.styleData?.sections?.[clicked]) return; // seção não existe neste style

			if (!state.isPlaying) {
				state.currentSection = clicked;
				state.nextSection = clicked;
				state.repeatCurrent = false;
				if (clicked.startsWith('Main ')) state.returnSection = clicked;
				vibrate(10); // seleção simples, ainda parado
				updateUI();
				return;
			}

			if (clicked === state.currentSection) {
				// Clicou na seção ativa → agenda repetição do início
				state.repeatCurrent = true;
				vibrate([10, 30, 10]); // pulso duplo: repetição enfileirada
				btn.classList.add('queued'); // feedback visual: pisca o botão como queued
			} else {
				state.repeatCurrent = false;
				state.nextSection = clicked;
				if (clicked.startsWith('Ending ')) {
					vibrate([25, 50, 25, 50, 25]); // padrão mais forte: vai parar a música
				} else if (clicked.startsWith('Fill In ') || clicked === 'Break') {
					vibrate([15, 40, 15]); // transição especial
				} else {
					vibrate(12); // troca normal entre Main/Intro
				}
				updateUI();
			}
		});
	});
}
