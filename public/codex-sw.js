// Cache "network-first" du Codex : toujours chercher le réseau pour garantir
// des données utilisateur fraîches (réactions, notes, maturité…) ; le cache
// ne sert que de fallback hors-ligne si le réseau est indisponible.
// Ne touche jamais aux images (voir la garde `mode !== "navigate"` ci-dessous),
// ni à la Galerie, au Quizz, aux Liens ou à la BD (voir isCodexPage) :
// ce service worker n'intercepte STRICTEMENT que les navigations GET
// vers les pages Codex listées.
//
// Enregistré uniquement depuis partials/codex-offline.ejs (inclus sur
// wiki-index/wiki/wiki-detail seulement) avec scope "/wiki".
//
// Changer CACHE_NAME purge automatiquement l'ancien cache au prochain
// déploiement (voir "activate") : à incrémenter si cette logique change.
const CACHE_NAME = "codex-cache-v2";
const MAX_ENTRIES = 10; // pages en cache max : courante + adjacentes + récentes

function isCodexPage(url) {
  if (url.origin !== self.location.origin) return false;
  return /^\/wiki\/?$/.test(url.pathname)
    || /^\/wiki\/tous\/?$/.test(url.pathname)
    || /^\/wiki\/categorie\/[^/]+\/?$/.test(url.pathname)
    || /^\/wiki\/\d+\/?$/.test(url.pathname);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Pas de suivi d'accès natif dans l'API Cache : approximation simple, on
// retire les entrées les plus anciennes (ordre d'insertion) au-delà de
// MAX_ENTRIES plutôt qu'une vraie LRU — suffisant pour rester "strictement
// limité", pas besoin de plus pour quelques pages.
async function trimCache(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function notifyClients(ok) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((c) => c.postMessage({ type: "codex-sw-status", ok: ok }));
}

async function handleCodexNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  // Stratégie network-first : toujours essayer le réseau pour garantir
  // des données utilisateur fraîches (réactions, notes, maturité…).
  // Le cache ne sert que de fallback hors-ligne.
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await trimCache(cache);
      notifyClients(true);
    } else {
      notifyClients(false);
    }
    return response;
  } catch (_) {
    // Réseau indisponible : fallback sur le cache hors-ligne
    const cached = await cache.match(request);
    notifyClients(false);
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.mode !== "navigate") return; // jamais les images/CSS/JS/appels API
  const url = new URL(request.url);
  if (!isCodexPage(url)) return; // jamais Galerie/Quizz/Liens/BD
  event.respondWith(handleCodexNavigation(request));
});

// Vidage à distance (voir codex-offline.ejs) : déclenché à la déconnexion
// ou au changement de profil connecté sur ce navigateur, pour ne jamais
// montrer à quelqu'un d'autre une page enregistrée pendant qu'un autre
// profil était connecté.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "codex-clear-cache") {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});
