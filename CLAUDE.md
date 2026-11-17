# Writly (branch `preview`, ripartenza da zero)

Web app per scrivere racconti, romanzi e saghe. Next.js 16 (App Router) + TypeScript. GitHub è l'unica fonte di verità: nessun database applicativo. Piano e requisiti in `docs/analisi-e-pianificazione.md`, mock-up in `docs/mockup/`.

@AGENTS.md

## Mappa del codice

- `src/lib/project/` — formato dei file nel repo del progetto (`format.ts`), percorsi consentiti (`paths.ts`), slug. Logica pura, testata.
- `src/lib/server/` — solo lato server: token GitHub dal JWT (`auth-token.ts`), client Octokit e commit multi-file (`github.ts`), operazioni sui progetti (`projects.ts`), helper delle route (`http.ts`).
- `src/app/api/progetti/**` — tre route: elenco/crea/collega; progetto (azioni via campo `azione`); file (lettura, salvataggio con sha, storico).
- `src/components/editor/` — editor TipTap del capitolo, estensione ortografia, storico.
- `src/lib/client/` — fetch verso le API, bozze locali (IndexedDB + copia sincrona in localStorage alla chiusura).

## Regole da rispettare

- Il token GitHub non deve mai arrivare al browser: non aggiungerlo a `session` in `src/auth.ts`; lato server usare `getAccessToken()`.
- Le API accettano solo i percorsi validati da `src/lib/project/paths.ts`: niente scritture arbitrarie nel repository dell'autore.
- Salvare un capitolo richiede lo `sha` letto: in caso di conflitto (409) non si sovrascrive mai, si avvisa l'autore.
- Interfaccia e messaggi d'errore in italiano, rivolti all'autore (non tecnici).
- `GITHUB_API_URL` (opzionale) punta l'app a un altro endpoint GitHub: GitHub Enterprise o un server finto per i test end-to-end.

## Prima di ogni commit

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: tutti puliti. Messaggi di commit in italiano, focalizzati sul perché.
