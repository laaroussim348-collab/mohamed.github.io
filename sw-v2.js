// Service Worker minimal — requis pour que Chrome/Brave proposent l'installation
// de cette page comme PWA. Chrome exige spécifiquement la présence d'un gestionnaire
// fetch pour afficher l'option "Installer l'application" (sans lui, le menu
// d'installation reste invisible, même si le manifest est valide).
// On laisse cependant passer toutes les requêtes vers le réseau normalement — pas de
// cache agressif, l'app a besoin des dernières tuiles satellite, de l'API Drive, etc.
// Le try/catch est essentiel : sans lui, le moindre raté réseau (notamment au tout
// premier lancement après installation) déclenche l'écran "Hors connexion" du
// navigateur au lieu de simplement laisser passer l'erreur normalement.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // En cas d'échec réseau, on ne bloque jamais : on relance simplement la requête
      // d'origine (le navigateur affichera son propre message d'erreur réseau standard
      // si besoin, plutôt qu'un écran "Hors connexion" déclenché par le Service Worker).
      return fetch(event.request);
    })
  );
});
