// Funzioni condivise per le notifiche push (usate da api.mjs e notifica-oraria.mjs)
import webpush from 'web-push';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

/** Archivio Netlify Blobs: contiene le chiavi VAPID e le iscrizioni dei dispositivi. */
export const archivio = () => getStore({ name: 'comeandata', consistency: 'strong' });

export const chiaveIscrizione = (endpoint) =>
  'sub/' + createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

/**
 * Chiavi VAPID: se sono impostate come variabili d'ambiente usa quelle,
 * altrimenti le genera al primo utilizzo e le salva in Netlify Blobs.
 */
export async function chiaviVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const a = archivio();
  let chiavi = await a.get('vapid', { type: 'json' });
  if (!chiavi) {
    chiavi = webpush.generateVAPIDKeys();
    await a.setJSON('vapid', chiavi);
  }
  return chiavi;
}

export async function configuraWebPush(context) {
  const { publicKey, privateKey } = await chiaviVapid();
  const soggetto =
    process.env.VAPID_SUBJECT ||
    context?.site?.url ||
    process.env.URL ||
    'mailto:notifiche@example.com';
  webpush.setVapidDetails(soggetto, publicKey, privateKey);
}

/** Ora (0-23) e data (AAAA-MM-GG) in un certo fuso orario. */
export function oraLocale(data, fuso) {
  const parti = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(data).map((p) => [p.type, p.value])
  );
  return { ora: Number(parti.hour), giorno: `${parti.year}-${parti.month}-${parti.day}` };
}

export function fusoValido(fuso) {
  if (typeof fuso !== 'string' || fuso.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: fuso }); return true; }
  catch { return false; }
}

/** Testo della notifica mattutina, con la data di ieri nel fuso dell'utente. */
export function messaggioMattino(adesso, fuso) {
  const ieri = new Date(adesso.getTime() - 24 * 60 * 60 * 1000);
  const giorno = new Intl.DateTimeFormat('it-IT', {
    timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long',
  }).format(ieri);
  return {
    title: "Com'è andata ieri?",
    body: `Valuta la giornata di ${giorno}: verde, giallo o rosso? 🟢🟡🔴`,
    url: './?da=notifica#oggi',
    tag: 'valutazione-giornaliera',
  };
}

/**
 * Invia una notifica. Restituisce 'ok', 'scaduta' (iscrizione rimossa) o 'errore'.
 */
export async function invia(chiave, record, messaggio) {
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(messaggio), {
      TTL: 6 * 60 * 60, // se il telefono è spento, consegna entro 6 ore
      urgency: 'high',
    });
    return 'ok';
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await archivio().delete(chiave); // il dispositivo ha disattivato le notifiche
      return 'scaduta';
    }
    console.error('Invio fallito', err.statusCode, err.body || err.message);
    return 'errore';
  }
}
