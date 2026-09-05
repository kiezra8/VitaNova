/**
 * VitaNova Service Worker
 * Provides full offline functionality by caching all app assets
 */

const CACHE_NAME = 'vitanova-v2023-1';
const STATIC_CACHE = 'vitanova-static-v1';
const DATA_CACHE = 'vitanova-data-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/search.js',
  './js/symptom-checker.js',
  './js/dispensary.js',
  './js/app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap',
];

const DATA_ASSETS = [
  './data/diseases.json',
  './data/symptom_map.json',
  './data/chapters.json',
  './data/dispensary.json',
];

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VitaNova Service Worker...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Some static assets failed to cache:', err);
        });
      }),
      caches.open(DATA_CACHE).then(cache => {
        console.log('[SW] Caching data assets');
        return cache.addAll(DATA_ASSETS).catch(err => {
          console.warn('[SW] Some data assets failed to cache:', err);
        });
      }),
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DATA_CACHE && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activated');
      return self.clients.claim();
    })
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Strategy: Data files — Cache-first, background update
  if (url.pathname.includes('/data/')) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  // Strategy: Google Fonts — Cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy: App shell — Network-first with cache fallback
  event.respondWith(networkFirstWithFallback(request, STATIC_CACHE));
});

// ── Strategies ─────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Resource not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

async function networkFirstWithFallback(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback to index.html for navigation requests
    if (request.mode === 'navigate') {
      const index = await caches.match('./index.html');
      if (index) return index;
    }
    return new Response('Offline — Please check your connection', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ── Background Sync (for future use) ─────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
