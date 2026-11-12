# Com'è andata? 🟢🟡🔴

Una Progressive Web App in italiano: ogni mattina alle 6:00 ricevi una notifica,
la tocchi e valuti la giornata appena passata con un colore.

- **Verde** → giornata positiva
- **Giallo** → giornata normale
- **Rosso** → giornata negativa

La valutazione viene salvata sul **giorno precedente** (se oggi è il 13 novembre, si salva il 12).
Lo storico mostra un calendario colorato, le statistiche del mese e gli ultimi giorni.

---

## 📁 I file

```
public/                     ← l'app vera e propria (è questa la cartella che va online)
  index.html                  struttura delle tre schermate (Oggi, Storico, Impostazioni)
  style.css                   grafica mobile-first, tema chiaro e scuro automatico
  app.js                      logica: salvataggio, calendario, notifiche, backup
  frasi.js                    le 365 frasi motivazionali, una per ogni giorno dell'anno
  manifest.json               rende l'app installabile (nome, icone, colori)
  service-worker.js           funzionamento offline + ricezione delle notifiche
  icons/                      icone per iPhone, Android e browser

netlify/                    ← il piccolo "server" gratuito che invia la notifica delle 6:00
  functions/api.mjs           iscrizione alle notifiche + notifica di prova
  functions/notifica-oraria.mjs  gira ogni ora e invia il promemoria a chi lo aspetta
  lib/push.mjs                funzioni condivise

netlify.toml                configurazione per Netlify
package.json                dipendenze del server (web-push, @netlify/blobs)
.github/workflows/pages.yml pubblicazione alternativa su GitHub Pages (senza notifiche)
```

### Dove finiscono i dati?
- **Le valutazioni** restano solo sul tuo telefono (`localStorage`). Non vengono mai inviate a nessun server.
- **Il server** conserva solo ciò che serve a spedire la notifica: l'indirizzo push del dispositivo,
  l'ora scelta e il fuso orario.
- Da **Impostazioni › I tuoi dati** puoi esportare e reimportare un backup (`.json`).

---

## 🧪 1. Provarla sul computer

Serve un piccolo server locale (aprire `index.html` con doppio clic non basta: il service worker
funziona solo su `http://localhost` o su `https://`).

Con Python:

```bash
python -m http.server 8080 --directory public
```

Oppure con Node.js:

```bash
npx serve public -l 8080
```

Poi apri **http://localhost:8080** nel browser. Per vederla come su un telefono, in Chrome premi
`F12` e attiva la modalità dispositivo (icona del telefono).

Cosa puoi provare in locale: i tre pulsanti, lo storico, il backup e il funzionamento offline
(spegni il server e ricarica: l'app continua ad aprirsi).
Cosa **non** puoi provare in locale: le notifiche automatiche, perché richiedono il server su Netlify.
In Impostazioni vedrai la scritta *"Server non configurato"*: è normale.

---

## 🚀 2. Metterla online gratis con Netlify (consigliato: include le notifiche)

Netlify ospita gratis sia l'app sia la funzione che ogni mattina spedisce la notifica.
Non devi configurare chiavi né variabili: le chiavi per le notifiche vengono create
automaticamente al primo avvio.

### Passo A: carica i file su GitHub
1. Crea un account gratuito su **https://github.com** (se non ce l'hai).
2. In alto a destra: **+ › New repository**. Nome, per esempio, `come-e-andata`. Lascialo
   **Public** o **Private** (vanno bene entrambi) e premi **Create repository**.
3. Nella pagina del repository vuoto clicca **"uploading an existing file"**.
4. Trascina **tutto il contenuto** di questa cartella (`public`, `netlify`, `netlify.toml`,
   `package.json`, `package-lock.json`, `README.md`, e se vuoi `.github`).
   ⚠️ **Non** caricare la cartella `node_modules`, se presente.
5. Premi **Commit changes**.

> Se usi Git dal terminale:
> ```bash
> git init
> git add .
> git commit -m "Prima versione"
> git branch -M main
> git remote add origin https://github.com/TUO-UTENTE/come-e-andata.git
> git push -u origin main
> ```

### Passo B: collega Netlify
1. Vai su **https://app.netlify.com** e accedi con il tuo account GitHub.
2. **Add new project › Import an existing project › GitHub**, e scegli il repository `come-e-andata`.
3. Le impostazioni vengono lette da `netlify.toml`: non toccare niente e premi **Deploy**.
4. Dopo un minuto avrai un indirizzo tipo `https://nome-a-caso.netlify.app`
   (puoi cambiarlo in **Project configuration › Change project name**).

Fatto. Ogni volta che modifichi un file su GitHub, Netlify ripubblica da solo.

> ⚠️ **Non usare "Netlify Drop"** (il trascinamento della cartella nel browser): pubblica solo
> i file statici, senza le funzioni, quindi l'app funziona ma la notifica delle 6:00 no.

### (Facoltativo) Chiavi VAPID tue
Se preferisci gestire tu le chiavi delle notifiche, generale con
`npx web-push generate-vapid-keys` e aggiungile in Netlify
(**Project configuration › Environment variables**) come `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` e, se vuoi, `VAPID_SUBJECT` (es. `mailto:tuo@indirizzo.it`).
Attenzione: cambiando le chiavi, chi aveva già attivato le notifiche deve disattivarle e riattivarle.

---

## 🌐 Alternativa: GitHub Pages (senza notifiche automatiche)

GitHub Pages ospita solo file statici: l'app funziona (pulsanti, storico, offline), ma non c'è
nessuno che alle 6:00 spedisca la notifica.

1. Carica i file su GitHub come nel *Passo A*, **inclusa la cartella `.github`**.
2. Nel repository: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
3. Vai su **Actions**, attendi che "GitHub Pages" diventi verde: l'indirizzo sarà
   `https://TUO-UTENTE.github.io/come-e-andata/`.

---

## 📱 3. Installarla su iPhone e attivare le notifiche

Le notifiche delle web app su iPhone funzionano **solo** se:
- l'iPhone ha **iOS 16.4 o successivo** (Impostazioni › Generali › Info › Versione iOS);
- l'app è stata **aggiunta alla schermata Home** e viene aperta **dall'icona**, non da Safari.

### Aggiungi alla schermata Home
1. Apri l'indirizzo Netlify con **Safari**.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia verso l'alto).
3. Scorri e tocca **"Aggiungi alla schermata Home"**, poi **Aggiungi**.
4. Chiudi Safari e apri l'app dalla nuova icona 🟢🟡🔴: si apre a schermo intero, come un'app nativa.

