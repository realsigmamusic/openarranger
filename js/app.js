// ==================================================================================================
// APP — ponto de entrada
// ==================================================================================================
// Este é o único arquivo carregado pelo index.html (<script type="module" src="./js/app.js">).
// Ele importa e liga tudo. Se você é novo no código, a ordem de leitura recomendada é:
//
//   state.js          → o que o app "lembra"
//   style-engine.js    → como converter compassos/ticks/tempo
//   scheduler.js        → o coração: decide o que toca e quando
//   sample-player.js    → como o áudio de fato sai da caixa
//   kit-loader.js / style-loader.js → como os arquivos .kit/.style viram dados
//   recorder.js          → gravação e exportação MIDI
//   ui.js / events.js    → o que aparece na tela e o que os cliques fazem

import { updateUI } from './ui.js';
import { updateRecordUI } from './recorder.js';
import { wireUpEvents } from './events.js';
import { restoreLastSession } from './session.js';

/** Lê a versão do app a partir do service worker (sw.js) e mostra no cabeçalho. */
async function loadAppVersion() {
	const res = await fetch('./sw.js');
	const text = await res.text();
	const match = text.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
	if (match) document.getElementById('app-version').textContent = `v${match[1]}`;
}

wireUpEvents();
updateUI();
updateRecordUI();
restoreLastSession();
loadAppVersion();
