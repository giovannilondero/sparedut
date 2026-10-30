# Sparedût

Sparatutto in prima persona nel browser, ambientato a **Gemona del Friuli, zona Duomo**.
Due squadre del folklore friulano si contendono il sagrato, Via Bini e Piazza del Municipio:
i **Benandanti** (fusti di finocchio, salvano il raccolto) contro i **Malandanti** (canne di sorgo, vogliono la grandine).

Multigiocatore online con codice d'invito e in rete locale, fino a 16 giocatori, con bot a tre livelli di bravura.
Interfaccia in **friulano** o **italiano** (selettore in alto a destra nel menu); `Esc` torna indietro in tutti i menu.

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

## Partite

- **Zuie cuintri i bot**: partita privata contro la CPU, subito.
- **Cree une partide**: modalità, mappa, durata, bot per squadra e bravura (Zovin, Pari di famee, Plevan), fuoco amico.
  - *Rete locale*: compare nella lista "Partidis in rêt locâl" di chi è sulla stessa rete (stesso IP pubblico visto dal server; se il server gira in LAN, tutti gli IP privati contano come stessa rete), ed è raggiungibile anche col codice.
  - *Solo con codice*: non è in lista; si entra col codice di 4 lettere o col link `?p=CODICE`.
- Chi crea è l'host: dal menu di partita (`Esc`) fa partire la partita, aggiunge o toglie bot, cambia la bravura.
  Se una partita è piena di bot, una persona che entra prende il posto di un bot.

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
| **Lagune di Maran** | la riserva delle Foci dello Stella, grande e quasi tutta acqua bassa (si guada): la foresteria a due piani (salone, cucina e bagni; camerate e bagni sopra; tetto piano calpestabile con la mitragliatrice), l'argine con le passerelle, i casoni dei pescatori e il capanno di osservazione |

Nella Laguna il **capanno di osservazione** ha la porta chiusa: si sfonda a pedate col mescul, a colpi o con un'esplosione.
Dentro c'è la discoteca (palla a specchi, luci, pavimento che cambia colore a tempo, musica che da fuori si sente attutita),
i fenicotteri che ballano, uno disteso per terra con la testa sullo scalino (tranquilli: dorme, è solo ubriaco), la pentola
della birra e il Lanciafrico per chi entra per primo. Una partita nuova rimette la porta.

### Armeria

| Arma | |
|---|---|
| Mitra dal Cramâr | automatica (principale) |
| Dopiete di Pre Checo | doppietta, 9 pallini (principale) |
| Il Cjampanili | fucile di precisione con cannocchiale (principale) |
| Il Mulin | mitragliatrice a canne rotanti: prima deve girare, poi spara a raffica; pesante (principale) |
| Cassele dal Miedi | il medico: getto a corto raggio che cura i compagni e scotta i nemici; chi la porta cura piano sé e i compagni vicini (principale) |
| Cjanon des Gjalinis | cannone da braccio che spara galline: volano, puntano da sole il nemico più vicino davanti e gli scoppiano addosso in una nuvola di piume che per un paio di secondi copre la vista (principale) |
| La Mandi | pistola, sempre con te |
| Mescul de Polente | corpo a corpo, sempre con te |
| Lanciafrico | arma potente da raccogliere in Via Bini: forme di frico che rimbalzano e scoppiano |
| Bombe di Sgnape | granate (`G`), due per vita |
| Mine di Raibl | mine (`F`), due per vita: si piantano a terra, si armano in un secondo e saltano quando passa un nemico |

**Torrette**: ogni mappa ne ha due, una per parte, con la *Mitraie de Postazion*. Ci si mette dietro e si preme `E`:
si resta fermi, l'arma gira solo dentro il suo arco, colpi infiniti, veloci e precisi. Ma scalda: dopo circa tre secondi
di fuoco continuo si surriscalda e non spara finché non si è raffreddata del tutto. `E` o `Spazio` per scendere.

