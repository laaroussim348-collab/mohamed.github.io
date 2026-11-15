// Service Worker minimal — uniquement requis pour que Chrome/Brave considèrent
// cette page comme une PWA installable. On n'intercepte JAMAIS les requêtes
// réseau (pas de fetch handler) : l'app a besoin de toujours charger les
// dernières tuiles satellite, l'API Google Drive, et tout le reste normalement,
// exactement comme dans un onglet de navigateur classique. Un fetch handler ici
// (même "passthrough") peut faire échouer des requêtes de navigation au premier
// lancement de la PWA installée et déclencher à tort l'écran "Hors connexion".
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
