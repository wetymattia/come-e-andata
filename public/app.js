/* =========================================================
   Com'è andata? — logica dell'app
   ========================================================= */
'use strict';

const VERSIONE = '1.2.0';
const CHIAVE_DATI = 'comeandata.valutazioni.v1';
const CHIAVE_PREF = 'comeandata.preferenze.v1';
const API = 'api'; // relativo: funziona sia alla radice del sito sia in una sottocartella

const ETICHETTE = { verde: 'Positiva', giallo: 'Normale', rosso: 'Negativa' };

const $ = (sel, radice = document) => radice.querySelector(sel);
const $$ = (sel, radice = document) => [...radice.querySelectorAll(sel)];

/* ---------------------------------------------------------
   Date (sempre in ora LOCALE, mai UTC)
   --------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, '0');
const chiaveData = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daChiave = (k) => { const [a, m, g] = k.split('-').map(Number); return new Date(a, m - 1, g); };
const aggiungiGiorni = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const oggi = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const ieri = () => aggiungiGiorni(oggi(), -1);

const fmtLungo = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtLungoAnno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtMese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const fmtGiornoBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'narrow' });

function dataLeggibile(d) {
  const s = (d.getFullYear() === new Date().getFullYear() ? fmtLungo : fmtLungoAnno).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------------
   Archivio (localStorage)
   Formato: { "2026-11-12": { v: "verde", t: 1731398400000 } }
   --------------------------------------------------------- */
const Archivio = {
  _cache: null,

  tutte() {
    if (!this._cache) {
      try { this._cache = JSON.parse(localStorage.getItem(CHIAVE_DATI)) || {}; }
      catch { this._cache = {}; }
    }
    return this._cache;
  },

  _salva() {
    localStorage.setItem(CHIAVE_DATI, JSON.stringify(this._cache));
  },

  leggi(chiave) {
    return this.tutte()[chiave]?.v || null;
  },

  scrivi(chiave, valore) {
    this.tutte()[chiave] = { v: valore, t: Date.now() };
    this._salva();
  },

  rimuovi(chiave) {
    delete this.tutte()[chiave];
    this._salva();
  },

  sostituisci(dati) {
    this._cache = dati;
    this._salva();
  },

  svuota() {
    this._cache = {};
    localStorage.removeItem(CHIAVE_DATI);
  },
};

const Preferenze = {
  leggi() {
    try { return { ora: 6, ...JSON.parse(localStorage.getItem(CHIAVE_PREF)) }; }
    catch { return { ora: 6 }; }
  },
  scrivi(p) {
    localStorage.setItem(CHIAVE_PREF, JSON.stringify({ ...this.leggi(), ...p }));
  },
};

/* ---------------------------------------------------------
   Ambiente
   --------------------------------------------------------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supportaPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* ---------------------------------------------------------
   Toast
   --------------------------------------------------------- */
let timerToast;
function toast(testo) {
  const el = $('#toast');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2600);
}

