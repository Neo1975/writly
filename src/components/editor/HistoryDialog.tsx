"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/client/api";
import { parseChapter } from "@/lib/project/format";
import type { CommitSummary } from "@/lib/server/github";
import { diffStats, diffWords, joinParagraphs, paragraphHistory, restoreParagraph, splitParagraphs } from "@/lib/text/diff";
import { formatCount, textStats } from "@/lib/text/stats";
import DiffView, { InlineDiff } from "./DiffView";

const CURRENT = "attuale";
/** Versioni di cui calcoliamo subito parole aggiunte e tolte. */
const PRELOAD = 12;
const MAX_COMPARE = 4;

function formatDate(iso: string | null) {
  if (!iso) return "data sconosciuta";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Storico del capitolo: versioni salvate con parole aggiunte e tolte, confronto
 * a parole tra due versioni (in linea o affiancato) o fra più versioni in
 * colonne, evoluzione di un paragrafo, ripristino di una versione o di un paragrafo.
 */
export default function HistoryDialog({
  open,
  onClose,
  base,
  path,
  ramo,
  currentBody,
  onRestore,
  onReplaceBody,
}: {
  open: boolean;
  onClose: () => void;
  base: string;
  path: string;
  /** Variante (ramo) di cui mostrare lo storico; null = versione principale. */
  ramo: string | null;
  /** Testo nell'editor quando si apre lo storico. */
  currentBody: string;
  onRestore: (body: string, when: string) => void;
  /** Sostituisce il testo dell'editor (ripristino di un paragrafo). */
  onReplaceBody: (body: string, label: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Storico delle versioni" wide>
      {open && <HistoryBody base={base} path={path} ramo={ramo} currentBody={currentBody} onClose={onClose} onRestore={onRestore} onReplaceBody={onReplaceBody} />}
    </Modal>
  );
}

type View = { kind: "elenco" } | { kind: "confronto"; layout: "inline" | "affiancato" } | { kind: "evoluzione"; index: number };

function HistoryBody({
  base,
  path,
  ramo,
  currentBody,
  onClose,
  onRestore,
  onReplaceBody,
}: {
  base: string;
  path: string;
  ramo: string | null;
  currentBody: string;
  onClose: () => void;
  onRestore: (body: string, when: string) => void;
  onReplaceBody: (body: string, label: string) => void;
}) {
  const [commits, setCommits] = useState<CommitSummary[] | null>(null);
  const [bodies, setBodies] = useState<Map<string, string>>(() => new Map([[CURRENT, currentBody]]));
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<View>({ kind: "elenco" });
  const [current, setCurrent] = useState(currentBody);
  const [error, setError] = useState("");
  const query = `${base}/file?path=${encodeURIComponent(path)}${ramo ? `&ramo=${encodeURIComponent(ramo)}` : ""}`;

  async function fetchBody(sha: string): Promise<string> {
    const r = await api<{ text: string }>(`${base}/file?path=${encodeURIComponent(path)}&ref=${sha}`);
    return parseChapter(r.text).body;
  }

  useEffect(() => {
    let cancelled = false;
    api<{ commits: CommitSummary[] }>(`${query}&storia=1`)
      .then(async (r) => {
        if (cancelled) return;
        setCommits(r.commits);
        // Testo delle versioni più recenti, per le parole aggiunte e tolte.
        const first = r.commits.slice(0, PRELOAD);
        const texts = await Promise.all(first.map((c) => fetchBody(c.sha).catch(() => null)));
        if (cancelled) return;
        setBodies((prev) => {
          const next = new Map(prev);
          first.forEach((c, i) => texts[i] !== null && next.set(c.sha, texts[i]!));
          return next;
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // fetchBody dipende solo da base e path, già in `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Le versioni selezionate che non abbiamo ancora letto.
  useEffect(() => {
    const missing = selected.filter((k) => !bodies.has(k));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map((sha) => fetchBody(sha).then((t) => [sha, t] as const)))
      .then((pairs) => !cancelled && setBodies((prev) => new Map([...prev, ...pairs])))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, bodies]);

  const stats = useMemo(() => {
    const out = new Map<string, { aggiunte: number; rimosse: number } | "prima">();
    if (!commits) return out;
    commits.forEach((c, i) => {
      const body = bodies.get(c.sha);
      if (body === undefined) return;
      const older = commits[i + 1];
      if (!older) out.set(c.sha, "prima");
      else if (bodies.has(older.sha)) out.set(c.sha, diffStats(diffWords(bodies.get(older.sha)!, body)));
    });
    return out;
  }, [commits, bodies]);

  // Ordine cronologico: le versioni salvate dalla più vecchia, il testo attuale per ultimo.
  const chrono = useMemo(() => {
    const order = [...(commits ?? [])].reverse().map((c) => c.sha);
    return [...order, CURRENT];
  }, [commits]);
  const labelOf = (key: string) => {
    if (key === CURRENT) return "Testo attuale (nell'editor)";
    const c = commits?.find((x) => x.sha === key);
    return c ? `${formatDate(c.date)} — ${c.message.split("\n")[0]}` : key.slice(0, 7);
  };
  const sortedSel = [...selected].sort((a, b) => chrono.indexOf(a) - chrono.indexOf(b));
  const ready = sortedSel.every((k) => bodies.has(k));

  function toggle(key: string) {
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= MAX_COMPARE ? cur : [...cur, key]));
  }

  function restoreOne(olderKey: string, olderIndex: number) {
    const older = splitParagraphs(bodies.get(olderKey)!);
    const next = joinParagraphs(restoreParagraph(splitParagraphs(current), older, olderIndex));
    setCurrent(next);
    setBodies((prev) => new Map(prev).set(CURRENT, next));
    onReplaceBody(next, `Un paragrafo della versione del ${labelOf(olderKey).split(" — ")[0]}`);
  }

  if (error) {
    return (
      <div className="stack">
        <div className="notice notice-error" role="alert">
          {error}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  const single = sortedSel.length === 1 && sortedSel[0] !== CURRENT ? sortedSel[0] : null;

  return (
    <div className="stack">
      {ramo && <p className="small muted" style={{ margin: 0 }}>Storico della variante «{ramo.replace("variante/", "")}».</p>}
      {view.kind !== "elenco" && (
        <div className="row">
          <button type="button" className="btn btn-small" onClick={() => setView({ kind: "elenco" })}>
            ← Elenco delle versioni
          </button>
          {view.kind === "confronto" && sortedSel.length === 2 && (
            <div className="segmented" role="radiogroup" aria-label="Disposizione del confronto">
              {(["inline", "affiancato"] as const).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={view.layout === l} onClick={() => setView({ kind: "confronto", layout: l })}>
                  {l === "inline" ? "In linea" : "Affiancato"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view.kind === "elenco" && (
        <div className="history">
          <ul className="history-list" aria-label="Versioni">
            <li>
              <label className={`history-item${selected.includes(CURRENT) ? " is-selected" : ""}`}>
                <input type="checkbox" checked={selected.includes(CURRENT)} onChange={() => toggle(CURRENT)} />
                <span className="history-msg">Testo attuale</span>
                <span className="small muted">nell&apos;editor, anche non salvato</span>
              </label>
            </li>
            {!commits && <li className="muted small">Carico lo storico…</li>}
            {commits?.length === 0 && <li className="muted small">Nessuna versione salvata.</li>}
            {commits?.map((c) => {
              const st = stats.get(c.sha);
              return (
                <li key={c.sha}>
                  <label className={`history-item${selected.includes(c.sha) ? " is-selected" : ""}`}>
                    <input type="checkbox" checked={selected.includes(c.sha)} onChange={() => toggle(c.sha)} />
                    <span className="history-msg">{c.message.split("\n")[0]}</span>
                    <span className="small muted">
                      {formatDate(c.date)}
                      {c.author ? ` · ${c.author}` : ""}
                      {st === "prima" ? " · prima versione" : st ? "" : ""}
                    </span>
                    {st && st !== "prima" && (
                      <span className="small history-delta">
                        <span className="delta-plus">+{formatCount(st.aggiunte)}</span> <span className="delta-minus">−{formatCount(st.rimosse)}</span> parole
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="history-preview" aria-live="polite">
            {single ? (
              bodies.has(single) ? (
                <>
                  <p className="small muted" style={{ marginTop: 0 }}>
                    {formatCount(textStats(bodies.get(single)!).parole)} parole · {formatCount(textStats(bodies.get(single)!).battute)} battute
                  </p>
                  <div className="history-text serif">{bodies.get(single) || "(capitolo vuoto)"}</div>
                </>
              ) : (
                <p className="muted">Carico la versione…</p>
              )
            ) : (
              <p className="muted">
                Seleziona una versione per vederne il testo; due o più (fino a {MAX_COMPARE}) per confrontarle. Il testo attuale si può confrontare con qualsiasi versione e ripristinare un paragrafo alla volta.
              </p>
            )}
          </div>
        </div>
      )}

      {view.kind === "confronto" && ready && sortedSel.length === 2 && (
        <>
          <div className="diff-legend small">
            <span>
              Da: <strong>{labelOf(sortedSel[0])}</strong>
            </span>
            <span>
              A: <strong>{labelOf(sortedSel[1])}</strong>
            </span>
          </div>
          <div className="diff-scroll">
            <DiffView
              older={splitParagraphs(bodies.get(sortedSel[0])!)}
              newer={splitParagraphs(sortedSel[1] === CURRENT ? current : bodies.get(sortedSel[1])!)}
              layout={view.layout}
              onRestore={sortedSel[1] === CURRENT ? (i) => restoreOne(sortedSel[0], i) : undefined}
            />
          </div>
        </>
      )}

      {view.kind === "confronto" && ready && sortedSel.length > 2 && <Columns keys={sortedSel} bodies={bodies} current={current} labelOf={labelOf} />}

      {view.kind === "evoluzione" && <Evolution chrono={chrono.filter((k) => bodies.has(k))} bodies={bodies} current={current} labelOf={labelOf} index={view.index} onIndex={(index) => setView({ kind: "evoluzione", index })} />}

      {view.kind !== "elenco" && !ready && <p className="muted">Carico le versioni…</p>}

      <div className="modal-actions">
        {view.kind === "elenco" && (
          <button type="button" className="btn" style={{ marginRight: "auto" }} onClick={() => setView({ kind: "evoluzione", index: 0 })} disabled={!commits?.length}>
            Evoluzione di un paragrafo
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Chiudi
        </button>
        {view.kind === "elenco" && (
          <>
            <button type="button" className="btn" disabled={sortedSel.length < 2} onClick={() => setView({ kind: "confronto", layout: "inline" })}>
              Confronta{sortedSel.length >= 2 ? ` (${sortedSel.length})` : ""}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!single || !bodies.has(single)}
              onClick={() => single && onRestore(bodies.get(single)!, formatDate(commits?.find((c) => c.sha === single)?.date ?? null))}
            >
              Ripristina questa versione
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Più versioni in colonne: ognuna mostra le differenze rispetto alla precedente; lo scorrimento è sincronizzato. */
function Columns({ keys, bodies, current, labelOf }: { keys: string[]; bodies: Map<string, string>; current: string; labelOf: (k: string) => string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const syncing = useRef(false);
  const texts = keys.map((k) => (k === CURRENT ? current : bodies.get(k)!));

  function onScroll(i: number) {
    if (syncing.current) return;
    const src = refs.current[i];
    if (!src) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    syncing.current = true;
    refs.current.forEach((el, j) => {
      if (el && j !== i) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
    });
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  return (
    <div className="diff-columns" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(220px, 1fr))` }}>
      {keys.map((k, i) => {
        const st = i > 0 ? diffStats(diffWords(texts[i - 1], texts[i])) : null;
        return (
          <section key={k} className="diff-column" aria-label={labelOf(k)}>
            <header className="small">
              <strong>{labelOf(k)}</strong>
              {st && (
                <span className="history-delta">
                  {" "}
                  <span className="delta-plus">+{st.aggiunte}</span> <span className="delta-minus">−{st.rimosse}</span>
                </span>
              )}
            </header>
            <div className="diff-column-text serif" ref={(el) => void (refs.current[i] = el)} onScroll={() => onScroll(i)} tabIndex={0}>
              {i === 0 ? texts[0] || "(vuoto)" : <InlineDiff ops={diffWords(texts[i - 1], texts[i])} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Come è cambiato un paragrafo del testo attuale attraverso le versioni caricate. */
function Evolution({
  chrono,
  bodies,
  current,
  labelOf,
  index,
  onIndex,
}: {
  chrono: string[];
  bodies: Map<string, string>;
  current: string;
  labelOf: (k: string) => string;
  index: number;
  onIndex: (i: number) => void;
}) {
  const versions = chrono.map((k) => splitParagraphs(k === CURRENT ? current : bodies.get(k)!));
  const latest = versions[versions.length - 1] ?? [];
  const history = latest.length ? paragraphHistory(versions, Math.min(index, latest.length - 1)) : [];
  // Solo le versioni in cui il paragrafo cambia rispetto alla precedente che lo conteneva.
  const steps: { key: string; text: string; before: string | null }[] = [];
  for (const [v, text] of history.entries()) {
    const before = steps.length ? steps[steps.length - 1].text : null;
    if (text !== null && text !== before) steps.push({ key: chrono[v], text, before });
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="evo-par">Paragrafo del testo attuale</label>
        <select id="evo-par" className="select" value={Math.min(index, Math.max(0, latest.length - 1))} onChange={(e) => onIndex(Number(e.target.value))}>
          {latest.map((p, i) => (
            <option key={i} value={i}>
              {i + 1}. {p.length > 90 ? `${p.slice(0, 90)}…` : p}
            </option>
          ))}
        </select>
        <span className="hint">Mostra solo le versioni in cui il paragrafo è cambiato (tra le ultime {PRELOAD} salvate).</span>
      </div>
      <ol className="evolution">
        {steps.map((s) => (
          <li key={s.key}>
            <div className="small muted">{labelOf(s.key)}</div>
            <div className="serif">{s.before === null ? s.text : <InlineDiff ops={diffWords(s.before, s.text)} />}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
