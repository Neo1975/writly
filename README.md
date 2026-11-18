# Writly

Applicazione di supporto alla stesura di racconti, romanzi e saghe. Ogni progetto è un repository GitHub dell'autore: i capitoli sono file Markdown leggibili, ogni versione salvata è un commit.

- Analisi e pianificazione: [docs/analisi-e-pianificazione.md](docs/analisi-e-pianificazione.md)
- Mock-up delle schermate: [docs/mockup/](docs/mockup/)

## Cosa fa oggi (fasi 0–4)

- Accesso con GitHub; libreria dei progetti (repository con topic `writly-progetto`).
- Nuovo progetto (racconto, romanzo, saga): crea un repository privato e i file iniziali. Oppure collega un repository esistente.
- Opere e capitoli: nuovo capitolo, rinomina, nuovo libro per le saghe.
- Editor del capitolo: grassetto, corsivo, titoli, citazioni, cambio scena; stato del capitolo.
- Controllo ortografico italiano (Hunspell) con suggerimenti e dizionario di progetto (`dizionario.txt`).
- Statistiche sempre visibili: parole, battute con e senza spazi, anche sulla selezione.
- Bozza salvata in continuazione nel browser; «Salva versione» = commit con messaggio; protezione dai conflitti.
- Storico delle versioni con anteprima e ripristino nell'editor.
- **Strutture narrative**: Viaggio dell'eroe (12 tappe), Save the Cat! (15 beat), arco trasformativo di Dara Marks, Libero. Editor di strutture a livello di libreria: le predefinite si clonano, le personali si salvano nel repository privato `writly-libreria`; atti e sezioni con guida e peso, controllo del 100% con «Ribilancia», stima delle parole per sezione.
- **Scene**: per ogni opera una bacheca per sezioni con trascinamento, editor di scena (sinossi, obiettivo, conflitto, esito, POV, luogo, momento, personaggi, stato, capitolo), vista d'insieme con sezioni scoperte, parole e battute per capitolo e per opera.
- **Personaggi**: schede con alias, tratti fisici, morali e di comportamento, arco e biografia; relazioni orientate (anche per singolo libro della saga) e grafo.
- **Mondo**: voci per categoria (luoghi, culture e fazioni, sistemi, oggetti, storia, lingue, più quelle che aggiungi) con campi personalizzati, gerarchia («si trova in») e collegamenti a personaggi e altre voci.
- **Mondo avanzato**: mappe (immagine nel repository con segnaposti sulle voci, apribili dalla voce), storia del mondo con calendario inventato (ere, mesi) ed eventi, regole del mondo collegate alle voci.
- **Appunti**: di progetto e globali (repository `writly-libreria`), con tipo, tag, collegamenti a personaggi, mondo e scene, rimandi `[[Titolo]]`, ricerca, «da smistare»; si spostano tra libreria e progetti. **Glossario** di progetto, i cui termini entrano nel dizionario ortografico. **Cattura rapida** con «+ Idea» o Alt+Maiusc+N.
- **Nel capitolo**: nomi e alias di personaggi e voci del mondo riconosciuti ed evidenziati, scheda al passaggio del mouse, pannello laterale con scene del capitolo e citazioni; promemoria delle regole del mondo che riguardano i luoghi in scena; nomi e termini del glossario non risultano errori di ortografia.

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
opere/<opera>/opera.yaml             titolo dell'opera, ordine e titoli dei capitoli
opere/<opera>/capitoli/<file>.md     front-matter (id, stato) + testo Markdown
opere/<opera>/struttura.yaml         modello, atti e sezioni dell'opera + scene
personaggi/<slug>.md                 scheda (front-matter) + biografia
relazioni.yaml                       relazioni tra personaggi
mondo/categorie.yaml                 categorie del mondo e loro campi
mondo/<categoria>/<slug>.md          voce del mondo (front-matter) + descrizione
mondo/regole.yaml                    regole del mondo
mondo/cronologia.yaml                calendario ed eventi della storia del mondo
mondo/mappe/<slug>.yaml + .png/.jpg/.webp   mappa: segnaposti + immagine
appunti/<slug>.md                    appunto (front-matter) + testo Markdown
glossario.yaml                       termini del progetto
dizionario.txt                       parole accettate dal controllo ortografico

Repository personale writly-libreria:
strutture/<id>.yaml                  strutture narrative personali
appunti/<slug>.md                    appunti globali
```

Il dizionario italiano in `public/dictionaries/` è distribuito con licenza GPL-3.0 (vedi `LICENSE-it.txt`).
