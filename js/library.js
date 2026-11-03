// ==================================================================================================
// LIBRARY — gerencia (lista e exclui) os styles e kits importados
// ==================================================================================================
// Antes, tudo que era importado ficava salvo no IndexedDB para sempre (só dava pra limpar pelo F12
// no desktop). Aqui ficam: (1) as regras de persistência — cada arquivo é salvo sob uma chave
// própria e uma "lista de chaves" (manifesto) diz o que restaurar — e (2) a tela "Biblioteca",
// que permite excluir itens, inclusive no celular.

import { state } from './state.js';
import { dbSave, dbDelete } from './persistence.js';
import { removeStyle } from './style-loader.js';
import { removeKit } from './kit-loader.js';

export const STYLE_MANIFEST = 'style:manifest';
export const KIT_MANIFEST = 'kit:manifest';
export const STYLE_ACTIVE = 'style:active';
export const LEGACY_KIT_KEY = 'kit';   // versões antigas guardavam só 1 kit, sob esta chave

// ---------- Persistência ----------

/** Grava a lista de chaves dos styles carregados e qual está ativo. */
export async function syncStyleManifest() {
	await dbSave(STYLE_MANIFEST, state.styles.map(s => s.dbKey).filter(Boolean));
	await dbSave(STYLE_ACTIVE, state.activeStyleIndex);
}

/** Grava a lista de chaves dos kits carregados. */
export async function syncKitManifest() {
	await dbSave(KIT_MANIFEST, state.kits.map(k => k.dbKey).filter(Boolean));
}

/** Salva o arquivo de um style recém-importado e atualiza o manifesto. */
export async function saveStyle(entry, file) {
	await dbSave(entry.dbKey, file);
	await syncStyleManifest();
}

/** Salva o arquivo de um kit recém-importado e atualiza o manifesto. */
export async function saveKit(entry, file) {
	await dbSave(entry.dbKey, file);
	await syncKitManifest();
}

// ---------- Exclusão ----------

export async function deleteStyle(index) {
	const entry = state.styles[index];
	if (!entry) return;
	removeStyle(index);
	if (entry.dbKey) await dbDelete(entry.dbKey);
	await syncStyleManifest();
}

export async function deleteKit(index) {
	const entry = state.kits[index];
	if (!entry) return;
	removeKit(index);
	if (entry.dbKey) await dbDelete(entry.dbKey);
	await syncKitManifest();
}

// ---------- Tela ----------

const $ = id => document.getElementById(id);

function buildRow(name, meta, onDelete) {
	const li = document.createElement('li');
	li.className = 'library-row';

	const label = document.createElement('span');
	label.className = 'library-name';
	label.textContent = name;
	label.title = name;
	li.appendChild(label);

	if (meta) {
		const m = document.createElement('span');
		m.className = 'library-meta';
		m.textContent = meta;
		li.appendChild(m);
	}

	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'library-del';
	btn.title = `Excluir ${name}`;
	btn.textContent = 'Excluir';
	let timer = null;
	btn.addEventListener('click', async () => {
		// Duas etapas: evita apagar sem querer num toque acidental (principalmente no celular).
		if (!btn.classList.contains('armed')) {
			btn.classList.add('armed');
			btn.textContent = 'Confirmar?';
			timer = setTimeout(() => {
				btn.classList.remove('armed');
				btn.textContent = 'Excluir';
			}, 3000);
			return;
		}
		clearTimeout(timer);
		btn.disabled = true;
		await onDelete();
		renderLibrary();
	});
	li.appendChild(btn);
	return li;
}

function emptyRow(text) {
	const li = document.createElement('li');
	li.className = 'library-empty';
	li.textContent = text;
	return li;
}

/** Redesenha as duas listas (styles e kits) a partir do `state`. */
export function renderLibrary() {
	const styles = $('library-styles');
	const kits = $('library-kits');
	styles.replaceChildren();
	kits.replaceChildren();

	if (state.styles.length === 0) styles.appendChild(emptyRow('Nenhum style carregado'));
	state.styles.forEach((s, i) => {
		styles.appendChild(buildRow(s.name, i === state.activeStyleIndex ? 'em uso' : '', () => deleteStyle(i)));
	});

	const used = new Set([
		$('kit-select-rhythm').value.split(':')[0],
		$('kit-select-sub').value.split(':')[0],
	]);
	if (state.kits.length === 0) kits.appendChild(emptyRow('Nenhum kit carregado'));
	state.kits.forEach((k, i) => {
		const meta = [`${k.sfzNames.length} sfz`, used.has(String(i)) ? 'em uso' : ''].filter(Boolean).join(' · ');
		kits.appendChild(buildRow(k.name, meta, () => deleteKit(i)));
	});
}

export function openLibrary() {
	renderLibrary();
	$('library-modal').style.display = 'flex';
}

export function closeLibrary() {
	$('library-modal').style.display = 'none';
}
