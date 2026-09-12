/*
 * Fantasy GM service worker.
 *
 * DELIBERATELY CONSERVATIVE. This app's entire value is telling you what is
 * true *right now*, so it never serves a cached page or a cached API response:
 * a stale lineup recommendation is worse than no recommendation at all.
 *
 * What it does cache: static build assets and icons, so the shell loads fast.
 * What it does when offline: shows an honest "you are offline" response rather
 * than yesterday's data.
 */
const STATIC_CACHE = 'fantasy-gm-static-v1';
const STATIC_ASSETS = ['/icon.svg', '/icon-maskable.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache data: pages and API responses always go to the network.
  const isData = url.pathname.startsWith('/api/') || request.mode === 'navigate';
  if (isData) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<body style="font-family:system-ui;background:#0d1117;color:#e6edf3;padding:2rem">' +
              '<h1 style="font-size:1.25rem">You are offline</h1>' +
              '<p style="color:#8b949e">Fantasy GM will not show you stale lineup advice. Reconnect and reload.</p></body>',
            { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 },
          ),
      ),
    );
    return;
  }

  // Static assets: cache-first, since they are content-hashed by the build.
  if (url.pathname.startsWith('/_next/static/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