Raccolte: **frico** (+40 salute), **gubane** (+50 corazza), **sgnape** (corri più forte, la vista ondeggia), **munizions**.
I **cjars di fen** (carri di fieno) lanciano sul ballatoio del campanile e sulla terrazza del Comune.

### Comandi

`WASD` muoversi · mouse mirare · clic sinistro sparare · destro mirare · `Spazio` saltare · `Ctrl`/`C` accucciarsi · `Shift` correre (con l'arma abbassata: non si spara) ·
`R` ricaricare · `1-4` armi · `Q` arma precedente · rotella cambia arma · `G` bomba di sgnape · `F` mina di Raibl · `E` torretta · `Tab` classifica ·
`Invio`/`T` chat · `V` frasi rapide (Mandi!, Orpo!, …) · `B` armeria · `Esc` menu di partita.

**Controller** (DualShock, o ogni pad che il browser riconosce con la mappatura standard; basta premere un tasto in partita):
stick sinistro muoversi (analogico) · stick destro guardare · `R2` sparare · `L2` mirare · `✕` saltare · `◯` accucciarsi ·
`L3` correre (finché si va avanti) · `▢` ricaricare · `△` arma dopo · croce armi (su principale, sinistra pistola, destra lanciafrico, giù torretta) ·
`R3` mescul · `L1` bomba · `R1` mina · `Share` classifica · `Touchpad` armeria · `Options` menu di partita. Il pad vibra quando spari e quando ti colpiscono.
I menu fuori dalla partita si usano ancora col mouse.

## Struttura

Stack dalle linee guida (`giovannilondero/game-dev-guidelines`, 3D): **Ritmo** (ECS e simulazione) + **Three.js** + **Howler.js** + **Rapier 3D**.

- `shared/map.ts`, `shared/maps/`: le mappe come dati, unica fonte per collisioni, grafica, spawn, obiettivi, percorso del cjar e grafo dei bot
- `shared/physics.ts`: il mondo statico in Rapier 3D e il character controller (server e client)
- `shared/movement.ts`: il movimento in prima persona, funzione pura usata dal server e dalla predizione del client
- `shared/sim/`: la simulazione Ritmo (60 tick/s): schema, sistemi (ingressi, partita, rinascita, movimento, armi con compensazione della latenza, torrette, proiettili, mine e galline, porte da sfondare, medico, tempesta, danni e cure, raccolte, obiettivi e cjar), proiezioni per l'host
- `shared/weapons.ts`, `shared/folklore.ts`: armi, squadre, modalità, bot (solo dati, senza lingua)
- `client/i18n.ts`: tutti i testi in friulano e italiano: menu, HUD, battute, consigli, vocabolario
- `shared/protocol.ts`: messaggi client ↔ server, validati con zod
- `server/`: server autoritativo Bun (stanze, rete locale, codici), bot e loro grafo di navigazione
- `client/`: rendering Three.js (mondo, avatar, arma in prima persona, effetti), audio sintetizzato con Howler, predizione e interpolazione, HUD e menu
- `test/`: test senza browser della simulazione, del grafo dei bot e di partite intere fra bot

Rete: il server è autoritativo; il client predice il proprio movimento con la stessa fisica e rigioca i comandi non confermati,
interpola gli altri giocatori 100 ms nel passato, e il server colpisce dove il tiratore vedeva il bersaglio.

```sh
pnpm check   # tipi, oxlint + ritmo-devtools lint, test
```

Dietro un reverse proxy imposta `TRUST_PROXY=1`, così il server legge l'IP reale da `X-Forwarded-For`.

Link d'invito: se giochi da `localhost` il link usa l'indirizzo pubblico del gioco. Il server lo impara dal primo client che entra da un tunnel o da un dominio, oppure lo prende da `PUBLIC_URL=https://…` (che Vite aggiunge anche agli host accettati).

## Nota

Gemona è stata distrutta dal terremoto del 1976 e ricostruita "dov'era e com'era"; il Duomo è rinato pietra su pietra.
Il gioco scherza col folklore, non con quella storia.
