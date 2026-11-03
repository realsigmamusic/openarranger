// ==================================================================================================
// KIT LOADER — carrega arquivos .kit (um .zip com .sfz + samples) e decodifica os áudios
// ==================================================================================================

import { state } from './state.js';
import { ensureJSZip, newDbKey } from './utils.js';
import { setStatus } from './ui.js';
import { parseSFZ } from './sfz-parser.js';
import { initAudio } from './sample-player.js';

/**
 * Lê um arquivo .kit, extrai os .sfz disponíveis e adiciona/atualiza a lista de kits carregados.
 * Retorna a entrada criada (ou null se o kit for inválido).
 * - dbKey: chave sob a qual o arquivo está salvo no IndexedDB (ao restaurar a sessão).
 * - select: false = não reconstrói os selects (quem chama faz isso uma vez só no final).
 */
export async function loadKitFile(file, dbKey = null, select = true) {
	await ensureJSZip();
	setStatus(`Carregando kit: ${file.name}...`);
	initAudio();

	const zip = await JSZip.loadAsync(file);
	const sfzNames = Object.keys(zip.files)
		.filter(f => f.endsWith('.sfz'))
		.sort();

	if (sfzNames.length === 0) { setStatus('Kit inválido: nenhum .sfz encontrado'); return null; }

	const name = file.name.replace(/\.kit$/i, '');
	const entry = { name, sfzNames, zip, dbKey };

	const existing = state.kits.findIndex(k => k.name === name);
	let targetIndex;
	if (existing >= 0) {
		entry.dbKey = state.kits[existing].dbKey ?? dbKey; // mesmo nome = substitui (e reaproveita a chave salva)
		state.kits[existing] = entry; targetIndex = existing;
	} else {
		state.kits.push(entry); targetIndex = state.kits.length - 1;
	}
	if (!entry.dbKey) entry.dbKey = newDbKey('kit');

	if (select) updateKitSelect(targetIndex);
	return entry;
}

/**
 * Remove um kit da lista (só da memória — quem chama apaga do IndexedDB, ver library.js).
 * Se o kit removido era o que estava tocando em Rhythm/SubRhythm, esse canal cai para o padrão;
 * quem não foi afetado mantém a seleção (os samples já decodificados continuam valendo).
 */
export function removeKit(index) {
	if (index < 0 || index >= state.kits.length) return;

	const keep = {};
	for (const [role, id] of [['rhythm', 'kit-select-rhythm'], ['sub', 'kit-select-sub']]) {
		const [ki, si] = document.getElementById(id).value.split(':').map(Number);
		keep[role] = (!isNaN(ki) && ki !== index && state.kits[ki]) ? { entry: state.kits[ki], si } : null;
	}

	state.kits.splice(index, 1);

	if (state.kits.length === 0) {
		for (const buffers of [state.kitBuffers, state.kitBuffersSub]) {
			Object.keys(buffers).forEach(k => delete buffers[k]);
		}
		state.kitLoaded = false; state.kitLoadedSub = false;
		state.kitName = 'Load drumkit'; state.kitNameSub = 'Load drumkit';
		state.activeKitIndex = -1; state.activeSfzIndex = 0; state.activeSfzIndexSub = 0;
		updateKitSelect();
		setStatus('Nenhum kit carregado.');
		return;
	}
	updateKitSelect(-1, keep);
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

/**
 * Reconstrói os <select> de kit Rhythm/SubRhythm com todos os SFZ de todos os kits carregados.
 * `keep` ({rhythm, sub}: { entry, si } ou null) preserva a seleção atual de cada canal, se informado.
 */
export function updateKitSelect(targetIndex = -1, keep = null) {
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

	const pick = (role, fallback) => {
		const k = keep?.[role];
		const ki = k ? state.kits.indexOf(k.entry) : -1;
		return ki >= 0 ? { ki, si: k.si, kept: true } : { ...fallback, kept: false };
	};
	const r = pick('rhythm', first);
	const s = pick('sub', second);

	selRhythm.value = `${r.ki}:${r.si}`;
	selSub.value = `${s.ki}:${s.si}`;
	if (r.kept) { state.activeSfzIndex = r.si; } else applyKit(r.ki, r.si, 'rhythm');
	if (s.kept) { state.activeSfzIndexSub = s.si; } else applyKit(s.ki, s.si, 'sub');
}
