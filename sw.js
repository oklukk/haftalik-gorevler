// Increase VERSION whenever an app-shell file changes.
const VERSION = 'v2';
const PREFIX = `haftalik-gorevler:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = [
  './', './index.html', './styles.css', './app.js', './dates.js', './storage.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // An update waits until the previous app is closed, keeping modules consistent.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return cache.match(new URL('./index.html', self.registration.scope).href);
    return fetch(event.request);
  })());
});
