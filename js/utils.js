// ==================================================================================================
// UTILS — funções genéricas, sem dependência de estado do app
// ==================================================================================================
// Tudo aqui é "puro" ou só toca no DOM de forma isolada (sem ler/escrever `state`).
// São as funções mais fáceis de testar e reaproveitar em outro projeto.

import { LONG_PRESS_DELAY_MS, LONG_PRESS_INTERVAL_MS } from './config.js';

/** Baixa um Blob como arquivo, usando um link <a> temporário. */
export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Timestamp no formato AAAAMMDD_HHMMSS, usado para nomear arquivos exportados. */
export function timestampStr() {
	const d = new Date();
	const pad = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Feedback tátil (mobile). Útil em palco: confirma o toque sem precisar olhar pra tela. */
export function vibrate(pattern) {
	if (navigator.vibrate) {
		try { navigator.vibrate(pattern); } catch (e) { /* navegador sem suporte real ao método */ }
	}
}

/**
 * Liga um botão a uma ação que se repete enquanto ele fica pressionado (mouse ou touch).
 * Usado nos botões +/- de BPM.
 */
export function makeLongPress(btn, action) {
	let interval = null;
	let timeout = null;

	const start = () => {
		action();
		timeout = setTimeout(() => {
			interval = setInterval(action, LONG_PRESS_INTERVAL_MS);
		}, LONG_PRESS_DELAY_MS);
	};
	const stop = () => {
		clearTimeout(timeout);
		clearInterval(interval);
		timeout = null;
		interval = null;
	};

	btn.addEventListener('mousedown', start);
	btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
	btn.addEventListener('mouseup', stop);
	btn.addEventListener('mouseleave', stop);
	btn.addEventListener('touchend', stop);
	btn.addEventListener('touchcancel', stop);
}

/** Carrega um script externo (CDN) uma única vez, mesmo se chamado várias vezes. */
export function loadScript(src) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
		const s = document.createElement('script');
		s.src = src;
		s.onload = resolve;
		s.onerror = reject;
		document.head.appendChild(s);
	});
}

/** Garante que a JSZip (biblioteca de terceiros p/ ler .kit/.style, que são .zip) está carregada. */
export async function ensureJSZip() {
	if (window.JSZip) return;
	await loadScript('./assets/vendor/jszip.min.js');
}

/** Gera uma chave única pra um arquivo novo no IndexedDB (ex.: 'style:lq3k9x2ab1'). */
export function newDbKey(prefix) {
	return `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
