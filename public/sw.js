const CACHE_NAME = 'budget-buddy-v1';
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests — let POST/PATCH/DELETE (all of this app's mutations) pass through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch API routes. Financial data must always come straight from the network, never from cache.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first, falling back to the cached offline page only if the network fails.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Next.js's content-hashed static build output: cache-first, since a new deploy means new filenames.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else (images, fonts, API-adjacent assets not already excluded above): pass through to the network as normal.
});
