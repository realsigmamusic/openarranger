// ==================================================================================================
// PERSISTENCE — armazenamento local (IndexedDB) da última sessão
// ==================================================================================================
// Guarda os arquivos .kit/.style carregados para que o app volte do jeito que estava
// (útil porque é um PWA offline, sem servidor).

import { DB_NAME, DB_VERSION, DB_STORE } from './config.js';

let dbPromise = null;

/** Abre a conexão com o IndexedDB uma única vez e reutiliza (singleton). */
function openDB() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE);
		req.onsuccess = e => resolve(e.target.result);
		req.onerror = e => { dbPromise = null; reject(e.target.error); };
	});
	return dbPromise;
}

/** Salva um valor (Blob, número, array...) sob uma chave. Nunca lança erro (só avisa no console). */
export async function dbSave(key, value) {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, 'readwrite');
			tx.objectStore(DB_STORE).put(value, key);
			tx.oncomplete = resolve;
			tx.onerror = e => reject(e.target.error);
		});
	} catch (e) { console.warn('dbSave falhou:', e); }
}

/** Lê um valor salvo por chave. Retorna null se não existir ou se der erro. */
export async function dbLoad(key) {
	try {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, 'readonly');
			const req = tx.objectStore(DB_STORE).get(key);
			req.onsuccess = e => resolve(e.target.result ?? null);
			req.onerror = e => reject(e.target.error);
		});
	} catch (e) { console.warn('dbLoad falhou:', e); return null; }
}
