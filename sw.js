const CACHE = 'cricket-replay-v2';
const BASE = '/cricket-replay';
const ASSETS = [BASE + '/', BASE + '/index.html', BASE + '/styles.css', BASE + '/app.js', BASE + '/recorder.js', BASE + '/playback.js', BASE + '/storage.js', BASE + '/relay.js', BASE + '/manifest.json', BASE + '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Don't intercept non-GET or cross-origin
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