### Attiva le notifiche
1. Nell'app vai su **Impostazioni** (in basso a destra).
2. Nella scheda **Promemoria mattutino** scegli l'ora (preimpostata alle **06:00**).
3. Tocca **Attiva notifiche** e poi **Consenti** nel messaggio di iOS.
4. Tocca **Invia una prova**: entro pochi secondi deve arrivare una notifica.
5. Da domani, alle 6:00, arriverà *"Com'è andata ieri?"*. Toccandola si apre direttamente la domanda.

### Se la notifica non arriva
- **Impostazioni iPhone › Notifiche › Com'è andata?**: verifica che "Consenti notifiche" sia attivo
  e che lo stile non sia "Nessuno".
- **Full immersion / Non disturbare** attivo alle 6:00 (es. "Riposo"): aggiungi l'app tra quelle
  consentite, oppure la notifica comparirà solo quando lo disattivi.
- **Riepilogo programmato**: se attivo, iOS può raggruppare la notifica e mostrarla più tardi.
- Se hai negato il permesso per sbaglio: Impostazioni iPhone › Notifiche › Com'è andata? › Consenti.
- Ultima spiaggia: elimina l'icona dalla Home, aggiungila di nuovo e riattiva le notifiche.

### Da sapere su iPhone
- **L'app dalla Home e Safari hanno memorie separate.** Le valutazioni fatte in Safari non compaiono
  nell'app installata (e viceversa). Usa sempre l'icona sulla Home.
- Se elimini l'icona dalla Home, iOS cancella anche i dati: **esporta prima un backup**.

---

## 🤖 Android e computer
- **Android (Chrome)**: apri il sito, menu ⋮ › **Installa app** (oppure il pulsante "Installa l'app"
  in Impostazioni). Le notifiche funzionano anche senza installarla.
- **Computer (Chrome/Edge)**: icona di installazione nella barra degli indirizzi.

---

## ⚙️ Come funziona la notifica delle 6:00 (e perché serve un server)

Le web app non possono programmare da sole una notifica sul telefono: quando l'app è chiusa,
iOS non le lascia eseguire codice. Per questo la notifica parte da fuori:

1. Quando tocchi **Attiva notifiche**, il telefono crea un "indirizzo push" e l'app lo manda a
   Netlify insieme all'ora scelta e al tuo fuso orario.
2. La funzione `notifica-oraria` gira **ogni ora**. Per ogni dispositivo controlla se, nel suo fuso
   orario, è l'ora scelta: se sì, invia la notifica tramite il servizio push di Apple/Google.
3. Funziona con il cambio ora legale/solare ed evita doppioni nella stessa giornata.

Tutto rientra ampiamente nel piano gratuito di Netlify (circa 720 esecuzioni al mese).
La notifica può arrivare con qualche secondo o minuto di ritardo: dipende da Netlify e da Apple.

---

## 🛠️ Modifiche

- **Dopo ogni modifica ai file in `public/`**, cambia il numero in `service-worker.js`
  (`const VERSIONE_CACHE = 'comeandata-v1'` → `'comeandata-v2'`), altrimenti i telefoni
  continuano a usare la versione in cache. L'aggiornamento arriva alla seconda apertura dell'app.
- **Frasi motivazionali**: in `frasi.js`. Dopo aver scelto il colore e toccato **Conferma**,
  il colore si espande a tutto schermo e compare
  *"Perfetto, ti auguro la migliore delle giornate e ricorda"* seguito dalla frase del giorno
  (1° gennaio la prima, 31 dicembre l'ultima). Puoi cambiarle, aggiungerne o toglierne:
  se non sono 365 l'app ricomincia semplicemente dall'inizio.
- **Ora predefinita**: in `app.js`, cerca `ora: 6` (si può comunque cambiare dall'app).
- **Testi della notifica**: in `netlify/lib/push.mjs`, funzione `messaggioMattino`.
- **Colori**: in cima a `style.css` (`--verde`, `--giallo`, `--rosso`).
