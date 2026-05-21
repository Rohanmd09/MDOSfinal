const CACHE_NAME = 'lifeos-v1';

// Core app shell files to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/mddos.css',
  '/mddos.js',
  '/manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for same-origin, cache fallback
self.addEventListener('fetch', event => {
  // Skip non-GET and cross-origin requests (CDN fonts, icons, etc.)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Network first, fall back to cache for the app shell
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // CDN resources (Tailwind, fonts, Phosphor icons, Chart.js) use default browser behaviour
});
