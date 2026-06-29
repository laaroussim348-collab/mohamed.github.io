// sw-tiles.js — Service Worker : cache tuiles satellite (Google Hybrid, OSM)
// Téléchargement parallèle (8 simultanés) + timeout par tuile.

const CACHE_NAME = 'sat-tiles-v3';

const TILE_HOSTS = new Set([
  'mt0.google.com','mt1.google.com','mt2.google.com','mt3.google.com',
  'server.arcgisonline.com',
  'a.tile.openstreetmap.org','b.tile.openstreetmap.org','c.tile.openstreetmap.org'
]);

function isTile(url) {
  try { return TILE_HOSTS.has(new URL(url).hostname); } catch(e) { return false; }
}

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// ── Interception automatique de chaque tuile chargée par la carte ──
self.addEventListener('fetch', e => {
  if (!isTile(e.request.url)) return;
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request.url).then(hit => {
        if (hit) return hit;                         // ← depuis le cache
        return fetch(new Request(e.request.url, {
          mode: 'no-cors', credentials: 'omit'
        })).then(r => {
          if (r && (r.ok || r.type === 'opaque')) cache.put(e.request.url, r.clone());
          return r;
        }).catch(() => new Response('', { status: 503 }));
      })
    )
  );
});

// ── Messages depuis la page ──
self.addEventListener('message', async e => {
  const cache  = await caches.open(CACHE_NAME);
  const client = e.source;
  if (!client) return;

  // ── Pré-téléchargement en parallèle ──────────────────────────────────
  if (e.data && e.data.type === 'PRECACHE') {
    const urls = e.data.urls || [];
    const CONCURRENCY = 8;   // 8 téléchargements simultanés
    const TILE_TIMEOUT = 7000; // 7 s max par tuile

    let done = 0, errors = 0;

    const fetchOne = async (url) => {
      // Déjà en cache → ignorer
      if (await cache.match(url)) { done++; return; }
      try {
        // Timeout via Promise.race
        const resp = await Promise.race([
          fetch(url, { mode: 'no-cors', credentials: 'omit' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TILE_TIMEOUT))
        ]);
        if (resp instanceof Response) await cache.put(url, resp);
        done++;
      } catch(ex) {
        errors++;
        done++;
      }
      // Envoyer la progression toutes les 10 tuiles
      if (done % 10 === 0) {
        client.postMessage({ type: 'PROGRESS', done, total: urls.length, errors });
      }
    };

    // Traiter par lots de CONCURRENCY
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(fetchOne));
      // Vérifier si annulé
      if (e.data._cancel) break;
    }

    const allKeys = await cache.keys();
    client.postMessage({
      type: 'DONE',
      done: done - errors,
      errors,
      total: urls.length,
      cached: allKeys.length
    });
  }

  // ── Compter les tuiles en cache ───────────────────────────────────────
  if (e.data && e.data.type === 'COUNT') {
    const keys = await cache.keys();
    client.postMessage({ type: 'COUNT', count: keys.length });
  }

  // ── Vider le cache ────────────────────────────────────────────────────
  if (e.data && e.data.type === 'CLEAR') {
    await caches.delete(CACHE_NAME);
    client.postMessage({ type: 'CLEARED' });
  }
});
