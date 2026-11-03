// ==================================================================================================
// SESSION — restaura os kits/styles salvos na sessão anterior ao abrir o app
// ==================================================================================================

import { state } from './state.js';
import { dbLoad } from './persistence.js';
import { setStatus } from './ui.js';
import { loadKitFile, updateKitSelect } from './kit-loader.js';
import { loadStyleFile, applyStyle } from './style-loader.js';
import { STYLE_MANIFEST, KIT_MANIFEST, STYLE_ACTIVE, LEGACY_KIT_KEY } from './library.js';

/** Recarrega kits e styles salvos na sessão anterior (o app é um PWA offline, sem servidor). */
export async function restoreLastSession() {
	const [kitManifest, styleManifest] = await Promise.all([
		dbLoad(KIT_MANIFEST),
		dbLoad(STYLE_MANIFEST),
	]);
	let restored = false;

	// Kits. Sem manifesto = versão antiga, que guardava só um kit sob a chave 'kit'.
	const kitKeys = Array.isArray(kitManifest) ? kitManifest : [LEGACY_KIT_KEY];
	for (const key of kitKeys) {
		const kf = await dbLoad(key);
		if (!kf) continue;
		setStatus('Restaurando kits da última sessão...');
		if (await loadKitFile(kf, key, false)) restored = true;
	}
	if (state.kits.length > 0) updateKitSelect(); // monta os selects (e decodifica) uma vez só

	// Styles. Sem manifesto (null) = versão antiga: varredura sequencial style:0, style:1...
	let styleKeys = styleManifest;
	if (!Array.isArray(styleKeys)) {
		styleKeys = [];
		for (let i = 0; await dbLoad(`style:${i}`); i++) styleKeys.push(`style:${i}`);
	}
	for (const key of styleKeys) {
		const sf = await dbLoad(key);
		if (!sf) continue;
		setStatus(`Restaurando style ${key}...`);
		if (await loadStyleFile(sf, key)) restored = true;
	}

	if (state.styles.length > 0) {
		const savedActive = await dbLoad(STYLE_ACTIVE);
		const targetIdx = (Number.isInteger(savedActive) && savedActive >= 0 && savedActive < state.styles.length)
			? savedActive : state.styles.length - 1;
		applyStyle(targetIdx);
		document.getElementById('style-select').value = targetIdx;
	}

	if (!restored) setStatus('Carregue um .kit e um .style para começar.');
}
