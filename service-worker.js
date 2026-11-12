/* =========================================================
   Com'è andata? — Service Worker
   - Cache dei file per il funzionamento offline
   - Ricezione delle notifiche push
   - Apertura dell'app al tocco sulla notifica
   ========================================================= */

// ⚠️ Cambia questo numero ogni volta che modifichi un file dell'app,
// così i telefoni scaricano la nuova versione.
const VERSIONE_CACHE = 'comeandata-v4';

const FILE_APP = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './frasi.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/badge-96.png',
];

/* ---------- Installazione: salva i file in cache ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSIONE_CACHE)
      .then((cache) => cache.addAll(FILE_APP))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Attivazione: elimina le cache vecchie ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Richieste di rete ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // le API vanno sempre in rete

  // Pagine HTML: prima la rete (per avere aggiornamenti), poi la cache se offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(VERSIONE_CACHE).then((c) => c.put('./index.html', copia));
          return risposta;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Altri file (CSS, JS, icone): prima la cache, poi aggiorna in background
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((inCache) => {
      const daRete = fetch(req)
        .then((risposta) => {
          if (risposta.ok) {
            const copia = risposta.clone();
            caches.open(VERSIONE_CACHE).then((c) => c.put(req, copia));
          }
          return risposta;
        })
        .catch(() => inCache);
      return inCache || daRete;
    })
  );
});

/* ---------- Notifica push in arrivo ---------- */
self.addEventListener('push', (event) => {
  let dati = {};
  try { dati = event.data ? event.data.json() : {}; }
  catch { dati = { body: event.data && event.data.text() }; }

  const titolo = dati.title || "Com'è andata ieri?";
  const opzioni = {
    body: dati.body || 'Tocca per valutare la giornata appena passata: verde, giallo o rosso.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: dati.tag || 'valutazione-giornaliera', // una sola notifica alla volta
    renotify: true,
    lang: 'it',
    data: { url: dati.url || './?da=notifica#oggi' },
  };

  // iOS richiede che OGNI push mostri una notifica, altrimenti revoca l'iscrizione.
  event.waitUntil(self.registration.showNotification(titolo, opzioni));
});

/* ---------- Tocco sulla notifica ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinazione = new URL(event.notification.data?.url || './?da=notifica#oggi', self.registration.scope).href;

  event.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of finestre) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        client.postMessage({ tipo: 'apri-oggi' });
        return;
      }
    }
    await self.clients.openWindow(destinazione);
  })());
});

/* ---------- L'iscrizione push è scaduta: rinnovala ---------- */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const vecchia = event.oldSubscription;
    const opzioni = vecchia?.options;
    if (!opzioni?.applicationServerKey) return;
    const nuova = await self.registration.pushManager.subscribe(opzioni);
    // ora e fuso non sono disponibili qui: il server mantiene quelli precedenti
    await fetch('api/iscrizione', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: nuova.toJSON(), vecchioEndpoint: vecchia.endpoint }),
    });
  })());
});
