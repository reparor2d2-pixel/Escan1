const CACHE = 'evaluacam-v5-2-1';
const ASSETS = ['./', './index.html', './styles.css?v=5.2.1', './app.js?v=5.2.1', './cloud-sync.js?v=5.2.1', './result-images.js?v=5.2.1', './auth.js?v=5.2.1', './google-config.js?v=5.2.1', './manifest.json', './icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Nunca interceptar Apps Script, Google Identity ni cualquier API externa.
  // Tampoco interceptar POST/PUT/DELETE. Deben ir directamente a Internet.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const network = await fetch(request, { cache: 'no-store' });
      if (network && network.ok) {
        const copy = network.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return network;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
