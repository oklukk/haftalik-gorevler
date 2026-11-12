// Increase VERSION whenever an app-shell file changes.
const VERSION = 'v5';
const PREFIX = `haftalik-gorevler:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = [
  './', './index.html', './styles.css', './app.js', './dates.js', './storage.js',
  './icons.js', './backup.js', './settings.js', './updates.js', './version.js',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // An update waits until the previous app is closed, keeping modules consistent.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })))));
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


// Activation is user initiated and only safe with a single application window.
// Multiple open windows retain the old worker until the user closes them.
self.addEventListener('message', event => {
  if (event.data?.type !== 'ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(self.registration.scope));
    if (windows.length !== 1 || windows[0].id !== event.source?.id) {
      event.ports[0]?.postMessage({ type: 'UPDATE_BLOCKED' });
      return;
    }
    await self.skipWaiting();
  })());
});
