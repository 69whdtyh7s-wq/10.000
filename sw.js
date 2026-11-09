// Service worker del 10.000 — permite usar la app sin conexión.
// Estrategia: con internet carga la versión más nueva (y la guarda);
// sin internet (o si la red tarda más de 3 s) usa la copia guardada.
const CACHE = 'tablero-10000-offline-v1';
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const scope = self.registration.scope;
    // Guarda la raíz y el index.html (si alguno no existe, se ignora)
    await Promise.all([scope, scope + 'index.html'].map(async (u) => {
      try {
        const res = await fetch(u, { cache: 'reload' });
        if (res && res.ok) await cache.put(u, res.clone());
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('tablero-10000-')).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La página avisa con su propia URL para guardarla (por si el archivo no se llama index.html)
self.addEventListener('message', (event) => {
  const d = event.data;
  if (d && d.type === 'CACHE_URL' && typeof d.url === 'string') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        const res = await fetch(d.url, { cache: 'reload' });
        if (res && res.ok) await cache.put(d.url, res.clone());
      } catch (e) {}
    })());
  }
});

function networkWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then((res) => { clearTimeout(t); resolve(res); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await networkWithTimeout(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const fallback = (await cache.match(self.registration.scope)) || (await cache.match(self.registration.scope + 'index.html'));
        if (fallback) return fallback;
      }
      return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
    }
  })());
});
