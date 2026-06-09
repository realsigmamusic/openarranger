const CACHE_NAME = 'v26.06.09';
const ASSETS = [
	'./',
	'./index.html',
	'./main.js',
	'./manifest.json',
	'./maskable_icon_x512.png'
];

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys().then((keyList) => {
			return Promise.all(
				keyList.map((key) => {
					if (key !== CACHE_NAME) return caches.delete(key);
				})
			);
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (e) => {
	e.respondWith(
		caches.match(e.request).then((cachedResponse) => {
			const fetchPromise = fetch(e.request).then((networkResponse) => {
				caches.open(CACHE_NAME).then((cache) => {
					cache.put(e.request, networkResponse.clone());
				});
				return networkResponse;
			});

			return cachedResponse || fetchPromise;
		})
	);
});