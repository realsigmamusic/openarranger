// ==================================================================================================
// SESSION — restaura o último kit/style carregados ao abrir o app
// ==================================================================================================

import { state } from './state.js';
import { dbLoad } from './persistence.js';
import { setStatus } from './ui.js';
import { loadKitFile } from './kit-loader.js';
import { loadStyleFile, applyStyle } from './style-loader.js';

/** Recarrega kit e styles salvos na sessão anterior (o app é um PWA offline, sem servidor). */
export async function restoreLastSession() {
	const [kitFile, styleManifest] = await Promise.all([
		dbLoad('kit'),
		dbLoad('style:manifest'),
	]);
	let restored = false;

	if (kitFile) {
		setStatus('Restaurando kit da última sessão...');
		await loadKitFile(kitFile);
		restored = true;
	}

	// Usa o manifesto explícito (lista de chaves) para restaurar styles sem while(true).
	const keys = Array.isArray(styleManifest) ? styleManifest : [];
	// Fallback: se não há manifesto, tenta varredura sequencial legada (compatibilidade)
	if (keys.length === 0) {
		let i = 0;
		let sf = await dbLoad(`style:${i}`);

		while (sf) {
			setStatus(`Restaurando style ${i + 1}...`);
			await loadStyleFile(sf);
			i++;
			sf = await dbLoad(`style:${i}`);
		}
		if (i > 0) restored = true;
	} else {
		for (const key of keys) {
			const sf = await dbLoad(key);
			if (!sf) continue;
			setStatus(`Restaurando style ${key}...`);
			await loadStyleFile(sf);
			restored = true;
		}
	}

	if (state.styles.length > 0) {
		const savedActive = await dbLoad('style:active');
		const targetIdx = (savedActive != null && savedActive < state.styles.length) ? savedActive : state.styles.length - 1;
		applyStyle(targetIdx);
		const sel = document.getElementById('style-select');
		sel.value = targetIdx;
	}

	if (!restored) setStatus('Carregue um .kit e um .style para começar.');
}
