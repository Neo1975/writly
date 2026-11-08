# Writly

Web app di supporto alla scrittura narrativa (Next.js App Router, TypeScript). GitHub è l'unica fonte di verità: nessun database applicativo.

## Gerarchia dati

Saga (repo GitHub, scoperto via topic `writly-saga`) → Romanzo (`romanzi/<slug>/romanzo.json`) → Capitolo (`romanzi/<slug>/capitoli/<file>.md` + `.comments.json` gemello).

Personaggi (`personaggi/personaggi.json`) e Timeline degli eventi (`timeline/timeline.json`) vivono a livello **Saga**, non annidati sotto un Romanzo: sono condivisi/attraversano l'intera saga, non un singolo libro. Ogni evento della timeline può referenziare opzionalmente un romanzo/scena specifici (`romanzoSlug`/`sceneId` in `TimelineEvent`), ma non è obbligato a farlo.

Esiste inoltre un'**Agendina** personale dell'autore, fuori da questa gerarchia: vive in un repo GitHub dedicato e separato (topic `writly-personal`, creato on-demand da `POST /api/agendina/repo`, non taggato `writly-saga` per non confondersi con le saghe nella Sidebar). Le note sono file Markdown (`note/<slug>.md`) con un indice leggero (`note/index.json`) per categoria/tag. Nessuna selezione di branch per l'Agendina: è un repo personale non collaborativo, si opera sempre sul branch di default.

## Flusso di lavoro reale (importante per capire certe richieste di feature)

L'autore usa questa app per scrivere, e in parallelo tiene una sessione **separata** di Claude Code in locale, puntata sugli stessi repo GitHub, che agisce da mentore narrativo (skill `.claude/skills/editor-comment.md`, generata da `src/lib/skill-template.ts`). Quel Claude Code scrive commenti con `authorType: "ai-mentor"` direttamente via commit — non c'è connessione live tra l'app web e quella sessione, solo git asincrono. Diverse feature nascono da attrito in questo flusso a due Claude Code (es. id breve dei commenti per poterli citare in chat, commenti risolti nascosti dalla vista principale ma recuperabili in uno storico).

## Sintassi evidenziazione

`{{h:ID:colore}}testo{{/h}}` — `colore` opzionale per retrocompatibilità. `ID` è l'highlight id, condivisibile da più commenti (vedi `highlightId` in `ChapterComment`, `src/lib/types.ts`).

`src/lib/markdown.ts` supporta anche `[[Titolo Nota]]` (wikilink), usato solo dall'Agendina: `renderMarkdown` accetta un resolver opzionale titolo→slug, i capitoli della saga non lo passano e quindi non ne sono toccati.

## Relazioni personaggio

`Character.relationships` è un array di `{ personaggioId, relazione }` — riferimento per id al personaggio collegato, non per nome in chiaro (a differenza di `Scene.personaggi`, che resta testo libero separato da virgole: scelta non toccata in questa modifica). I dati legacy salvati come stringa libera vengono normalizzati in lettura (`getCharacters` in `src/lib/domain.ts`) in una singola voce con `personaggioId` vuoto, da assegnare manualmente dall'autore tramite il nuovo selettore in `CharacterBoard.tsx`.

## Convenzioni di lavoro

- Commit solo quando l'utente lo chiede esplicitamente ("fai commit").
- Prima di ogni commit: `npx tsc --noEmit`, `npm run lint`, `npm run build` — tutti devono risultare puliti.
- Staging esplicito escludendo gli env: `git add -A ":!.env" ":!.env.local"`, poi `git status --short` per verificare cosa è in stage.
- Messaggi di commit in italiano, descrittivi, focalizzati sul perché.
- Mai `git commit --amend` o force-push senza richiesta esplicita.

## Limiti noti / scelte di scope accettate

- **Branch switching** (selettore in sidebar, stato in `src/contexts/BranchContext.tsx` + localStorage per owner/repo): tutte le letture/scritture di contenuto (capitoli, commenti, scene, personaggi, impostazioni PDF) rispettano il branch selezionato. I **titoli** mostrati nelle pagine server-rendered (`RomanzoPage`, `RomanzoPdfPage`, `CapitoloPage`) restano letti dal branch di default: scelta deliberata per non dover propagare `?branch=` su ogni `<Link>`/`<a href>` dell'app. Da rivedere solo se i titoli disallineati tra branch diventano un problema reale.
- Il branch selezionato viene validato contro l'elenco reale dei branch del repo appena caricato (`Sidebar.tsx`): se non esiste più (es. cancellato su GitHub), si torna automaticamente al branch predefinito con un avviso.
- **Timeline degli eventi** è a livello Saga, non per singolo Romanzo: scelta deliberata per permettere eventi che attraversano più romanzi o che precedono la pubblicazione (backstory), e per restare coerente con i Personaggi (già saga-level) che ogni evento referenzia. Da rivedere se l'uso reale mostra che serve invece una timeline interna alla trama di un singolo romanzo, in parallelo all'architettura delle scene.
- **Grafo di connessione personaggi** (`CharacterGraph.tsx`) usa un layout SVG circolare custom, senza librerie di grafici (nessuna era installata). Scelta per restare senza dipendenze pesanti; adeguata a un numero di personaggi nell'ordine delle decine. Da rivalutare (es. `reactflow`) solo se il cerchio diventa affollato con molti personaggi.
- **Token GitHub nella sessione NextAuth** (`src/auth.ts`): `session.accessToken` è per design di NextAuth recuperabile anche dal browser tramite `GET /api/auth/session` (lo stesso oggetto che i callback `jwt`/`session` producono per `auth()` lato server è quello servito al client). Oggi nessun componente usa `useSession()` e non esiste una via XSS nota nell'app (pipeline markdown con `allowDangerousHtml: false`, nessun `dangerouslySetInnerHTML` su contenuto non neutralizzato) — quindi il token non è concretamente raggiungibile da un attaccante. Rimuoverlo dall'esposizione pubblica richiederebbe passare da `auth().session.accessToken` a una lettura diretta del JWT lato server (`getToken()`), toccando `src/lib/session-github.ts` e le guardie `session?.accessToken` in più pagine: rischio di regressione sull'intero flusso di login giudicato non commisurato al rischio attuale (solo teorico). Da rivedere se in futuro venisse introdotto `useSession()` lato client o un qualunque meccanismo che renderizzi contenuto HTML non attendibile senza passare da `renderMarkdown`.
- **Header di sicurezza HTTP** (`next.config.ts`, `headers()`): CSP con `script-src`/`style-src` che includono `'unsafe-inline'` (necessario: Next.js App Router inietta script inline per l'hydration/streaming, e diversi componenti usano lo style prop di React che produce attributi `style=""` inline). Un CSP più stretto richiederebbe un `middleware.ts` che generi un nonce per request — cambiamento più invasivo, non fatto in questa modifica. Gli altri header (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `object-src 'none'`, `frame-ancestors 'none'`) sono applicati senza compromessi.

## Decisioni in sospeso (da riprendere)

- **Id del commento opzionale nella sintassi di evidenziazione**: proposta `{{h:ID:colore:commentId}}` (terzo segmento opzionale) per rendere le evidenziazioni più autodescrittive per il flusso Claude Code locale. Richiede di generare l'id del commento lato client (oggi è generato dal server in `POST add-comment`, `capitoli/[file]/route.ts`) e aggiornare `lib/markdown.ts` + `skill-template.ts` (le skill già scaffoldate nei repo esistenti non si aggiornano da sole). Proposta presentata, non confermata.
