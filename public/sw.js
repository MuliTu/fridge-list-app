// public/sw.js
//
// Vanilla service worker (no Workbox, no bundling — served as-is).
// Scope: make the app SHELL (prerendered HTML + hashed JS/CSS/static assets)
// load instantly and work with no network. This app's real data
// (/groceries, /stock, /receipts, ...) comes from Firebase Realtime Database
// via onValue() WebSocket listeners in the browser — NOT fetch() calls — so
// this service worker CANNOT and does NOT attempt to make live data
// available offline. It only ever touches same-origin GET requests for the
// HTML shell and static build assets.

const CACHE_NAME = 'fridge-shell-v1';
const SHELL_CACHE_KEY = '/__shell';

// Offline fallback shown only when a navigation happens with no network AND
// nothing has ever been cached yet (i.e. the very first visit was offline).
// Hand-written, inline, Hebrew/RTL — matches this app's default language.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>אין חיבור לאינטרנט</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2f3d34;
    color: #f4f1e8;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-align: center;
    padding: 24px;
    box-sizing: border-box;
  }
  .box { max-width: 420px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 15px; color: #cfd3c9; line-height: 1.6; margin: 0; }
  button {
    margin-top: 20px;
    padding: 10px 20px;
    font-size: 15px;
    border: none;
    border-radius: 8px;
    background: #f4f1e8;
    color: #2f3d34;
    cursor: pointer;
  }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">📡</div>
    <h1>אין חיבור לאינטרנט</h1>
    <p>וטרם נטענה גרסה שמורה של האפליקציה. אנא התחבר לרשת ונסה שוב.</p>
    <button onclick="location.reload()">נסה שוב</button>
  </div>
</body>
</html>`;

// Extensions treated as cacheable static assets alongside anything under
// /assets/ (Vite's content-hashed bundle output directory).
const STATIC_ASSET_EXTENSIONS = [
  '.js',
  '.mjs',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
];

function isStaticAssetRequest(url) {
  if (url.pathname.startsWith('/assets/')) return true;
  return STATIC_ASSET_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener('install', () => {
  // No exhaustive precache list — hashed asset filenames aren't knowable
  // ahead of time. Just activate the new SW promptly.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any caches from a previous SW version.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever handle same-origin GET requests. Everything else (Firebase's
  // own domains, any cross-origin request, any non-GET request) passes
  // through completely untouched — no event.respondWith() call at all.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Anything else same-origin (e.g. same-origin API routes like
  // /api/scan-receipt) is left alone — not intercepted.
});

async function handleNavigate(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    // Clone before consuming, so we can both cache and return it.
    cache.put(SHELL_CACHE_KEY, networkResponse.clone());
    return networkResponse;
  } catch (err) {
    const cachedShell = await cache.match(SHELL_CACHE_KEY);
    if (cachedShell) return cachedShell;

    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const networkResponse = await fetch(request);
  // These are content-hashed by Vite, so cache-first is safe: a changed
  // file gets a new URL and will never collide with a stale cache entry.
  cache.put(request, networkResponse.clone());
  return networkResponse;
}
