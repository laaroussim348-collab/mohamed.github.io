// sw-tiles.js — Service Worker : mise en cache de TOUTES les tuiles satellite
// (Google Hybrid, Esri, OSM) même sans support CORS.
// Doit être déployé dans le même dossier que le fichier HTML sur GitHub Pages.

const CACHE_NAME = 'satellite-tiles-v2';

// Hôtes de tuiles à intercepter
const TILE_HOSTS = new Set([
  'mt0.google.com','mt1.google.com','mt2.google.com','mt3.google.com',
  'server.arcgisonline.com',
  'a.tile.openstreetmap.org','b.tile.openstreetmap.org','c.tile.openstreetmap.org'
]);

function isTile(url) {
  try { return TILE_HOSTS.has(new URL(url).hostname); }
  catch(e) { return false; }
}

// Installation : prendre le contrôle immédiatement
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// Interception de chaque requête réseau
self.addEventListener('fetch', e => {
  if (!isTile(e.request.url)) return;   // Ignorer tout sauf les tuiles

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      // 1. Chercher dans le cache
      cache.match(e.request.url).then(cached => {
        if (cached) return cached;   // ← Servi depuis le cache (hors ligne OK)

        // 2. Pas en cache : télécharger (mode no-cors = fonctionne pour Google !)
        return fetch(new Request(e.request.url, {
          method: 'GET',
          mode: 'no-cors',      // Bypass CORS — on reçoit une réponse "opaque"
          credentials: 'omit'
        })).then(resp => {
          // Stocker la réponse (même opaque) pour la prochaine fois
          if (resp && (resp.ok || resp.type === 'opaque')) {
            cache.put(e.request.url, resp.clone());
          }
          return resp;
        }).catch(() => {
          // Hors ligne et pas en cache → réponse vide (tuile grise)
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    )
  );
});

// Messages depuis la page (pré-téléchargement, comptage, suppression)
self.addEventListener('message', async e => {
  const cache = await caches.open(CACHE_NAME);
  const client = e.source;

  // ── Pré-téléchargement d'une liste d'URLs de tuiles ──
  if (e.data?.type === 'PRECACHE') {
    const urls = e.data.urls || [];
    let done = 0;
    for (const url of urls) {
      // Déjà en cache → passer
      if (await cache.match(url)) { done++; continue; }
      try {
        const resp = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
        if (resp) await cache.put(url, resp);
      } catch(err) { /* continuer même si une tuile échoue */ }
      done++;
      // Envoyer la progression toutes les 15 tuiles
      if (done % 15 === 0) {
        client.postMessage({ type: 'PROGRESS', done, total: urls.length });
      }
    }
    const allKeys = await cache.keys();
    client.postMessage({ type: 'DONE', done, total: urls.length, cached: allKeys.length });
  }

  // ── Compter les tuiles en cache ──
  if (e.data?.type === 'COUNT') {
    const keys = await cache.keys();
    client.postMessage({ type: 'COUNT', count: keys.length });
  }

  // ── Vider le cache ──
  if (e.data?.type === 'CLEAR') {
    await caches.delete(CACHE_NAME);
    client.postMessage({ type: 'CLEARED' });
  }
});
