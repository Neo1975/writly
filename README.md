# Writly

Applicazione di supporto alla stesura di racconti, romanzi e saghe. Ogni progetto è un repository GitHub dell'autore: i capitoli sono file Markdown leggibili, ogni versione salvata è un commit.

- Analisi e pianificazione: [docs/analisi-e-pianificazione.md](docs/analisi-e-pianificazione.md)
- Mock-up delle schermate: [docs/mockup/](docs/mockup/)

## Cosa fa oggi (fasi 0 e 1)

- Accesso con GitHub; libreria dei progetti (repository con topic `writly-progetto`).
- Nuovo progetto (racconto, romanzo, saga): crea un repository privato e i file iniziali. Oppure collega un repository esistente.
- Opere e capitoli: nuovo capitolo, rinomina, nuovo libro per le saghe.
- Editor del capitolo: grassetto, corsivo, titoli, citazioni, cambio scena; stato del capitolo.
- Controllo ortografico italiano (Hunspell) con suggerimenti e dizionario di progetto (`dizionario.txt`).
- Statistiche sempre visibili: parole, battute con e senza spazi, anche sulla selezione.
- Bozza salvata in continuazione nel browser; «Salva versione» = commit con messaggio; protezione dai conflitti.
- Storico delle versioni con anteprima e ripristino nell'editor.

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
dizionario.txt                       parole accettate dal controllo ortografico
```

Il dizionario italiano in `public/dictionaries/` è distribuito con licenza GPL-3.0 (vedi `LICENSE-it.txt`).
