const CACHE_NAME = 'guardian-v1';
const CACHE_PREFIX = 'guardian-';
const STATIC_FILE_PATTERN = /\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|otf|png|svg|ttf|webp|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.add('/');
    } catch (error) {
      console.error('No se pudo guardar la página inicial en caché:', error);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cachedPage = await caches.match(request);
        if (cachedPage) return cachedPage;

        const cachedRoot = await caches.match('/');
        if (cachedRoot) return cachedRoot;

        return Response.error();
      }
    })());
    return;
  }

  if (!STATIC_FILE_PATTERN.test(url.pathname)) return;

  event.respondWith((async () => {
    const cachedResponse = await caches.match(request);
    const networkResponse = fetch(request).then(async (response) => {
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    return cachedResponse ?? await networkResponse ?? Response.error();
  })());
});
