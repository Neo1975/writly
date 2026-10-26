# Writly

Web app di supporto alla scrittura narrativa. Organizza il lavoro in **Sage**
(progetti) → **Romanzi** → **Capitoli**, con testo in markdown esteso
(evidenziazioni ancorate a commenti), un'**architettura delle scene** e delle
**schede personaggio** (condivise a livello di saga) a schede. Ogni saga è un
repository GitHub a parte: GitHub è l'unica fonte di verità, non c'è un
database applicativo.

Il repository di ogni saga viene scaffoldato con una skill Claude Code
(`.claude/skills/editor-comment.md`) che permette di clonarlo in locale e
usare Claude Code come mentore/editor: legge i capitoli, aggiunge
evidenziazioni e commenti nei file `*.comments.json` marcandoli con
`"authorType": "ai-mentor"`, distinguendoli così da quelli inseriti dall'app
(`"authorType": "user"`).

## Setup

1. Crea una **GitHub OAuth App**: https://github.com/settings/developers →
   "New OAuth App".
   - Homepage URL: `http://localhost:3000` (in produzione l'URL di Vercel)
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
     (in produzione `https://<tuo-dominio>/api/auth/callback/github`)
2. Copia `.env.local.example` in `.env.local` e compila:
   - `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — dalla OAuth App creata sopra
   - `AUTH_SECRET` — genera con `npx auth secret`
3. Installa le dipendenze e avvia il server di sviluppo:

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) e accedi con GitHub. Al
primo accesso l'app richiede lo scope `repo` per poter creare e scrivere nei
repository delle tue sage.

## Struttura di una saga (repo GitHub)

```
saga.json
personaggi/personaggi.json
romanzi/<slug-romanzo>/romanzo.json
romanzi/<slug-romanzo>/capitoli/<NN>-<slug>.md
romanzi/<slug-romanzo>/capitoli/<NN>-<slug>.comments.json
romanzi/<slug-romanzo>/scene/scene.json
.claude/skills/editor-comment.md
```

La sintassi di evidenziazione nei file `.md` è:

```
{{h:ID}}testo evidenziato{{/h}}
```

## Editor e correzione ortografica

L'editor dei capitoli usa CodeMirror 6 (markdown, a capo automatico) invece
di una semplice textarea, per poter aggiungere in futuro altre funzionalità
basate sul contenuto. È integrato un correttore ortografico italiano:
dizionario Hunspell (`public/dictionaries/it.{aff,dic}`, da
[wooorm/dictionaries](https://github.com/wooorm/dictionaries), licenza GPL-3.0
— attribuzione in `public/dictionaries/LICENSE-it.txt`) caricato lato client
tramite [`hunspell-asm`](https://github.com/kwonoj/hunspell-asm), un motore
Hunspell reale compilato in WebAssembly.

Nota: le librerie JS "pure" (`nspell`, `typo-js`) pre-espandono l'intero
dizionario in un'unica struttura JS e superano un limite interno del motore
V8 con un dizionario morfologicamente ricco come l'italiano — per questo è
stato scelto `hunspell-asm`, che esegue il controllo in memoria WASM senza
quel limite.

## Deploy su Vercel

Importa il repository su Vercel e imposta le stesse variabili d'ambiente
(`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`), aggiornando la
callback URL della OAuth App con il dominio di produzione.
