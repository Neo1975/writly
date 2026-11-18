# Writly (branch `preview`, ripartenza da zero)

Web app per scrivere racconti, romanzi e saghe. Next.js 16 (App Router) + TypeScript. GitHub è l'unica fonte di verità: nessun database applicativo. Piano e requisiti in `docs/analisi-e-pianificazione.md`, mock-up in `docs/mockup/`.

@AGENTS.md

## Mappa del codice

- `src/lib/project/` — formato dei file nel repo del progetto: manifest e capitoli (`format.ts`), strutture e scene (`structure.ts`, predefinite in `templates.ts`), personaggi/relazioni/voci del mondo (`entities.ts`), regole/cronologia/mappe (`world.ts`), appunti e glossario (`notes.ts`), validazione dei campi (`normalize.ts`), percorsi consentiti (`paths.ts`), slug. Logica pura, testata.
- `src/lib/text/` — statistiche (parole, battute), tokenizzazione per l'ortografia, riconoscimento dei nomi (`mentions.ts`), confronto a parole e per paragrafi (`diff.ts`).
- `src/lib/export/` — export PDF: Markdown → blocchi (`markdown.ts`), template (`template.ts`), definizioni pdfmake pure (`pdf.ts`), imposizione a opuscolo (`imposition.ts`), impaginazione nel browser con pdfmake + pdf-lib (`render.ts`, solo client, import dinamico).
- `src/lib/server/` — solo lato server: token GitHub dal JWT (`auth-token.ts`), client Octokit, commit multi-file, albero e blob (`github.ts`), progetti (`projects.ts`), strutture e statistiche dell'opera (`structures.ts`), schede di progetto, compresi appunti e glossario (`sheets.ts`), appunti globali e spostamenti (`notes.ts`), varianti/rami (`variants.ts`), helper delle route (`http.ts`).
- `src/app/api/progetti/**` — elenco/crea/collega; progetto (azioni via campo `azione`); file (lettura, salvataggio con sha, storico); `schede` (personaggi, relazioni, mondo, mappe con immagine, appunti, glossario); `immagine` (immagini delle mappe, solo PNG/JPEG/WebP sotto `mondo/mappe/`); `opere/[opera]/struttura` e `/statistiche`; `varianti`. Il file route accetta `ramo=variante/<nome>`. `src/app/api/strutture` e `src/app/api/appunti` — strutture personali e appunti globali nel repo `writly-libreria`.
- `src/components/editor/` — editor TipTap del capitolo, estensioni ortografia e nomi (`mentions.ts`), pannello laterale, storico con confronto (`HistoryDialog.tsx`, `DiffView.tsx`), unione (`MergeDialog.tsx`).
- `src/components/structures/` — editor delle strutture (libreria), bacheca delle scene, editor di scena. `src/components/sheets/` — personaggi (con grafo) e mondo (voci, mappe, storia, regole). `src/components/notes/` — appunti, glossario, cattura rapida. `src/components/export/` — pagina Esporta e editor dei template PDF.
- `src/lib/client/` — fetch verso le API, hook (`hooks.ts`), bozze e copie locali (IndexedDB + copia sincrona in localStorage alla chiusura).

## Regole da rispettare

- Il token GitHub non deve mai arrivare al browser: non aggiungerlo a `session` in `src/auth.ts`; lato server usare `getAccessToken()`.
- Le API accettano solo i percorsi validati da `src/lib/project/paths.ts`: niente scritture arbitrarie nel repository dell'autore.
- Gli slug `personaggi`, `mondo`, `struttura`, `appunti`, `esporta`, `varianti` sono riservati (segmenti delle pagine del progetto): non usarli per le opere. `mappe` non può essere una categoria del mondo.
- Le immagini caricate si accettano solo se i primi byte sono PNG, JPEG o WebP: mai SVG o tipi dichiarati dal client.
- I riferimenti tra file (scene → personaggi/luoghi, relazioni, collegamenti) usano gli `id` stabili, mai i nomi dei file; un id che non esiste più si mostra come «eliminato», non fa fallire il caricamento.
- Le varianti sono solo rami `variante/<nome>` (`isVariantRef`): mai scrivere su altri rami. Le bozze locali sono separate per variante.
- Salvare un capitolo richiede lo `sha` letto: in caso di conflitto (409) non si sovrascrive mai, si avvisa l'autore.
- Interfaccia e messaggi d'errore in italiano, rivolti all'autore (non tecnici).
- `GITHUB_API_URL` (opzionale) punta l'app a un altro endpoint GitHub: GitHub Enterprise o un server finto per i test end-to-end.

## Prima di ogni commit

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: tutti puliti. Messaggi di commit in italiano, focalizzati sul perché.
