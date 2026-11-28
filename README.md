# Writly

Applicazione di supporto alla stesura di racconti, romanzi e saghe. Ogni progetto è un repository GitHub dell'autore: i capitoli sono file Markdown leggibili, ogni versione salvata è un commit.

- Analisi e pianificazione: [docs/analisi-e-pianificazione.md](docs/analisi-e-pianificazione.md)
- Mock-up delle schermate: [docs/mockup/](docs/mockup/)

## Cosa fa oggi (fasi 0–7)

- Accesso con GitHub; libreria dei progetti (repository con topic `writly-progetto`).
- Nuovo progetto (racconto, romanzo, saga): crea un repository privato e i file iniziali. Oppure collega un repository esistente.
- Opere e capitoli: nuovo capitolo, rinomina, nuovo libro per le saghe; **tema e premessa** di ogni opera, sempre visibili nel pannello del capitolo.
- Editor del capitolo: grassetto, corsivo, titoli, citazioni, cambio scena; stato del capitolo.
- Controllo ortografico italiano (Hunspell) con suggerimenti e dizionario di progetto (`dizionario.txt`).
- Statistiche sempre visibili: parole, battute con e senza spazi, anche sulla selezione.
- Bozza salvata in continuazione nel browser; «Salva versione» = commit con messaggio; protezione dai conflitti.
- Storico delle versioni con parole aggiunte e tolte; confronto a parole tra due versioni (in linea o affiancato) o fino a quattro in colonne; evoluzione di un paragrafo; ripristino di una versione intera o di un solo paragrafo.
- Modifiche fatte fuori da Writly (altro dispositivo, editor esterno): nessuna sovrascrittura, unione guidata passaggio per passaggio.
- **Varianti** (rami Git): scrivi un finale alternativo senza toccare la versione principale, confrontalo, portane un capitolo o unisci tutto.
- **Export PDF** nel browser: capitolo, capitoli scelti o opera intera; template personalizzabili (formato, margini specchiati, carattere, interlinea, titoli, intestazioni, numeri di pagina, frontespizio, indice, separatore di scena, filigrana «BOZZA»); **opuscolo** per la stampa fronte/retro su A4 o A3, con segnature e compensazione del creep.
- **Strutture narrative**: Viaggio dell'eroe (12 tappe), Save the Cat! (15 beat), arco trasformativo di Dara Marks, Libero. Editor di strutture a livello di libreria: le predefinite si clonano, le personali si salvano nel repository privato `writly-libreria`; atti e sezioni con guida e misura a scelta: **percentuale** del libro (controllo del 100% con «Ribilancia», stima delle parole per sezione) oppure **battute esatte** per sezione (con spazi, per racconti e concorsi), con totale e «Distribuisci».
- **Scene**: per ogni opera una bacheca per sezioni con trascinamento, editor di scena (sinossi, obiettivo, conflitto, esito, POV, luogo, momento, personaggi, stato, capitolo, **registro** testa / cuore / pancia con equilibrio e ritmo nella vista d'insieme), vista d'insieme con sezioni scoperte, parole e battute per capitolo e per opera.
- **Personaggi**: schede con alias, tratti fisici, morali e di comportamento, arco, **polarizzazione** (centro dominante e trascurato fra testa, cuore e pancia, visibile nel grafo e nel pannello del capitolo) e biografia; relazioni orientate (anche per singolo libro della saga) e grafo.
- **Mondo**: voci per categoria (luoghi, culture e fazioni, sistemi, oggetti, storia, lingue, più quelle che aggiungi) con campi personalizzati, gerarchia («si trova in») e collegamenti a personaggi e altre voci.
- **Mondo avanzato**: mappe (immagine nel repository con segnaposti sulle voci, apribili dalla voce), storia del mondo con calendario inventato (ere, mesi) ed eventi, regole del mondo collegate alle voci.
- **Appunti**: di progetto e globali (repository `writly-libreria`), con tipo, tag, collegamenti a personaggi, mondo e scene, rimandi `[[Titolo]]`, ricerca, «da smistare»; si spostano tra libreria e progetti. **Glossario** di progetto, i cui termini entrano nel dizionario ortografico. **Cattura rapida** con «+ Idea» o Alt+Maiusc+N.
- **Nel capitolo**: nomi e alias di personaggi e voci del mondo riconosciuti ed evidenziati, scheda al passaggio del mouse, pannello laterale con scene del capitolo e citazioni; promemoria delle regole del mondo che riguardano i luoghi in scena; nomi e termini del glossario non risultano errori di ortografia.
- **Stile e continuità** (nel browser, disattivabili): ripetizioni ravvicinate, frasi molto lunghe, avverbi in *-mente*, parole più usate; avviso quando il testo contraddice la scheda di un personaggio (occhi, capelli, barba, pelle).
- **Obiettivi e concentrazione**: parole della sessione con obiettivo, modalità concentrazione (solo testo), diario delle parole scritte ogni giorno (in questo browser).
- **Panoramica**: parole per capitolo e per opera con l'obiettivo del libro, presenze di personaggi e luoghi capitolo per capitolo e, nelle saghe, libro per libro con la prima comparsa; avvisi di continuità e schede mai citate.
- **Commenti e mentore AI**: commenti sui passaggi del capitolo, ancorati alla frase citata (nessun segno nel testo), con risposte e «risolto». Ogni progetto contiene la skill di Claude Code `writly-mentore`: aprendo Claude Code sul repository si chiede una revisione di capitolo (commenti che compaiono nell'app), una revisione strutturale o una sessione di coaching (appunti di tipo «Revisione»). Il mentore non riscrive il testo.
- **EPUB e DOCX**: ebook per i lettori digitali e dattiloscritto Word (Times 12, interlinea 1,5) per editori e concorsi, composti nel browser.
- **Senza rete (iPad e computer)**: «Scarica per il viaggio» tiene sul dispositivo i capitoli della versione principale; con Writly aggiunta alla schermata Home si aprono e si scrivono anche senza rete (correzione ortografica compresa) e si salvano su GitHub quando torna. Le modifiche non ancora su GitHub hanno un indicatore e un elenco, e si salvano da sole quando torna la rete; se nel frattempo il capitolo è cambiato altrove non si sovrascrive niente e l'editor propone l'unione. Schede, mondo con mappe, appunti, struttura, panoramica e commenti si consultano offline in sola lettura.

## Avvio in locale

1. Crea una GitHub OAuth App (https://github.com/settings/developers) con callback `http://localhost:3000/api/auth/callback/github`.
2. `cp .env.local.example .env.local` e compila `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET` (`npx auth secret`).
3. `npm install` e `npm run dev`, poi apri http://localhost:3000.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm test` | Test unitari (Vitest), incluso il controllo ortografico con il vero dizionario |
| `npm run typecheck` | Controllo dei tipi |
| `npm run lint` | ESLint |
| `npm run build` | Build di produzione |

## Formato dei file nel repository del progetto

```
writly.yaml                          titolo, tipo, lingua, ordine delle opere
opere/<opera>/opera.yaml             titolo, tema e premessa dell'opera, ordine e titoli dei capitoli
opere/<opera>/capitoli/<file>.md     front-matter (id, stato) + testo Markdown
opere/<opera>/struttura.yaml         modello, atti e sezioni dell'opera + scene
opere/<opera>/commenti/<file>.yaml   commenti al capitolo (autore e mentore AI)
personaggi/<slug>.md                 scheda (front-matter) + biografia
relazioni.yaml                       relazioni tra personaggi
mondo/categorie.yaml                 categorie del mondo e loro campi
mondo/<categoria>/<slug>.md          voce del mondo (front-matter) + descrizione
mondo/regole.yaml                    regole del mondo
mondo/cronologia.yaml                calendario ed eventi della storia del mondo
mondo/mappe/<slug>.yaml + .png/.jpg/.webp   mappa: segnaposti + immagine
appunti/<slug>.md                    appunto (front-matter) + testo Markdown
glossario.yaml                       termini del progetto
template-pdf/<id>.yaml               template di impaginazione PDF
dizionario.txt                       parole accettate dal controllo ortografico
.claude/skills/writly-mentore/       skill del mentore AI per Claude Code (installata e aggiornata da Writly)

Repository personale writly-libreria:
strutture/<id>.yaml                  strutture narrative personali
appunti/<slug>.md                    appunti globali
```

Le varianti sono rami `variante/<nome>` dello stesso repository.

Il dizionario italiano in `public/dictionaries/` è distribuito con licenza GPL-3.0 (vedi `LICENSE-it.txt`). I font per il PDF in `public/fonts/` sono sotto SIL Open Font License (Literata, EB Garamond) e Apache 2.0 (Roboto).
