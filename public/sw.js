/*
 * Service worker di Writly: tiene in cache l'app per aprirla anche senza rete.
 *
 * - Script, stili, dizionario, font e icone (contenuto che non cambia a parità di nome):
 *   prima la cache, poi la rete, e si ricorda quel che arriva.
 * - Pagine: prima la rete (se risponde entro pochi secondi, anche con rete lenta in treno),
 *   altrimenti l'ultima copia vista. Una pagina in cache porta con sé la sua CSP e il suo nonce.
 * - Le chiamate alle API (tranne le immagini delle mappe) e i dati di navigazione di Next.js
 *   non passano da qui: capitoli, schede e struttura stanno nella copia scaricata nel browser
 *   (IndexedDB), non nella cache delle pagine.
 *
 * Le cache si chiamano «writly-…»: l'uscita dall'account le svuota (clearOfflineData).
 */
const STATIC = "writly-static-v1";
const PAGES = "writly-pages-v1";
const PAGE_WAIT_MS = 3500;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("writly-") && name !== STATIC && name !== PAGES) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

const isStaticPath = (path) =>
  path.startsWith("/_next/static/") || path.startsWith("/fonts/") || path.startsWith("/dictionaries/") || path.startsWith("/icons/");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Solo le immagini delle mappe, di sola lettura, si tengono: rete prima, copia se manca la rete.
  if (/^\/api\/progetti\/[^/]+\/[^/]+\/immagine$/.test(url.pathname)) {
    event.respondWith(imageNetworkFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticPath(url.pathname)) {
    event.respondWith(staticFirst(request));
    return;
  }
  const wantsPage = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  if (wantsPage) event.respondWith(pageFirstNetwork(event, request));
});

async function staticFirst(request) {
  const cache = await caches.open(STATIC);
  // Nomi con impronta del contenuto: l'eventuale ?dpl=… non conta.
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") await cache.put(request, res.clone());
  return res;
}

async function imageNetworkFirst(request) {
  const cache = await caches.open(STATIC);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") await cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    return hit ?? Response.error();
  }
}

async function pageFirstNetwork(event, request) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then((res) => {
    // Niente pagine che rimandano altrove (accesso richiesto): non sono la pagina.
    if (res.ok && !res.redirected && res.type === "basic") event.waitUntil(cache.put(request, res.clone()));
    return res;
  });
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_WAIT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    // rete assente: si prova la copia
  }
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    return await network;
  } catch {
    return offlinePage();
  }
}

function offlinePage() {
  const html =
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senza connessione · Writly</title>' +
    "<style>body{font:18px/1.5 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1rem;color:#222;background:#fff}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8ab4ff}}</style></head>" +
    '<body><h1>Senza connessione</h1><p>Questa pagina non è stata scaricata su questo dispositivo. Torna alla <a href="/">libreria</a> e apri un progetto già scaricato, oppure riprova quando torna la rete.</p></body></html>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
