const CACHE_NAME = '2.4.0';
const ASSETS = [
	'./',
	'./index.html',
	'./style.css',
	'./js/app.js',
	'./js/config.js',
	'./js/events.js',
	'./js/kit-loader.js',
	'./js/library.js',
	'./js/midi-parser.js',
	'./js/midi-writer.js',
	'./js/persistence.js',
	'./js/recorder.js',
	'./js/sample-player.js',
	'./js/scheduler.js',
	'./js/session.js',
	'./js/sfz-parser.js',
	'./js/state.js',
	'./js/style-engine.js',
	'./js/style-loader.js',
	'./js/tap-tempo.js',
	'./js/ui.js',
	'./js/utils.js',
	'./manifest.json',
	'./assets/maskable_icon_x512.png',
	'./assets/vendor/jszip.min.js',
	'./assets/Doto-Black.ttf'
];

self.addEventListener('install', (e) => {
	self.skipWaiting();
	e.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('Arquivos em cache com sucesso!');
			return cache.addAll(ASSETS);
		})
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys().then((keyList) => {
			return Promise.all(
				keyList.map((key) => {
					// Deleta caches velhos se o CACHE_NAME mudou
					if (key !== CACHE_NAME) return caches.delete(key);
				})
			);
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (e) => {
	// Ignora requisições de extensões do navegador ou coisas que não são GET
	if (e.request.method !== 'GET') return;

	// Cache Primeiro, Rede depois.
	e.respondWith(
		caches.match(e.request).then((cachedResponse) => {
			// Se achou no cache, retorna NA HORA.
			if (cachedResponse) {
				return cachedResponse; 
			}
			
			// Se não tem no cache, busca na internet (e já salva pro futuro)
			return fetch(e.request).then((networkResponse) => {
				return caches.open(CACHE_NAME).then((cache) => {
					cache.put(e.request, networkResponse.clone());
					return networkResponse;
				});
			}).catch((erro) => {
				console.error('Offline total e arquivo não encontrado no cache:', e.request.url);
			});
		})
	);
});