function vibra(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* ---------------------------------------------------------
   Navigazione (hash router)
   --------------------------------------------------------- */
const VISTE = ['oggi', 'storico', 'impostazioni'];

function mostraVista() {
  const nome = VISTE.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'oggi';
  $$('.vista').forEach((v) => { v.hidden = v.dataset.vista !== nome; });
  $$('.navbar__voce').forEach((a) => {
    const attiva = a.dataset.vai === nome;
    a.classList.toggle('attiva', attiva);
    if (attiva) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (nome === 'oggi') disegnaOggi();
  if (nome === 'storico') disegnaStorico();
  if (nome === 'impostazioni') disegnaImpostazioni();
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------
   Vista OGGI
   --------------------------------------------------------- */
function saluto() {
  const h = new Date().getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

// Colore toccato ma non ancora confermato (vale solo per il giorno indicato)
let inSospeso = null; // { chiave: '2026-11-11', valore: 'verde' }

function disegnaOggi() {
  const giorno = ieri();
  const chiave = chiaveData(giorno);
  const salvato = Archivio.leggi(chiave);
  if (inSospeso && inSospeso.chiave !== chiave) inSospeso = null; // è cambiato il giorno
  const daConfermare = inSospeso?.valore || null;
  const mostrato = daConfermare || salvato;

  $('#saluto').textContent = saluto();
  $('#data-ieri').textContent = `Ieri · ${dataLeggibile(giorno)}`;

  const scelte = $('#scelte');
  scelte.classList.toggle('ha-scelta', !!mostrato);
  $$('.scelta', scelte).forEach((b) => {
    const sel = b.dataset.valore === mostrato;
    b.classList.toggle('selezionata', sel);
    b.setAttribute('aria-pressed', String(sel));
  });

  // Pulsante Conferma: compare solo se c'è una scelta da confermare
  const conferma = $('#btn-conferma');
  conferma.hidden = !daConfermare;
  if (daConfermare) {
    conferma.className = `btn-conferma btn-conferma--${daConfermare}`;
    $('#btn-conferma-testo').textContent = salvato ? 'Conferma la modifica' : 'Conferma';
    $('#btn-conferma-sotto').textContent = `Giornata ${ETICHETTE[daConfermare].toLowerCase()}`;
  }

  if (daConfermare) {
    $('#esito').textContent = salvato
      ? `Prima avevi scelto “${ETICHETTE[salvato]}”.`
      : '';
  } else {
    $('#esito').textContent = salvato
      ? `Hai valutato ieri come “${ETICHETTE[salvato]}”. Tocca un altro colore per cambiare.`
      : 'Scegli un colore, poi conferma.';
  }
  $('#btn-rivedi').hidden = !(salvato && !daConfermare);

  disegnaSettimana();
}

/** Una frase diversa per ogni giorno dell'anno (1° gennaio = prima frase). */
function fraseDelGiorno(data = oggi()) {
  if (typeof FRASI === 'undefined' || !FRASI.length) return 'Ogni giorno è una nuova occasione.';
  const inizioAnno = new Date(data.getFullYear(), 0, 1);
  const giornoAnno = Math.round((data - inizioAnno) / 86400000); // 0..365
  return FRASI[giornoAnno % FRASI.length];
}

function disegnaSettimana() {
  const box = $('#riepilogo-breve');
  const fine = ieri();
  let html = '<p class="riepilogo-breve__titolo">Ultimi 7 giorni</p><div class="settimana">';
  for (let i = 6; i >= 0; i--) {
    const d = aggiungiGiorni(fine, -i);
    const v = Archivio.leggi(chiaveData(d));
    const nome = fmtGiornoBreve.format(d).toUpperCase();
    html += `<div class="settimana__giorno" title="${dataLeggibile(d)}${v ? ' – ' + ETICHETTE[v] : ''}">
      <span class="settimana__pallino ${v ? 'c-' + v : ''}"></span><span>${nome}</span></div>`;
  }
  html += '</div>';
  box.innerHTML = html;
}

/** Tocco su un colore: lo seleziona soltanto, il salvataggio avviene con “Conferma”. */
function seleziona(valore, bottone) {
  const chiave = chiaveData(ieri());
  const salvato = Archivio.leggi(chiave);
  const giaScelto = (inSospeso?.valore || salvato) === valore;

  // Ritoccare il colore già salvato annulla la modifica in corso
  inSospeso = valore === salvato ? null : { chiave, valore };
  vibra(8);
  disegnaOggi();

  if (!giaScelto) {
    bottone.classList.remove('pulsa');
    void bottone.offsetWidth; // riavvia l'animazione
    bottone.classList.add('pulsa');
  }
  if (inSospeso) {
    const conferma = $('#btn-conferma');
    conferma.classList.add('appare');
    // su schermi piccoli porta il pulsante in vista
    const r = conferma.getBoundingClientRect();
    const limite = window.innerHeight - 90;
    if (r.bottom > limite) window.scrollBy({ top: r.bottom - limite, behavior: 'smooth' });
  }
}

/** Salva la scelta e mostra la schermata finale con la frase del giorno. */
function conferma() {
  if (!inSospeso) return;
  const { chiave, valore } = inSospeso;
  Archivio.scrivi(chiave, valore);
  inSospeso = null;
  vibra([12, 60, 18]);

  const r = $('#btn-conferma').getBoundingClientRect();
  apriSchermataFinale(valore, r.left + r.width / 2, r.top + r.height / 2);
  disegnaOggi();
  chiudiNotificheAperte();
}

/* ---- Schermata finale: “Perfetto, ti auguro…” ---- */
let timerFinale = [];

function apriSchermataFinale(valore, x, y) {
  const el = $('#finale');
  timerFinale.forEach(clearTimeout);
  timerFinale = [];

  el.className = `finale finale--${valore}`;
  el.style.setProperty('--x', `${x}px`);
  el.style.setProperty('--y', `${y}px`);
  $('#finale-frase').textContent = `“${fraseDelGiorno()}”`;
  el.hidden = false;
  document.body.classList.add('bloccato');

  // 1) il colore si espande a cerchio dal punto toccato  2) compaiono i testi
  void el.offsetWidth; // fa partire la transizione dallo stato iniziale (cerchio chiuso)
  el.classList.add('aperta');
  timerFinale.push(setTimeout(() => {
    el.classList.add('mostra');
    $('#finale-chiudi').focus({ preventScroll: true });
  }, 420));
}

function chiudiSchermataFinale() {
  const el = $('#finale');
  if (el.hidden) return;
  timerFinale.forEach(clearTimeout);
  el.classList.add('chiusura');
  timerFinale = [setTimeout(() => {
    el.hidden = true;
    el.className = 'finale';
    document.body.classList.remove('bloccato');
  }, 380)];
}

async function chiudiNotificheAperte() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const notifiche = await reg?.getNotifications();
    notifiche?.forEach((n) => n.close());
  } catch { /* non importante */ }
}

/* ---------------------------------------------------------
   Vista STORICO
   --------------------------------------------------------- */
let meseVisto = (() => { const d = oggi(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

function disegnaStorico() {
  disegnaCalendario();
  disegnaStatistiche();
  disegnaElenco();
}

function disegnaCalendario() {
  const anno = meseVisto.getFullYear();
  const mese = meseVisto.getMonth();
  const oggiK = chiaveData(oggi());
  const primo = new Date(anno, mese, 1);
  const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
  const vuoti = (primo.getDay() + 6) % 7; // lunedì = 0

  $('#calendario-titolo').textContent = fmtMese.format(primo);
  const oggiD = oggi();
  $('#mese-succ').disabled = anno > oggiD.getFullYear() ||
    (anno === oggiD.getFullYear() && mese >= oggiD.getMonth());

  let html = '';
  for (let i = 0; i < vuoti; i++) html += '<span class="giorno giorno--vuoto"></span>';
  for (let g = 1; g <= giorniNelMese; g++) {
    const d = new Date(anno, mese, g);
    const k = chiaveData(d);
    const v = Archivio.leggi(k);
    const futuro = k > oggiK;
    const classi = ['giorno'];
    if (v) classi.push('c-' + v);
    if (k === oggiK) classi.push('giorno--oggi');
    if (futuro) classi.push('giorno--futuro');
    const etichetta = `${dataLeggibile(d)}${v ? ': ' + ETICHETTE[v] : ', non valutato'}`;
    html += `<button type="button" class="${classi.join(' ')}" data-giorno="${k}" ${futuro ? 'disabled' : ''} aria-label="${etichetta}">${g}</button>`;
  }
  $('#calendario').innerHTML = html;
}

function disegnaStatistiche() {
  const anno = meseVisto.getFullYear();
  const mese = meseVisto.getMonth();
  const prefisso = `${anno}-${pad(mese + 1)}-`;
  const conteggi = { verde: 0, giallo: 0, rosso: 0 };
  for (const [k, r] of Object.entries(Archivio.tutte())) {
    if (k.startsWith(prefisso) && conteggi[r.v] !== undefined) conteggi[r.v]++;
  }
  const totale = conteggi.verde + conteggi.giallo + conteggi.rosso;
  const nomeMese = fmtMese.format(meseVisto);
  const corrente = mese === oggi().getMonth() && anno === oggi().getFullYear();
  $('#stat-titolo').textContent = corrente ? 'Questo mese' : nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);

  const pct = (n) => (totale ? (n / totale) * 100 : 0);
  let nota = 'Nessun giorno valutato in questo mese.';
  if (totale) {
    const perc = Math.round(pct(conteggi.verde));
    nota = `${totale} ${totale === 1 ? 'giorno valutato' : 'giorni valutati'} · ${perc}% positivi`;
  }

  $('#statistiche').innerHTML = `
    <div class="stat c-verde"><span class="stat__numero">${conteggi.verde}</span><span class="stat__etichetta">Positive</span></div>
    <div class="stat c-giallo"><span class="stat__numero">${conteggi.giallo}</span><span class="stat__etichetta">Normali</span></div>
    <div class="stat c-rosso"><span class="stat__numero">${conteggi.rosso}</span><span class="stat__etichetta">Negative</span></div>
    <div class="barra" aria-hidden="true">
      <span class="c-verde" style="width:${pct(conteggi.verde)}%"></span>
      <span class="c-giallo" style="width:${pct(conteggi.giallo)}%"></span>
      <span class="c-rosso" style="width:${pct(conteggi.rosso)}%"></span>
    </div>
    <p class="nota-stat">${nota}${serieAttuale() > 1 ? ` · 🔥 ${serieAttuale()} giorni di fila` : ''}</p>`;
}

/** Giorni consecutivi valutati fino a ieri (o fino a oggi se già valutato). */
function serieAttuale() {
  let d = Archivio.leggi(chiaveData(oggi())) ? oggi() : ieri();
  let n = 0;
  while (Archivio.leggi(chiaveData(d))) { n++; d = aggiungiGiorni(d, -1); }
  return n;
}

function disegnaElenco() {
  const voci = Object.entries(Archivio.tutte())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 14);
  const ul = $('#elenco');
  if (!voci.length) {
    ul.innerHTML = '<li class="elenco__vuoto">Ancora nessuna valutazione.</li>';
    return;
  }
  ul.innerHTML = voci.map(([k, r]) => `
    <li><span class="elenco__pallino c-${r.v}"></span>
      <span class="elenco__data">${dataLeggibile(daChiave(k))}</span>
      <span class="elenco__voto">${ETICHETTE[r.v] || ''}</span></li>`).join('');
}

/* ---- Foglio per modificare un giorno ---- */
let giornoInModifica = null;

function apriFoglio(chiave) {
  giornoInModifica = chiave;
  const v = Archivio.leggi(chiave);
  $('#foglio-titolo').textContent = dataLeggibile(daChiave(chiave));
  $$('.mini-scelta').forEach((b) => b.classList.toggle('selezionata', b.dataset.valore === v));
  $('#foglio-rimuovi').disabled = !v;
  $('#foglio').hidden = false;
}

function chiudiFoglio() {
  $('#foglio').hidden = true;
  giornoInModifica = null;
}

/* ---------------------------------------------------------
   Vista IMPOSTAZIONI
   --------------------------------------------------------- */
function disegnaImpostazioni() {
  disegnaInstalla();
  disegnaNotifiche();
  $('#versione').textContent = `Com'è andata? · versione ${VERSIONE}`;
}

const ICONA_CONDIVIDI = `<svg class="icona-condividi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Condividi"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/></svg>`;

function disegnaInstalla() {
  const scheda = $('#scheda-installa');
  if (isStandalone) { scheda.hidden = true; return; }
  scheda.hidden = false;
  if (isIOS) {
    $('#istruzioni-installa').innerHTML = `
      <p class="testo-secondario">Su iPhone le notifiche funzionano <strong>solo</strong> se l'app è aggiunta alla schermata Home (iOS 16.4 o successivo).</p>
      <ol class="passi">
        <li>Apri questa pagina in <strong>Safari</strong>.</li>
        <li>Tocca il pulsante <strong>Condividi</strong> ${ICONA_CONDIVIDI} in basso.</li>
        <li>Scorri e scegli <strong>“Aggiungi alla schermata Home”</strong>.</li>
        <li>Tocca <strong>Aggiungi</strong>, poi apri l'app dall'icona sulla Home.</li>
      </ol>`;
  } else if (promptInstallazione) {
    $('#istruzioni-installa').innerHTML = `
      <p class="testo-secondario">Installa l'app per aprirla a schermo intero, come un'app nativa.</p>
      <button class="btn btn--primario btn--blocco" id="btn-installa" type="button">Installa l'app</button>`;
    $('#btn-installa').onclick = async () => {
      promptInstallazione.prompt();
      await promptInstallazione.userChoice;
      promptInstallazione = null;
      disegnaInstalla();
    };
  } else {
    $('#istruzioni-installa').innerHTML = `
      <p class="testo-secondario">Dal menu del browser scegli <strong>“Installa app”</strong> o <strong>“Aggiungi a schermata Home”</strong>.</p>`;
  }
}

let promptInstallazione = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstallazione = e;
  if (location.hash === '#impostazioni') disegnaInstalla();
});

/* ---------------------------------------------------------
   Notifiche push
   --------------------------------------------------------- */
let chiavePubblica = undefined; // undefined = non ancora chiesta, null = server non disponibile

async function ottieniChiavePubblica() {
  if (chiavePubblica !== undefined) return chiavePubblica;
  try {
    const r = await fetch(`${API}/chiave-pubblica`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    chiavePubblica = (await r.json()).publicKey || null;
  } catch {
    chiavePubblica = null;
  }
  return chiavePubblica;
}

function base64UrlInUint8(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function iscrizioneAttuale() {
  if (!supportaPush) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function fusoOrario() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; }
  catch { return 'Europe/Rome'; }
}

async function inviaIscrizione(sub) {
  const r = await fetch(`${API}/iscrizione`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), ora: Preferenze.leggi().ora, fuso: fusoOrario() }),
  });
  if (!r.ok) throw new Error(`Il server ha risposto ${r.status}`);
}

