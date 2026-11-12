// API per le notifiche:
//   GET    /api/chiave-pubblica  → chiave VAPID pubblica per iscriversi
//   POST   /api/iscrizione       → salva/aggiorna l'iscrizione di un dispositivo
//   DELETE /api/iscrizione       → rimuove l'iscrizione
//   POST   /api/prova            → invia subito una notifica di prova
import {
  archivio, chiaveIscrizione, chiaviVapid, configuraWebPush, fusoValido, invia,
} from '../lib/push.mjs';

const risposta = (dati, status = 200) =>
  new Response(JSON.stringify(dati), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const stringa = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;

function iscrizioneValida(sub) {
  if (!sub || !stringa(sub.endpoint, 2048) || !sub.keys) return false;
  try { if (new URL(sub.endpoint).protocol !== 'https:') return false; } catch { return false; }
  return stringa(sub.keys.p256dh, 256) && stringa(sub.keys.auth, 128);
}

async function leggiCorpo(req) {
  try { return await req.json(); } catch { return {}; }
}

export default async (req, context) => {
  const azione = new URL(req.url).pathname.split('/').filter(Boolean).pop();

  try {
    // ---- Chiave pubblica ----
    if (azione === 'chiave-pubblica' && req.method === 'GET') {
      const { publicKey } = await chiaviVapid();
      return risposta({ publicKey });
    }

    // ---- Iscrizione ----
    if (azione === 'iscrizione' && req.method === 'POST') {
      const corpo = await leggiCorpo(req);
      const sub = corpo.subscription;
      if (!iscrizioneValida(sub)) return risposta({ errore: 'Iscrizione non valida' }, 400);

      const a = archivio();
      const chiave = chiaveIscrizione(sub.endpoint);
      let precedente = await a.get(chiave, { type: 'json' });

      // Rinnovo automatico dal service worker: recupera le impostazioni della vecchia iscrizione
      if (!precedente && stringa(corpo.vecchioEndpoint, 2048)) {
        const vecchiaChiave = chiaveIscrizione(corpo.vecchioEndpoint);
        precedente = await a.get(vecchiaChiave, { type: 'json' });
        if (precedente) await a.delete(vecchiaChiave);
      }

      const ora = Number.isInteger(corpo.ora) && corpo.ora >= 0 && corpo.ora <= 23
        ? corpo.ora : (precedente?.ora ?? 6);
      const fuso = fusoValido(corpo.fuso) ? corpo.fuso : (precedente?.fuso ?? 'Europe/Rome');

      await a.setJSON(chiave, {
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        ora,
        fuso,
        creata: precedente?.creata ?? new Date().toISOString(),
        // se l'ora cambia, permetti un nuovo invio nella stessa giornata
        ultimoInvio: precedente && precedente.ora === ora ? precedente.ultimoInvio ?? null : null,
      });
      return risposta({ ok: true, ora, fuso });
    }

    if (azione === 'iscrizione' && req.method === 'DELETE') {
      const { endpoint } = await leggiCorpo(req);
      if (!stringa(endpoint, 2048)) return risposta({ errore: 'Endpoint mancante' }, 400);
      await archivio().delete(chiaveIscrizione(endpoint));
      return risposta({ ok: true });
    }

    // ---- Notifica di prova ----
    if (azione === 'prova' && req.method === 'POST') {
      const { endpoint } = await leggiCorpo(req);
      if (!stringa(endpoint, 2048)) return risposta({ errore: 'Endpoint mancante' }, 400);
      const chiave = chiaveIscrizione(endpoint);
      const record = await archivio().get(chiave, { type: 'json' });
      if (!record) return risposta({ errore: 'Iscrizione non trovata' }, 404);

      await configuraWebPush(context);
      const esito = await invia(chiave, record, {
        title: 'Notifica di prova ✓',
        body: `Funziona! Ogni mattina alle ${String(record.ora).padStart(2, '0')}:00 riceverai il promemoria.`,
        url: './?da=notifica#oggi',
        tag: 'prova',
      });
      return esito === 'ok' ? risposta({ ok: true }) : risposta({ errore: esito }, 502);
    }

    return risposta({ errore: 'Non trovato' }, 404);
  } catch (err) {
    console.error(err);
    return risposta({ errore: 'Errore interno' }, 500);
  }
};

export const config = {
  path: ['/api/chiave-pubblica', '/api/iscrizione', '/api/prova'],
};
