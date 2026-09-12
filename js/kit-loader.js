// ==================================================================================================
// KIT LOADER — carrega arquivos .kit (um .zip com .sfz + samples) e decodifica os áudios
// ==================================================================================================

import { state } from './state.js';
import { ensureJSZip } from './utils.js';
import { setStatus } from './ui.js';
import { parseSFZ } from './sfz-parser.js';
import { initAudio } from './sample-player.js';

/** Lê um arquivo .kit, extrai os .sfz disponíveis e adiciona/atualiza a lista de kits carregados. */
export async function loadKitFile(file) {
	await ensureJSZip();
	setStatus(`Carregando kit: ${file.name}...`);
	initAudio();

	const zip = await JSZip.loadAsync(file);
	const sfzNames = Object.keys(zip.files)
		.filter(f => f.endsWith('.sfz'))
		.sort();

	if (sfzNames.length === 0) { setStatus('Kit inválido: nenhum .sfz encontrado'); return; }

	const name = file.name.replace(/\.kit$/i, '');
	const entry = { name, sfzNames, zip };

	const existing = state.kits.findIndex(k => k.name === name);
	let targetIndex;
	if (existing >= 0) { state.kits[existing] = entry; targetIndex = existing; }
	else { state.kits.push(entry); targetIndex = state.kits.length - 1; }

	updateKitSelect(targetIndex);
}

/** Decodifica os samples de um SFZ específico e os disponibiliza para o canal Rhythm ou SubRhythm. */
export async function applyKit(kitIndex, sfzIndex = 0, role = 'rhythm') {
	if (kitIndex < 0 || kitIndex >= state.kits.length) return;

	const buffersObj = role === 'rhythm' ? state.kitBuffers : state.kitBuffersSub;
	state.activeKitIndex = kitIndex;
	if (role === 'rhythm') state.activeSfzIndex = sfzIndex;
	else state.activeSfzIndexSub = sfzIndex;

	const kit = state.kits[kitIndex];
	const sfzEntry = kit.zip.files[kit.sfzNames[sfzIndex]];
	if (!sfzEntry) return;

	Object.keys(buffersObj).forEach(k => delete buffersObj[k]);

	const mapping = parseSFZ(await sfzEntry.async('string'));
	let loaded = 0;

	for (const [note, path] of Object.entries(mapping)) {
		const targetName = path.replace(/\\/g, '/').split('/').pop().toLowerCase();
		const entryKey = Object.keys(kit.zip.files).find(k => k.toLowerCase().endsWith(targetName));
		const entry = kit.zip.files[entryKey];
		if (!entry) { console.warn('Sample não encontrado:', path); continue; }
		try {
			buffersObj[note] = await state.audioCtx.decodeAudioData(await entry.async('arraybuffer'));
			loaded++;
		} catch (e) { console.warn('Erro ao decodificar:', path, e); }
	}

	const label = `${kit.sfzNames[sfzIndex].replace(/\.sfz$/i, '').split('/').pop()}`;
	if (role === 'rhythm') { state.kitLoaded = true; state.kitName = label; }
	else { state.kitLoadedSub = true; state.kitNameSub = label; }
	setStatus(`${label} (${role}) - ${loaded} samples`);
}

/** Reconstrói os <select> de kit Rhythm/SubRhythm com todos os SFZ de todos os kits carregados. */
export function updateKitSelect(targetIndex = -1) {
	const selRhythm = document.getElementById('kit-select-rhythm');
	const selSub = document.getElementById('kit-select-sub');
	selRhythm.innerHTML = '';
	selSub.innerHTML = '';

	if (state.kits.length === 0) {
		for (const sel of [selRhythm, selSub]) {
			const opt = document.createElement('option');
			opt.value = ''; opt.textContent = 'Load kit';
			sel.appendChild(opt);
		}
		return;
	}

	// Coleta todas as opções em ordem alfabética por label
	const allOptions = [];
	state.kits.forEach((kit, ki) => {
		const sorted = kit.sfzNames
			.map((sfz, si) => ({
				ki, si,
				label: kit.sfzNames.length > 1
					? sfz.replace(/\.sfz$/i, '').split('/').pop()
					: kit.name
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
		allOptions.push(...sorted);
	});

	for (const sel of [selRhythm, selSub]) {
		for (const { ki, si, label } of allOptions) {
			const opt = document.createElement('option');
			opt.value = `${ki}:${si}`;
			opt.textContent = label;
			sel.appendChild(opt);
		}
	}

	// Rhythm → primeiro SFZ; SubRhythm → segundo SFZ se existir, senão o mesmo
	const first = allOptions[0];
	const second = allOptions.length > 1 ? allOptions[1] : allOptions[0];

	selRhythm.value = `${first.ki}:${first.si}`;
	selSub.value = `${second.ki}:${second.si}`;
	applyKit(first.ki, first.si, 'rhythm');
	applyKit(second.ki, second.si, 'sub');
}
