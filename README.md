# Sparedût

Sparatutto in prima persona nel browser, ambientato a **Gemona del Friuli, zona Duomo**.
Due squadre del folklore friulano si contendono il sagrato, Via Bini e Piazza del Municipio:
i **Benandanti** (fusti di finocchio, salvano il raccolto) contro i **Malandanti** (canne di sorgo, vogliono la grandine).

Multigiocatore online e in rete locale, fino a 16 giocatori, con bot a tre livelli di bravura; contro i bot si gioca anche offline, senza server.
Interfaccia in **friulano** o **italiano** (selettore in alto a destra nel menu); `Esc` torna indietro in tutti i menu.
Due stili grafici, dal selettore in basso a destra: **Cumò** (l'originale) e **Vêr** (realistico: superfici fotografate e armi modellate in Blender). La scelta resta salvata nel browser.

## Avvio

```sh
pnpm install
pnpm dev      # server di gioco su :3007 + Vite su :5173
```

Apri http://localhost:5173. Più schede = più giocatori.

Build unica servita dal server (anche per giocare in LAN da un solo computer):

```sh
pnpm build && pnpm start   # http://localhost:3007
```

All'avvio il server stampa gli indirizzi di rete locale: gli altri computer della stessa rete aprono quell'indirizzo.

### Su Cloudflare

Con [Alchemy](https://alchemy.run) (`alchemy.run.ts`): il client come asset statici, le partite in un Durable Object
(`server/worker.ts`, lo stesso `Hub` del server Bun) creato in Europa occidentale.

```sh
pnpm exec alchemy profile edit --add Cloudflare    # una volta: login all'account Cloudflare
pnpm cf:deploy                                     # https://sparedut.<account>.workers.dev
DEPLOY_DOMAIN=sparedut.example.com pnpm cf:deploy  # su un dominio dell'account
pnpm cf:destroy
```

Il primo deploy installa nell'account lo stato di Alchemy, condiviso con la CI.
Un deploy chiude le partite in corso.

## Installare il gioco

Dalla build di produzione (il deploy, o `pnpm build && pnpm start` aperto da `localhost`) il gioco si installa come un'app:
si apre a schermo intero, senza le barre del browser, in orizzontale e in verticale, e dopo la prima visita online si apre anche senza rete.

- **Chrome, Edge, Brave** (computer e Android): l'icona di installazione nella barra degli indirizzi, oppure *Installa app* / *Aggiungi a schermata Home* nel menu del browser.
- **Safari su iPhone e iPad**: *Condividi* → *Aggiungi alla schermata Home*.
- **Safari su Mac**: *File* → *Aggiungi al Dock*.

Installato, il gioco chiede al browser di non cancellare i suoi dati (la cache, le impostazioni, i progressi della Dutrine).
L'installazione chiede HTTPS: da un indirizzo di rete locale in `http://` il gioco si gioca ma non si installa.

## Partite

- **Zuie cuintri i bot**: una partita offline contro la CPU, con modalità, mappa, durata, bot e bravura dell'ultima partita creata (la prima volta quelli di partenza) e fuoco amico spento. Si ferma all'Adunata con *Fai partire la partita* già selezionato: un tasto e si gioca, con l'ultima arma principale usata.
- **Cree une partide**: modalità, mappa, durata, bot per squadra e bravura (Zovin, Pari di famee, Plevan), fuoco amico, l'**arma unica**, e la **portata**:
  - *Offline*: la stanza gira nel browser di chi la crea (stesso codice di stanza e bot del server, in un worker), solo contro i bot. Funziona anche se il server non risponde; non ha codice né link d'invito, non è in nessuna lista e si perde ricaricando la pagina.
  - *LAN*: compare nella lista di chi è sulla stessa rete (stesso IP pubblico visto dal server; se il server gira in LAN, tutti gli IP privati contano come stessa rete); da altre reti non si entra nemmeno col codice.
  - *Online*: compare nella lista di tutti.
- Le stanze LAN e Online hanno anche un **accesso**: *Aperto*, oppure *Con password* (lucchetto nella lista: chi entra la deve scrivere, e dopo cinque password sbagliate aspetta dieci secondi).
  Ogni stanza sul server è in lista per chi la può raggiungere; si entra anche col codice di 4 lettere o col link `?p=CODICE` (il link porta con sé la password, se c'è).
  Senza server si gioca solo offline: LAN e Online restano bloccate finché non risponde.
- Chi crea è l'host: all'Adunata fa partire la partita, aggiunge o toglie bot, cambia la bravura e l'arma unica; dal menu di partita (`Esc`) aggiunge o toglie bot, cambia la bravura, o chiude la partita e torna all'Adunata.
  Se una partita è piena di bot, una persona che entra prende il posto di un bot.

### L'Adunata

Prima di ogni partita la stanza non mostra la mappa ma l'**Adunata**: le due squadre, chi c'è e con che arma, la chat.
Ognuno sceglie la squadra e l'arma principale e si segna pronto. L'host fa partire la partita: dieci secondi di conto alla rovescia,
in cui si può ancora cambiare (l'host lo può annullare; se sono tutti pronti si salta), poi si entra tutti insieme. Se l'host esce, il conto alla rovescia si ferma.
Finita la partita, visti i risultati, si torna all'Adunata. Chi entra a partita in corso vede la stessa schermata e non è sulla mappa finché non conferma.

### Modalità

| | |
|---|---|
| **Bataie di Gnot** | deathmatch a squadre, a 40 |
| **Cjape il Frico** | cattura la bandiera: la forma di frico sull'altare del Duomo e sotto la loggia del Comune, a 3 |
| **Re de Plaçute** | re della collina attorno alla fontana di Via Bini, un punto al secondo, a 120 |
| **Spinç il Cjar** | carrello: i Benandanti spingono il cjar lungo il percorso (avanza con un Benandante vicino e nessun Malandante, conteso si ferma, lasciato solo torna indietro); se arriva in fondo vincono, allo scadere vincono i Malandanti |
| **La Tampieste** | tutti contro tutti, una vita sola: la tempesta stringe attorno al centro della mappa e fuori fa male; vince l'ultimo in piedi |

### Mappe

| | |
|---|---|
| **Glemone** | il Duomo, Via Bini coi portici e la piazza del Municipio |
| **Fuart di Osôf** | il Forte di Osoppo sul colle: bastioni e gallerie |
| **Trinceis dal Pal Piçul** | le trincee della Grande Guerra sulle Alpi Carniche |
| **Vençon** | il borgo murato di Venzone col Duomo di Sant'Andrea |
| **Cave dal Predil** | la miniera di Raibl: binari e carrelli |
| **Lagune di Maran** | di notte, col chiaro di luna, le lanterne lungo sentieri e passerelle e le lucciole nel bosco: la riserva delle Foci dello Stella, grande e quasi tutta acqua bassa, con barene dalle rive irregolari: si guada ma piano, le passerelle e i sentieri sono le strade veloci. La foresteria a due piani (salone, cucina e bagni; camerate e bagni sopra; tetto piano calpestabile con la mitragliatrice), l'argine, il bosco con due sentieri fra gli alberi e il ponticello di legno a schiena d'asino fino al capanno di osservazione, i casoni dei pescatori |

Nella Laguna il **capanno di osservazione** ha la porta chiusa: si sfonda a pedate col mescul, a colpi o con un'esplosione.
Dentro c'è la discoteca (palla a specchi, luci, pavimento che cambia colore a tempo, musica che da fuori si sente attutita),
i fenicotteri che ballano, uno disteso per terra con la testa sullo scalino (tranquilli: dorme, è solo ubriaco), la pentola
della birra e il Lanciafrico per chi entra per primo. Una partita nuova rimette la porta.
Dentro, il **pannello** del muro si strappa tenendo premuto `E` per un paio di secondi: chi lo tiene in mano para quello che arriva da davanti
(colpi, botte ed esplosioni) finché non si rompe, colpisce forte ed è più lento; alla torretta o con un'altra arma in mano non para niente.
Non si porta insieme al Lanciafrico. Cade dove muore chi lo porta e lo prende il primo che ci passa sopra. Il buco nel muro resta per tutta la partita: ci si spara attraverso ma non si passa.

### Armeria

| Arma | |
|---|---|
| Mitra dal Cramâr | automatica (principale) |
| Dopiete di Pre Checo | doppietta, 9 pallini (principale) |
| Il Cjampanili | fucile di precisione con cannocchiale (principale) |
| Il Mulin | mitragliatrice a canne rotanti: prima deve girare, poi spara a raffica; pesante (principale) |
| Cassele dal Miedi | il medico: getto a corto raggio che cura i compagni e scotta i nemici; chi la porta cura piano sé e i compagni vicini (principale) |
| Cjanon des Gjalinis | cannone da braccio che spara galline: volano, puntano da sole il nemico più vicino davanti e gli scoppiano addosso in una nuvola di piume che per un paio di secondi copre la vista (principale) |
| Motosee | motosega: si tiene premuto e, dopo una sgasata, taglia chi è davanti a un braccio di distanza; niente munizioni, sfonda le porte in un attimo e si sente da lontano anche al minimo (principale) |
| La Mandi | pistola, sempre con te |
| Mescul de Polente | corpo a corpo, sempre con te |
| Lanciafrico | arma potente da raccogliere in Via Bini: forme di frico che rimbalzano e scoppiano |
| Panel dal Casot | nella Laguna, l'asse da strappare dal muro del capanno: para quello che arriva da davanti finché regge, colpisce forte e rallenta (vedi sotto) |
| Bombe di Sgnape | granate (`G`), due per vita |
| Mine di Raibl | mine (`F`), due per vita: si piantano a terra, si armano in un secondo e saltano quando passa un nemico |

L'arma principale è la **classe**: decide la salute e la velocità di chi la porta, e il Miedi cura. Tutte le classi hanno la stessa pistola, il mescul, due bombe e due mine.
Si sceglie all'Adunata (o entrando a partita in corso) e per tutta la partita non si cambia: solo nella Dutrine sì, alla bancarella dell'armeria.

| Principale | Salute | Velocità |
|---|---|---|
| Mitra dal Cramâr | 100 | 1,00 |
| Dopiete di Pre Checo | 110 | 1,05 |
| Il Cjampanili | 75 | 0,95 |
| Il Mulin | 150 | 0,80 |
| Cassele dal Miedi | 90 | 1,05 |
| Cjanon des Gjalinis | 100 | 0,95 |
| Motosee | 125 | 1,12 |

Con l'**arma unica**, scelta dall'host alla creazione o all'Adunata, tutti hanno la stessa principale e il mescul, nient'altro: niente pistola, bombe, mine né Lanciafrico.

**Torrette**: ogni mappa ne ha due, una per parte, con la *Mitraie de Postazion*. Ci si mette dietro e si preme `E`:
si resta fermi, l'arma gira solo dentro il suo arco, colpi infiniti, veloci e precisi. Ma scalda: dopo circa tre secondi
di fuoco continuo si surriscalda e non spara finché non si è raffreddata del tutto. `E` o `Spazio` per scendere.

Raccolte: **frico** (+40 salute), **gubane** (+50 corazza), **sgnape** (corri più forte, la vista ondeggia), **munizions**.
I **cjars di fen** (carri di fieno) lanciano sul ballatoio del campanile e sulla terrazza del Comune.

### Comandi

`WASD` muoversi · mouse mirare · clic sinistro sparare · destro mirare · `Spazio` saltare · `Ctrl`/`C` accucciarsi · `Shift` correre (con l'arma abbassata: non si spara) ·
`R` ricaricare · `1-4` armi · `Q` arma precedente · rotella cambia arma · `G` bomba di sgnape · `F` mina di Raibl · `E` torretta · `Tab` classifica ·
`Invio`/`T` chat · `V` frasi rapide (Mandi!, Orpo!, …) · `B` armeria (nella Dutrine) · `Esc` menu di partita.

**Controller** (DualShock, o ogni pad che il browser riconosce con la mappatura standard; basta premere un tasto in partita):
stick sinistro muoversi (analogico) · stick destro guardare · `R2` sparare · `L2` mirare · `✕` saltare · `◯` accucciarsi ·
`L3` correre (finché si va avanti) · `▢` ricaricare · `△` arma dopo · croce armi (su principale, sinistra pistola, destra lanciafrico, giù torretta) ·
`R3` mescul · `L1` bomba · `R1` mina · `Share` classifica · `Touchpad` armeria (nella Dutrine) · `Options` menu di partita. Il pad vibra quando spari e quando ti colpiscono.
I menu fuori dalla partita si usano ancora col mouse.

## La Dutrine

La **Dutrine** è l'allenamento: un giocatore solo, sempre offline (anche senza server), sulla sua piccola mappa, la **Sagre dal Frico**:
una sagra di paese con le stazioni come bancarelle in fila lungo la strada e, in fondo, una piazzetta per le modalità e la scaramuccia.
Si apre dalla schermata iniziale (*Impare a zuiâ*) e serve un nome, come per ogni stanza. Si gioca da Benandante, senza fuoco amico,
senza Adunata, orologio né punteggio limite: finisce quando l'ultimo passo è fatto.
La prima volta si parte dalla stazione 1; poi, entrando, si apre prima l'elenco delle stazioni (a gioco fermo),
con quella da cui continuare già scelta; a Dutrine finita una volta sono tutte segnate come fatte e si sceglie liberamente.

Ogni stazione chiede alcuni passi, in ordine; il pannello dice la stazione, a che passo si è e quanti ne restano (un segno per passo),
il passo con il comando del dispositivo in uso (tastiera, controller o touch) e quante volte manca. La strada verso la stazione dopo resta sbarrata finché la stazione non è finita.

| | |
|---|---|
| 1. Cjale e cjamine | guardarsi attorno e camminare |
| 2. Il percors | saltare la sbarra, passare accucciati sotto la trave, correre |
| 3. Simpri cun te | la Mandi, mirare, ricaricare, il mescul, sfondare una porta |
| 4. Gambiâ arme | per numero, l'arma precedente, con la rotella |
| 5. Lis bancjarelis | le armi principali, una bancarella ciascuna (la Cassele è dal medico) |
| 6. La armarie | scegliere la propria arma principale |
| 7. Bombis e minis | la bomba di sgnape e la mina di Raibl |
| 8. Robe di cjapâ sù | frico, gubane, sgnape, munizions |
| 9. La torete e il Lanciafrico | salire sulla torretta, surriscaldarla, scendere; raccogliere e sparare il Lanciafrico |
| 10. Il miedi | curare un compagno ferito con la Cassele dal Miedi |
| 11. Lis modalitâts | portare a casa il frico, tenere la plaçute, spingere il cjar, restare dentro la tempesta |
| 12. La scaramucie | vincere una breve Bataie di Gnot contro due bot che sparano, aprire la classifica, mandare una frase rapida, scrivere un messaggio in chat |

Prima della scaramuccia i bot delle stazioni non sparano e non si muore: un colpo che ucciderebbe lascia un punto di salute.
Nella scaramuccia i bot sparano, alla bravura più bassa (Zovin), si muore davvero e si rinasce dalla parte della scaramuccia;
la vincono i Benandanti a 5 punti, uno per nemico abbattuto, contati da quando comincia; vinta, i bot smettono di sparare e tornano al loro posto.
Un passo che il dispositivo in uso non ha (le frasi rapide sul controller, l'arma precedente e la chat sul controller e sul touch)
è segnato come non disponibile e si completa da solo.
Alla fine la schermata della Dutrine offre tre strade: tornare all'inizio, l'elenco delle stazioni, una partita contro i bot in un tocco.

## Struttura

Stack dalle linee guida (`giovannilondero/game-dev-guidelines`, 3D): **Ritmo** (ECS e simulazione) + **Three.js** + **Howler.js** + **Rapier 3D**.

- `shared/map.ts`, `shared/maps/`: le mappe come dati, unica fonte per collisioni, grafica, spawn, obiettivi, percorso del cjar e grafo dei bot
- `shared/physics.ts`: il mondo statico in Rapier 3D e il character controller (server e client)
- `shared/movement.ts`: il movimento in prima persona, funzione pura usata dal server e dalla predizione del client
- `shared/sim/`: la simulazione Ritmo (60 tick/s): schema, sistemi (ingressi, partita, rinascita, movimento, armi con compensazione della latenza, torrette, proiettili, mine e galline, porte da sfondare, medico, tempesta, danni e cure, raccolte, obiettivi e cjar), proiezioni per l'host
- `shared/weapons.ts`, `shared/folklore.ts`: armi, squadre, modalità, bot (solo dati, senza lingua)
- `client/i18n.ts`: tutti i testi in friulano e italiano: menu, HUD, battute, consigli, vocabolario
- `shared/protocol.ts`: messaggi client ↔ server, validati con zod
- `shared/training/`: la Dutrine come dati: stazioni e passi in ordine, cosa completa ogni passo, quali dispositivi hanno ogni comando; i testi sono in `client/training-text/`, il giocatore automatico dei test in `test/trainee/`
- `server/`: server autoritativo Bun (stanze, rete locale, codici), bot e loro grafo di navigazione; `worker.ts` è lo stesso server in un Durable Object
- `client/offline.ts`, `client/host.worker.ts`: le stanze offline, ospitate in un worker del browser dallo stesso `Hub` del server (vedi `docs/adr/0001-offline-rooms-hosted-in-the-browser.md`)
- `server/nav-graphs.ts`: i grafi dei bot precalcolati (costano decine di secondi di CPU); `pnpm nav` li rifà quando cambia una mappa, il movimento o la fisica, e `test/nav.test.ts` controlla che siano aggiornati
- `client/`: rendering Three.js (mondo, avatar, arma in prima persona, effetti), audio sintetizzato con Howler, predizione e interpolazione, HUD e menu
- `client/looks.ts`: i due stili grafici; **Vêr** carica le superfici fotografate di `client/public/tex/` e le armi di `client/public/models/`, esportate dagli script Blender di `assets/blender/` (`pnpm models`)
- `client/public/manifest.webmanifest`, `client/public/icons/`, `client/installed.ts`: il gioco installabile; le icone vengono da `favicon.svg` (`pnpm icons` le ridisegna con Brave senza finestra)
- `test/`: test senza browser della simulazione, del grafo dei bot e di partite intere fra bot

Rete: il server è autoritativo; il client predice il proprio movimento con la stessa fisica e rigioca i comandi non confermati,
interpola gli altri giocatori 100 ms nel passato, e il server colpisce dove il tiratore vedeva il bersaglio.

```sh
pnpm check   # tipi, oxlint + ritmo-devtools lint, test
```

Dietro un proxy sulla stessa macchina (il tunnel `cloudflared`, Vite) il server legge da solo l'IP reale da `CF-Connecting-IP` o `X-Forwarded-For`; dietro un reverse proxy su un'altra macchina imposta `TRUST_PROXY=1`.

Link d'invito: se giochi da `localhost` il link usa l'indirizzo pubblico del gioco. Il server lo impara dal primo client che entra da un tunnel o da un dominio, oppure lo prende da `PUBLIC_URL=https://…` (che Vite aggiunge anche agli host accettati).

## Nota

Gemona è stata distrutta dal terremoto del 1976 e ricostruita "dov'era e com'era"; il Duomo è rinato pietra su pietra.
Il gioco scherza col folklore, non con quella storia.
