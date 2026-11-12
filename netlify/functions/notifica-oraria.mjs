// Funzione programmata: gira all'inizio di ogni ora (orario UTC) e invia la notifica
// ai dispositivi per cui, nel loro fuso orario, è l'ora scelta (di default le 6:00).
// Così l'orario resta giusto anche con il passaggio ora legale / ora solare.
import {
  archivio, configuraWebPush, invia, messaggioMattino, oraLocale,
} from '../lib/push.mjs';

export default async (req, context) => {
  await configuraWebPush(context);

  // +5 minuti di margine nel caso la funzione parta qualche secondo prima dello scoccare dell'ora
  const adesso = new Date(Date.now() + 5 * 60 * 1000);
  const a = archivio();
  const { blobs } = await a.list({ prefix: 'sub/' });

  const conteggio = { inviate: 0, scadute: 0, errori: 0, saltate: 0 };

  await Promise.all(blobs.map(async ({ key }) => {
    const record = await a.get(key, { type: 'json' });
    if (!record) return;

    const { ora, giorno } = oraLocale(adesso, record.fuso || 'Europe/Rome');
    if (ora !== record.ora || record.ultimoInvio === giorno) { conteggio.saltate++; return; }

    const esito = await invia(key, record, messaggioMattino(adesso, record.fuso || 'Europe/Rome'));
    if (esito === 'ok') {
      conteggio.inviate++;
      await a.setJSON(key, { ...record, ultimoInvio: giorno });
    } else if (esito === 'scaduta') {
      conteggio.scadute++;
    } else {
      conteggio.errori++;
    }
  }));

  console.log(`Notifiche: ${JSON.stringify(conteggio)} su ${blobs.length} dispositivi`);
};

export const config = {
  schedule: '@hourly',
};
