# Writly — Analisi e pianificazione

> Branch `preview` · ripartenza da zero · bozza 1 (17/11/2026)

## 1. Visione

Writly è uno spazio di lavoro per chi scrive **racconti, romanzi e saghe**. Unisce in un solo posto quello che oggi è sparso tra word processor, quaderni di appunti, fogli di calcolo con i personaggi e cartelle di versioni ("capitolo3_def_DEF2.docx").

Tre principi guidano il progetto:

1. **Il testo è dell'autore.** Tutto è salvato in file leggibili (Markdown + JSON/YAML) dentro un repository GitHub dell'autore. Se Writly sparisse domani, il libro resterebbe intatto e consultabile.
2. **La struttura aiuta, non obbliga.** I modelli narrativi (Viaggio dell'eroe, Dara Marks, Save the Cat) sono impalcature opzionali: si può scrivere un racconto senza struttura e aggiungerla dopo.
3. **Scrivere è il centro.** L'editor resta pulito; schede personaggio, scene e versioni compaiono quando servono, a lato, senza interrompere.

## 2. Utenti e scenari principali

| Scenario | Descrizione |
|---|---|
| Racconto breve | Un solo progetto, pochi capitoli, nessun modello narrativo. Serve: editor, ortografia, versioni, PDF. |
| Romanzo | Modello narrativo → sezioni → scene → capitoli. Personaggi con schede e relazioni. Export completo e a opuscolo. |
| Saga | Più romanzi che condividono personaggi, luoghi, glossario e appunti. Un personaggio evolve attraverso i libri. |
| Idea vagante | L'autore annota uno spunto che non appartiene ancora a nessun libro: finisce negli Appunti globali e può essere collegato più tardi. |

## 3. Modello dei dati

```
Libreria (account autore)
├── Appunti globali (idee, glossario, spunti — non legati a un libro)
└── Progetto  ── tipo: racconto | romanzo | saga
    ├── Personaggi, Glossario di progetto           (condivisi nella saga)
    ├── Mondo: luoghi, culture e fazioni, sistemi e regole,
    │         storia del mondo, oggetti, lingue      (condiviso nella saga)
    ├── Opera (romanzo o racconto; una saga ne contiene più di una)
    │   ├── Modello narrativo (istanza: es. Viaggio dell'eroe)
    │   │   └── Sezione / beat (es. "3. Rifiuto della chiamata")
    │   │       └── Scena  (obiettivo, conflitto, esito, POV, luogo, personaggi)
    │   └── Capitolo  ── contiene 1..n scene, testo Markdown
    └── Template PDF
```

Relazioni chiave:

- **Scena ↔ Sezione**: ogni scena appartiene al massimo a una sezione del modello (o a "Non assegnate").
- **Scena ↔ Capitolo**: molti-a-uno. Un capitolo realizza una o più scene; una scena pianificata ma non ancora scritta non ha capitolo. Questo dà la vista "pianificato vs scritto".
- **Personaggio ↔ Personaggio**: relazioni tipizzate e orientate (padre di, rivale, ama, mentore di…) con nota e, nelle saghe, validità per libro ("alleati nel libro 1, nemici nel 2").
- **Personaggio ↔ Testo**: riconoscimento automatico per nome e alias nel capitolo, più conferma manuale nei casi ambigui.

### Formato su GitHub (un repository per progetto)

```
writly.yaml                      # tipo progetto, lingua, opere, impostazioni
opere/<slug>/opera.yaml          # titolo, modello narrativo scelto, ordine capitoli
opere/<slug>/struttura.yaml      # sezioni del modello + scene (id, titolo, stato, capitolo)
opere/<slug>/capitoli/NN-<slug>.md   # front-matter (id, titolo, scene, stato) + testo
personaggi/<slug>.md             # front-matter strutturato + biografia libera
relazioni.yaml                   # archi del grafo personaggi
mondo/<categoria>/<slug>.md      # luoghi, culture, sistemi, oggetti… (front-matter + testo)
mondo/categorie.yaml             # categorie e campi personalizzati
mondo/regole.yaml                # regole del mondo (vincoli di coerenza)
mondo/cronologia.yaml            # storia del mondo (eventi datati con calendario proprio)
mondo/mappe/<nome>.yaml          # immagine della mappa + segnaposti collegati alle voci
glossario.yaml
appunti/<slug>.md
template-pdf/<nome>.yaml
dizionario.txt                   # parole accettate dal controllo ortografico
```

Markdown per tutto ciò che è testo (così i diff Git sono leggibili riga per riga), YAML per i dati strutturati. Gli id sono stabili e indipendenti dai titoli, così rinominare un capitolo non rompe i riferimenti.

## 4. Requisiti funzionali

Priorità: **M** = indispensabile (MVP), **S** = importante, **C** = utile se c'è tempo.

### 4.1 Libreria e progetti
- **M** Creazione progetto (racconto/romanzo/saga) → crea o collega un repository GitHub.
- **M** Dashboard: progetti, ultimo capitolo modificato, parole scritte, stato.
- **S** Saga: aggiungere opere a una saga esistente; personaggi e glossario condivisi.

### 4.2 Editor di capitolo
- **M** Editor rich-text minimale che salva in Markdown (grassetto, corsivo, titoli, separatore di scena, citazioni).
- **M** **Controllo ortografico italiano** in tempo reale: parole sottolineate, suggerimenti al clic, "Aggiungi al dizionario" (dizionario per progetto, salvato su repo) e "Ignora". Nomi di personaggi, luoghi e voci del glossario sono automaticamente accettati.
- **S** Controlli di stile: ripetizioni ravvicinate, frasi molto lunghe, avverbi in *-mente*, parole abusate (opzionali, disattivabili).
- **S** Controllo grammaticale tramite LanguageTool (self-hosted o API) — opt-in, perché invia il testo a un servizio.
- **M** **Personaggi citati**: il pannello laterale elenca i personaggi trovati nel capitolo (nome + alias); al passaggio del mouse su un nome compare la scheda sintetica, al clic la scheda completa.
- **M** Autosalvataggio locale continuo (IndexedDB), indipendente dal commit.
- **M** **Statistiche del capitolo** sempre visibili: parole, **battute con spazi** e **battute senza spazi** (le misure usate da editori e concorsi), anche sulla selezione corrente, sulla scena e sull'opera intera.
- **S** Modalità concentrazione (solo testo), obiettivo parole o battute per sessione/capitolo.
- **S** Note a margine/commenti su porzioni di testo.

### 4.3 Modelli narrativi e architettura delle scene
- **M** Scelta di un modello per ogni opera, con sezioni precompilate:
  - **Viaggio dell'eroe** (12 tappe, versione Vogler): mondo ordinario, chiamata all'avventura, rifiuto della chiamata, incontro con il mentore, superamento della prima soglia, prove alleati e nemici, avvicinamento alla caverna più profonda, prova centrale, ricompensa, la via del ritorno, resurrezione, ritorno con l'elisir.
  - **Save the Cat! Writes a Novel** (Jessica Brody, 15 beat): immagine d'apertura, tema enunciato, setup, catalizzatore, dibattito, passaggio al secondo atto, storia B, divertimento e giochi, punto centrale, i cattivi si avvicinano, tutto è perduto, notte buia dell'anima, passaggio al terzo atto, finale, immagine finale.
  - **Dara Marks** (*Inside Story*, arco trasformativo): struttura in tre atti con punti di svolta, punto centrale e climax, affiancata dall'arco interiore del protagonista (difetto fatale → trasformazione). *Le sezioni esatte da precaricare vanno validate con te.*
  - **Libero / personalizzato**: l'autore definisce le proprie sezioni; un modello personalizzato può essere salvato e riusato.
- **M** **Editor di strutture narrative** (sezione a sé, a livello di libreria):
  - le strutture predefinite sono in sola lettura; ogni struttura (predefinita o personale) si può **clonare** per partire da lì invece che da zero;
  - in alternativa si crea una struttura **nuova da zero**;
  - per ogni struttura: nome, descrizione, origine ("clonata da…"), sezioni raggruppate in atti/gruppi;
  - per ogni sezione: nome, guida/descrizione, peso percentuale sul libro; si aggiungono, eliminano e riordinano sezioni e atti; controllo che i pesi sommino al 100% con pulsante "ribilancia";
  - anteprima delle proporzioni e stima delle parole per sezione rispetto all'obiettivo del libro;
  - elenco dei progetti che usano la struttura; modificare una struttura in uso non perde scene (quelle di sezioni eliminate vanno in "Non assegnate");
  - le strutture personali sono file YAML (repository personale), quindi versionate, esportabili e importabili.
- **M** Per ogni sezione: descrizione/guida del beat, percentuale indicativa sul totale del libro, elenco ordinabile di **scene** (drag & drop anche tra sezioni).
- **M** **Editor di scena**: titolo, sinossi, obiettivo, conflitto, esito, POV, luogo, momento in cui accade, personaggi presenti, stato (idea → pianificata → in stesura → scritta → revisionata), capitolo di destinazione.
- **M** Vista d'insieme: tabella/kanban di scene e capitoli con stato e conteggio parole; si vede subito quali sezioni sono scoperte o sbilanciate.
- **S** Cambio di modello a opera avviata, con mappatura assistita delle scene sulle nuove sezioni.
- **C** Timeline cronologica degli eventi (distinta dall'ordine del racconto) per gestire flashback.

### 4.4 Personaggi
- **M** Scheda: nome, alias/soprannomi (servono anche al riconoscimento nel testo), ruolo, età, ritratto.
  - *Fisico*: aspetto, tratti distintivi, abbigliamento.
  - *Morale*: valori, paure, desideri, difetto, segreto.
  - *Comportamento*: modo di parlare, tic, abitudini, reazioni sotto stress.
  - *Arco*: punto di partenza → punto d'arrivo (collegabile alle sezioni del modello).
- **M** Relazioni tipizzate tra personaggi + **grafo** navigabile.
- **S** Comparse per capitolo: in quali capitoli/scene appare un personaggio, prima e ultima apparizione.
- **S** Controllo continuità: avviso se nel testo compare un attributo in contrasto con la scheda (es. "occhi azzurri" quando la scheda dice verdi) — euristico, mai bloccante.

### 4.4 bis Worldbuilding (Mondo)
Sezione a livello di progetto/saga, condivisa da tutti i libri come i personaggi.
- **M** **Voci del mondo** organizzate per categoria: luoghi, culture e fazioni, sistemi e regole (magia, tecnologia, economia, religione, politica), oggetti e artefatti, storia del mondo, lingue (collegate al glossario). Categorie aggiungibili dall'autore.
- **M** **Campi personalizzabili per categoria** (es. luogo → clima, popolazione, governo; fazione → capo, obiettivi, alleati): l'autore definisce il modello di scheda una volta e lo riusa.
- **M** Voci **gerarchiche** (regno → città → quartiere → locanda) e collegate tra loro, ai personaggi (nato a, membro di), alle scene (luogo della scena) e agli appunti.
- **M** **Riconoscimento nel testo** come per i personaggi: i nomi di luoghi, fazioni e oggetti citati nel capitolo compaiono nel pannello laterale con la scheda; entrano nel dizionario ortografico.
- **S** **Mappe**: si carica un'immagine (disegnata a mano o con altri strumenti) e si posizionano segnaposti collegati alle voci; dalla mappa si apre la scheda, dalla scheda si vede il punto sulla mappa.
- **S** **Storia del mondo**: cronologia di eventi con un calendario proprio (ere, anni, mesi inventati), distinta dalla timeline della trama ma collegabile a essa.
- **S** **Regole del mondo**: vincoli dichiarati ("la magia del sale non funziona sull'acqua dolce", "da Vael alla Torre servono 3 giorni di nave") mostrati come promemoria quando si scrive una scena collegata; in futuro, controllo di coerenza assistito.
- **S** Indicatori di "debito di worldbuilding": voci citate nel testo ma senza scheda, schede mai usate nel testo.
- **C** Generatore di nomi coerente con le lingue inventate del progetto.

### 4.5 Versioning con GitHub
- **M** Collegamento a un account GitHub (OAuth / GitHub App) e a un repository per progetto.
- **M** **Salva versione** = commit con messaggio (precompilato e modificabile: "Cap. 7 — riscritto il dialogo al porto"). Non ogni battuta diventa un commit: l'autosalvataggio è locale, la versione è un gesto volontario (con opzione di commit automatico ogni N minuti).
- **M** **Storico** per capitolo e per progetto: elenco versioni con data, messaggio, parole aggiunte/rimosse.
- **M** **Confronto** tra due versioni: affiancato o in linea, granularità a parola (più utile della riga per la prosa).
- **S** Confronto tra **più di due** versioni: colonne affiancate con navigazione sincronizzata, oppure "evoluzione di un paragrafo" nel tempo.
- **S** Ripristino di una versione intera o di un singolo paragrafo.
- **S** **Varianti** (branch Git sotto un nome comprensibile: "Finale alternativo"), con confronto e unione.
- **C** Sincronizzazione bidirezionale: se il repo viene modificato da fuori (altro dispositivo, editor esterno, assistente AI), Writly mostra le differenze e chiede come unire.

### 4.6 Appunti, idee e glossario
- **M** Appunti in Markdown con tipo (idea, spunto, ricerca, citazione, lista), tag e collegamenti a progetti, personaggi, scene.
- **M** **Appunti globali** fuori da ogni progetto: un'idea può nascere per il libro 1 ed essere "spostata" o "collegata" al libro 3.
- **M** **Glossario**: termine, definizione, categoria (lingua inventata, luogo, gergo, tecnologia…), note d'uso. I termini entrano nel dizionario ortografico del progetto.
- **S** Cattura rapida (scorciatoia globale / campo "nuova idea" sempre visibile) e inbox da smistare.
- **S** Collegamenti `[[Titolo]]` tra appunti e ricerca full-text.
- **C** Allegati (immagini di riferimento, mappe).

### 4.7 Export PDF
- **M** Esportazione di: un capitolo, una selezione di capitoli, l'opera intera.
- **M** **Template personalizzabili** dall'autore: formato pagina (A4, A5, 14×21, 15×23…), margini e rilegatura, font e corpo del testo, interlinea, rientri, stile titoli di capitolo, intestazioni/piè di pagina, numerazione, frontespizio, indice, separatore di scena. Un template si salva, si duplica e si riusa.
- **M** **Modalità opuscolo** per stampanti fronte/retro: imposizione automatica delle pagine (ordine 4-1 / 2-3…) su fogli A4 o A3 piegati a metà; pagine bianche aggiunte per arrivare a un multiplo di 4; scelta fronte/retro sul lato lungo o corto; anteprima del foglio piegato.
- **S** Opuscolo a **segnature** (fascicoli da 4–8 fogli da cucire) per libri lunghi; compensazione del creep opzionale.
- **S** Anteprima prima dell'export; filigrana "BOZZA" opzionale.
- **C** Export EPUB e DOCX (per invio a editor/agenti).

### 4.8 Altre idee proposte
- **Statistiche di scrittura**: parole al giorno, serie di giorni consecutivi, tempo di lettura stimato.
- **Ricerca e sostituzione globale** nel progetto (utile per rinominare un personaggio, con anteprima).
- **Modalità revisione**: passata di lettura con commenti, poi lista di cose da sistemare.
- **Lettori beta**: link in sola lettura con commenti (a lungo termine).
- **Assistente AI opzionale** (mentore narrativo): suggerimenti su scene, coerenza dei personaggi, ritmo. Opt-in, mai riscrittura automatica del testo.
- **Offline**: l'app funziona senza rete e sincronizza al ritorno (PWA).

## 5. Requisiti non funzionali

- **Proprietà dei dati**: nessun database applicativo obbligatorio; GitHub è la fonte di verità, il browser fa da cache.
- **Affidabilità**: nessuna perdita di testo — autosalvataggio locale ogni pochi secondi, conflitti mostrati e mai sovrascritti in silenzio.
- **Privacy**: il token GitHub resta lato server; i servizi esterni (grammatica, AI) sono opt-in e dichiarati.
- **Prestazioni**: un romanzo da 150.000 parole deve aprirsi e restare fluido; controllo ortografico in un Web Worker.
- **Accessibilità**: tastiera completa, contrasti AA, tema chiaro/scuro.
- **Lingua**: interfaccia e dizionario in italiano dall'inizio; architettura pronta per altre lingue.

## 6. Architettura proposta

| Livello | Scelta | Motivo |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | Già familiare; route API per proxy GitHub e generazione PDF. |
| Editor | **TipTap (ProseMirror)** | Decorazioni per errori ortografici e nomi dei personaggi senza toccare il testo; serializzazione Markdown. |
| Ortografia | **nspell + dizionario Hunspell it-IT** in Web Worker | Funziona offline e lato client; dizionario utente sommato a personaggi/glossario. LanguageTool solo opt-in. |
| GitHub | **GitHub App** (permessi limitati ai repo scelti) via **Octokit**, Git Data API per commit multi-file atomici | Meglio di un token OAuth con accesso a tutti i repo. |
| Cache locale | **IndexedDB** (Dexie) | Autosalvataggio e uso offline. |
| Diff | **diff-match-patch** a livello parola | Confronti leggibili sulla prosa. |
| PDF | **Paged.js** (HTML+CSS → pagine) con Chromium headless lato server; **pdf-lib** per l'imposizione a opuscolo | I template diventano fogli di stile; l'imposizione è un passaggio separato e testabile. |
| Grafo personaggi | **React Flow** | Layout e interazione pronti; regge decine/centinaia di nodi. |
| UI | Tailwind + componenti accessibili (Radix) | Rapidità e accessibilità. |

Alternativa da valutare per il PDF: **Typst** (tipografia eccellente, molto veloce), al prezzo di un secondo linguaggio di template.

## 7. Roadmap

### Stato dell'implementazione (branch `preview`)

Fasi 0, 1, 2 e 3 completate. Scostamenti rispetto all'architettura proposta, decisi durante lo sviluppo:

- **Login**: OAuth App GitHub tramite Auth.js v5, non ancora GitHub App. Il token resta nel JWT di sessione cifrato e si legge solo lato server; `/api/auth/session` non lo espone.
- **Ortografia**: Hunspell (`hunspell-asm`, WebAssembly) sul thread principale, non in un Web Worker: con un capitolo di qualche migliaio di parole e la cache per parola il ricalcolo resta impercettibile. Da spostare in un worker se emergono rallentamenti su capitoli molto lunghi. Le elisioni («dell'acqua», «c'è») si controllano intere: il dizionario italiano le riconosce così e segnala anche «un'altro».
- **Bozze locali**: IndexedDB (`idb-keyval`) più una copia sincrona in `localStorage` scritta quando la pagina si chiude, perché una scrittura IndexedDB avviata in quel momento può non completarsi.
- **UI**: CSS semplice con variabili (tema chiaro/scuro), senza Tailwind/Radix per ora.
- **Titolo dei capitoli**: vive solo in `opera.yaml` (unica fonte); il front-matter del capitolo contiene `id` e `stato`.
- **Scene**: vivono solo in `opere/<opera>/struttura.yaml`, insieme alla copia della struttura usata dall'opera (atti, sezioni, pesi). Il collegamento scena → capitolo è il campo `capitolo` della scena: il front-matter dei capitoli non elenca le scene, così c'è una sola fonte.
- **Strutture personali**: file `strutture/<id>.yaml` nel repository privato `writly-libreria` dell'autore, creato al primo salvataggio. Ogni opera ne tiene una copia: modificare la struttura di libreria non cambia le opere già avviate.
- **Salvataggi**: struttura e scene si modificano in locale (copia in IndexedDB, ripresa dopo una chiusura) e diventano una versione con «Salva struttura», come i capitoli. Schede personaggio e voci del mondo si salvano una alla volta («Salva scheda»); relazioni e categorie si salvano subito a ogni modifica. Tutti i salvataggi usano lo sha letto: in caso di conflitto non si sovrascrive.
- **Caricamento delle schede**: un solo albero Git (`git/trees`, ricorsivo) e un blob per file, invece di elencare le cartelle una per una.
- **Riconoscimento nel testo**: nel browser, per nome e alias, sensibile alle maiuscole e ai confini di parola; i nomi più lunghi hanno la precedenza («Torre del Sale» prima di «Sale»). I nomi condivisi da più schede sono segnalati nel pannello. Le parole dei nomi sono accettate dal controllo ortografico.
- **Grafo delle relazioni**: disposizione circolare in SVG, senza librerie; la tabella delle relazioni è l'alternativa testuale.
- **Dara Marks**: le sezioni precaricate sono una proposta (difetto fatale → trasformazione su tre atti), da validare (vedi domande aperte).

Rimandati rispetto ai requisiti delle fasi 2 e 3 (restano nel piano):

- ritratto del personaggio (immagine nel repository) e collegamento dell'arco alle sezioni del modello;
- elenco dei progetti che usano una struttura di libreria;
- conferma manuale dei nomi ambigui (oggi c'è solo l'avviso) e comparse per capitolo (S);
- mappatura assistita delle scene al cambio di modello (S): oggi le scene di sezioni che non esistono più vanno in «Non assegnate»;
- indicatori di «debito di worldbuilding» (S) e collegamento delle voci agli appunti (fase 4);
- modifica di una relazione esistente: oggi si toglie e si aggiunge di nuovo.


| Fase | Contenuto | Esito |
|---|---|---|
| **0 — Fondamenta** ✅ | Repo, stack, login GitHub, creazione/collegamento progetto, formato file | Si apre un progetto vuoto da GitHub |
| **1 — Scrivere** ✅ | Editor capitolo, autosalvataggio, controllo ortografico, statistiche (parole e battute), salva versione, storico | MVP usabile per un racconto |
| **2 — Strutturare** ✅ | Modelli narrativi, sezioni, editor di scena, collegamento scene↔capitoli, vista d'insieme | MVP per un romanzo |
| **3 — Personaggi e mondo** ✅ | Schede personaggio, relazioni, grafo; voci del mondo con campi personalizzati; riconoscimento nel testo e pannello laterale | |
| **3b — Mondo avanzato** | Mappe con segnaposti, storia del mondo con calendario proprio, regole del mondo | |
| **4 — Appunti** | Appunti globali e di progetto, glossario, collegamenti, cattura rapida | |
| **5 — Export** | Template PDF, export capitolo/selezione/opera, opuscolo e segnature | |
| **6 — Versioni avanzate** | Confronto multi-versione, varianti/branch, ripristino parziale, sync esterna | |
| **7 — Extra** | Statistiche, controlli di stile, continuità, AI opzionale, EPUB/DOCX, saga multi-opera completa | |

## 8. Rischi e mitigazioni

- **Conflitti di sincronizzazione** (stesso capitolo modificato da due posti) → commit basati sullo SHA atteso; in caso di conflitto, confronto e scelta esplicita.
- **Qualità del dizionario italiano** (forme verbali, elisioni come *dell'*, *un'*) → test dedicati sull'elisione; dizionario utente facile da gestire.
- **Riconoscimento personaggi ambiguo** (nomi comuni come "Rosa", "Bianca") → alias espliciti, maiuscola obbligatoria configurabile, conferma manuale.
- **Fedeltà PDF/opuscolo** tra stampanti diverse → anteprima del foglio impostato, pagina di prova, opzione lato lungo/corto.
- **Limiti API GitHub** → commit raggruppati, cache locale, letture tramite tree/blob invece di file singoli.

## 9. Domande aperte per te

1. **Modello Dara Marks**: quali sezioni vuoi precaricate? (Le uso come riferimento dal suo *Inside Story*, ma preferisco la tua versione di lavoro.)
2. **"Save the Cat rivisto da Write a Novel"**: intendi i 15 beat di *Save the Cat! Writes a Novel* di Jessica Brody, con i 10 generi di storia? Vuoi anche i generi?
3. **Un repo per progetto o uno per saga?** Propongo un repo per saga (o per racconto/romanzo autonomo) e un repo personale per gli appunti globali.
4. **Uso offline** è importante da subito o può arrivare dopo l'MVP?
5. **AI**: vuoi un mentore narrativo integrato nell'app, o preferisci tenerlo esterno (es. Claude Code sul repo), come nel flusso precedente?
6. **Stampa opuscolo**: che stampante/carta usi di solito (A4 piegato in A5)? Mi serve per la configurazione predefinita.
7. **Grammatica con LanguageTool**: va bene un servizio esterno o vuoi solo controlli locali?
8. **Multiutente**: in futuro co-autori o editor dovranno lavorare sullo stesso progetto?

## 10. Mock-up

Le schermate principali (dashboard, editor con ortografia, statistiche e scheda personaggio, struttura narrativa con scene, editor di strutture narrative con clonazione, worldbuilding, editor di scena, personaggi e relazioni, appunti e glossario, storico e confronto versioni, export PDF e opuscolo) sono nel mock-up interattivo: https://claude.ai/artifact/FN3XrU1GQx4nYiiiFjUQkU (privato finché non lo condividi). I sorgenti delle schermate sono in `docs/mockup/`.