async function attivaNotifiche() {
  // Su iOS la richiesta DEVE partire subito dal tocco dell'utente,
  // quindi va fatta per prima, prima di qualsiasi altra operazione asincrona.
  const permesso = await Notification.requestPermission();
  if (permesso !== 'granted') return false;

  const chiave = await ottieniChiavePubblica();
  if (!chiave) throw new Error('Server delle notifiche non raggiungibile.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlInUint8(chiave),
    });
  }
  await inviaIscrizione(sub);
  return true;
}

async function disattivaNotifiche() {
  const sub = await iscrizioneAttuale();
  if (!sub) return;
  try {
    await fetch(`${API}/iscrizione`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch { /* se offline, la rimozione lato server avverrà al primo invio fallito */ }
  await sub.unsubscribe();
}

async function notificaDiProva() {
  const sub = await iscrizioneAttuale();
  if (!sub) throw new Error('Notifiche non attive.');
  const r = await fetch(`${API}/prova`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  if (!r.ok) throw new Error(`Il server ha risposto ${r.status}`);
}

function opzioniOra(selezionata) {
  let html = '';
  for (let h = 0; h < 24; h++) {
    html += `<option value="${h}" ${h === selezionata ? 'selected' : ''}>${pad(h)}:00</option>`;
  }
  return html;
}

async function disegnaNotifiche() {
  const box = $('#notifiche-stato');
  const ora = Preferenze.leggi().ora;

  // 1) iPhone in Safari (non da Home): le push non esistono finché non si installa
  if (isIOS && !isStandalone) {
    box.innerHTML = `
      <span class="badge">Non ancora disponibile</span>
      <p class="testo-secondario">Per ricevere la notifica alle ${pad(ora)}:00 aggiungi prima l'app alla schermata Home (vedi sopra) e aprila da lì.</p>`;
    return;
  }

  // 2) Browser senza supporto
  if (!supportaPush) {
    box.innerHTML = `
      <span class="badge badge--ko">Non supportate</span>
      <p class="testo-secondario">Questo browser non supporta le notifiche push. Su iPhone serve iOS 16.4 o successivo.</p>`;
    return;
  }

  box.innerHTML = '<p class="testo-secondario">Controllo in corso…</p>';
  const [chiave, sub] = await Promise.all([ottieniChiavePubblica(), iscrizioneAttuale().catch(() => null)]);

  // 3) Sito pubblicato senza le funzioni server (es. GitHub Pages o test in locale)
  if (!chiave) {
    box.innerHTML = `
      <span class="badge">Server non configurato</span>
      <p class="testo-secondario">L'app funziona, ma per la notifica automatica delle ${pad(ora)}:00 serve il piccolo server gratuito incluso (Netlify). Segui le istruzioni del file <strong>README</strong>.</p>`;
    return;
  }

  // 4) Permesso negato
  if (Notification.permission === 'denied') {
    box.innerHTML = `
      <span class="badge badge--ko">Bloccate</span>
      <p class="testo-secondario">${isIOS
        ? 'Hai negato il permesso. Vai in <strong>Impostazioni › Notifiche › Com\'è andata?</strong> e attiva “Consenti notifiche”.'
        : 'Hai bloccato le notifiche per questo sito. Riattivale dalle impostazioni del browser.'}</p>`;
    return;
  }

  // 5) Già attive
  if (sub && Notification.permission === 'granted') {
    box.innerHTML = `
      <span class="badge badge--ok">✓ Attive</span>
      <p class="testo-secondario">Ogni mattina riceverai: <strong>“Com'è andata ieri?”</strong></p>
      <label class="campo">Ora del promemoria
        <select id="sel-ora">${opzioniOra(ora)}</select>
      </label>
      <div class="riga-bottoni">
        <button class="btn btn--secondario" id="btn-prova" type="button">Invia una prova</button>
        <button class="btn btn--secondario" id="btn-disattiva" type="button">Disattiva</button>
      </div>`;

    $('#sel-ora').onchange = async (e) => {
      Preferenze.scrivi({ ora: Number(e.target.value) });
      try { await inviaIscrizione(sub); toast(`Promemoria spostato alle ${pad(e.target.value)}:00`); }
      catch (err) { toast('Impossibile salvare: sei offline?'); console.error(err); }
    };
    $('#btn-prova').onclick = async (e) => {
      e.target.disabled = true;
      try { await notificaDiProva(); toast('Notifica inviata! Arriverà tra pochi secondi.'); }
      catch (err) { toast('Invio non riuscito. Riprova.'); console.error(err); }
      finally { e.target.disabled = false; }
    };
    $('#btn-disattiva').onclick = async () => {
      await disattivaNotifiche();
      toast('Notifiche disattivate');
      disegnaNotifiche();
    };
    // Mantiene il server allineato (es. dopo un cambio di fuso orario)
    inviaIscrizione(sub).catch(() => {});
    return;
  }

  // 6) Da attivare
  box.innerHTML = `
    <p class="testo-secondario">Ricevi ogni mattina un promemoria per valutare la giornata appena passata.</p>
    <label class="campo">Ora del promemoria
      <select id="sel-ora">${opzioniOra(ora)}</select>
    </label>
    <button class="btn btn--primario btn--blocco" id="btn-attiva" type="button">Attiva notifiche</button>`;

  $('#sel-ora').onchange = (e) => Preferenze.scrivi({ ora: Number(e.target.value) });
  $('#btn-attiva').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Attivazione…';
    try {
      const ok = await attivaNotifiche();
      toast(ok ? `Fatto! Ci sentiamo domani alle ${pad(Preferenze.leggi().ora)}:00 🔔` : 'Permesso non concesso');
    } catch (err) {
      console.error(err);
      toast('Attivazione non riuscita: ' + err.message);
    }
    disegnaNotifiche();
  };
}

/* ---------------------------------------------------------
   Backup
   --------------------------------------------------------- */
function esporta() {
  const dati = { app: 'comeandata', versione: 1, esportato: new Date().toISOString(), valutazioni: Archivio.tutte() };
  const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `come-e-andata-backup-${chiaveData(oggi())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importa(file) {
  try {
    const json = JSON.parse(await file.text());
    const sorgente = json.valutazioni || json;
    const pulite = {};
    for (const [k, r] of Object.entries(sorgente)) {
      const v = typeof r === 'string' ? r : r?.v;
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && ETICHETTE[v]) pulite[k] = { v, t: r?.t || Date.now() };
    }
    const n = Object.keys(pulite).length;
    if (!n) throw new Error('vuoto');
    if (!confirm(`Importare ${n} giorni? Le valutazioni degli stessi giorni verranno sovrascritte.`)) return;
    Archivio.sostituisci({ ...Archivio.tutte(), ...pulite });
    toast(`${n} giorni importati ✓`);
  } catch {
    toast('File non valido');
  }
}

/* ---------------------------------------------------------
   Avvio
   --------------------------------------------------------- */
function collegaEventi() {
  $$('.scelta').forEach((b) => b.addEventListener('click', () => seleziona(b.dataset.valore, b)));
  $('#btn-conferma').onclick = conferma;
  $('#finale-chiudi').onclick = chiudiSchermataFinale;
  $('#btn-rivedi').onclick = () => {
    const v = Archivio.leggi(chiaveData(ieri()));
    if (v) apriSchermataFinale(v, window.innerWidth / 2, window.innerHeight / 2);
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudiSchermataFinale(); });

  $('#mese-prec').onclick = () => { meseVisto = new Date(meseVisto.getFullYear(), meseVisto.getMonth() - 1, 1); disegnaStorico(); };
  $('#mese-succ').onclick = () => { meseVisto = new Date(meseVisto.getFullYear(), meseVisto.getMonth() + 1, 1); disegnaStorico(); };

  $('#calendario').addEventListener('click', (e) => {
    const b = e.target.closest('.giorno[data-giorno]');
    if (b && !b.disabled) apriFoglio(b.dataset.giorno);
  });

  $$('.mini-scelta').forEach((b) => b.addEventListener('click', () => {
    if (!giornoInModifica) return;
    Archivio.scrivi(giornoInModifica, b.dataset.valore);
    vibra();
    chiudiFoglio();
    disegnaStorico();
    toast('Salvato ✓');
  }));
  $('#foglio-rimuovi').onclick = () => {
    if (!giornoInModifica) return;
    Archivio.rimuovi(giornoInModifica);
    chiudiFoglio();
    disegnaStorico();
    toast('Valutazione rimossa');
  };
  $('#foglio-chiudi').onclick = chiudiFoglio;
  $('#foglio').addEventListener('click', (e) => { if (e.target.id === 'foglio') chiudiFoglio(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#foglio').hidden) chiudiFoglio(); });

  $('#btn-esporta').onclick = esporta;
  $('#file-importa').onchange = (e) => { if (e.target.files[0]) importa(e.target.files[0]); e.target.value = ''; };
  $('#btn-cancella').onclick = () => {
    if (confirm('Vuoi davvero cancellare TUTTE le valutazioni? L\'operazione non si può annullare.')) {
      Archivio.svuota();
      toast('Dati cancellati');
    }
  };

  window.addEventListener('hashchange', mostraVista);

  // Se l'app resta aperta oltre la mezzanotte, o torna in primo piano il giorno dopo, aggiorna "ieri".
  let ultimoGiorno = chiaveData(oggi());
  const controllaGiorno = () => {
    if (document.visibilityState !== 'visible') return;
    const adesso = chiaveData(oggi());
    if (adesso !== ultimoGiorno) { ultimoGiorno = adesso; mostraVista(); }
  };
  document.addEventListener('visibilitychange', controllaGiorno);
  setInterval(controllaGiorno, 60 * 1000);

  // Messaggi dal service worker (tocco sulla notifica con app già aperta)
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.tipo === 'apri-oggi') {
      if (location.hash !== '#oggi') location.hash = '#oggi'; else mostraVista();
    }
  });
}

async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('service-worker.js');
  } catch (err) {
    console.warn('Service worker non registrato:', err);
  }
}

function avvia() {
  // Aperta da una notifica? Vai direttamente alla domanda.
  const params = new URLSearchParams(location.search);
  if (params.get('da') === 'notifica') {
    history.replaceState(null, '', location.pathname + '#oggi');
  }

  collegaEventi();
  mostraVista();
  registraServiceWorker();

  // Chiedi al browser di non cancellare i dati in caso di poco spazio
  navigator.storage?.persist?.().catch(() => {});
}

avvia();
