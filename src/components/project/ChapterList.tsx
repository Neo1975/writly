"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Arc } from "@/lib/project/format";
import { groupByArc, type ArcGroup } from "@/lib/project/serial";
import type { WorkSummary } from "@/lib/server/projects";

type Run = (json: Record<string, unknown>) => Promise<boolean>;

/**
 * Elenco dei capitoli di un'opera. Senza archi è una lista; con gli archi i capitoli
 * sono raggruppati per arco (gli archi conclusi si ripiegano) e ogni capitolo si sposta
 * da un arco all'altro. L'ordine dei capitoli resta quello dell'opera.
 */
export default function ChapterList({ owner, repo, work, busy, run }: { owner: string; repo: string; work: WorkSummary; busy: boolean; run: Run }) {
  const archi = work.archi ?? [];
  const groups = groupByArc(work.capitoli, archi);
  const [newArc, setNewArc] = useState("");

  async function addArc(e: FormEvent) {
    e.preventDefault();
    if (await run({ azione: "arco-nuovo", opera: work.slug, titolo: newArc })) setNewArc("");
  }

  if (archi.length === 0) {
    return (
      <>
        <ol className="list" style={{ paddingLeft: 0 }}>
          {groups[0]?.capitoli.map(({ entry, numero }) => (
            <ChapterRow key={entry.file} owner={owner} repo={repo} work={work} entry={entry} numero={numero} archi={archi} busy={busy} run={run} />
          ))}
        </ol>
        <details className="small">
          <summary>Raggruppa i capitoli in archi</summary>
          <p className="muted" style={{ margin: "6px 0" }}>
            Un arco è un gruppo di capitoli con un inizio e una fine (un volume, una stagione). Utile quando i capitoli sono tanti: gli archi conclusi si ripiegano.
          </p>
          <form className="row" onSubmit={addArc}>
            <label htmlFor={`arco-${work.slug}`} className="sr-only">
              Titolo del primo arco
            </label>
            <input id={`arco-${work.slug}`} className="input" style={{ flex: "1 1 220px", width: "auto" }} required maxLength={120} value={newArc} onChange={(e) => setNewArc(e.target.value)} placeholder="Titolo del primo arco" />
            <button type="submit" className="btn btn-small" disabled={busy || !newArc.trim()}>
              Crea l&apos;arco
            </button>
          </form>
        </details>
      </>
    );
  }

  // La chiave cambia quando un arco si conclude o si riapre: così si ripiega o si riapre da solo.
  return (
    <div className="stack">
      {groups.map((g) => (
        <ArcSection key={`${g.arco?.id ?? "senza-arco"}-${g.arco?.chiuso ? "chiuso" : "aperto"}`} owner={owner} repo={repo} work={work} group={g} archi={archi} busy={busy} run={run} />
      ))}
      <form className="row" onSubmit={addArc}>
        <label htmlFor={`arco-${work.slug}`} className="sr-only">
          Titolo del nuovo arco
        </label>
        <input id={`arco-${work.slug}`} className="input" style={{ flex: "1 1 220px", width: "auto" }} required maxLength={120} value={newArc} onChange={(e) => setNewArc(e.target.value)} placeholder="Titolo del nuovo arco" />
        <button type="submit" className="btn btn-small" disabled={busy || !newArc.trim()}>
          Nuovo arco
        </button>
      </form>
    </div>
  );
}

function ArcSection({ owner, repo, work, group, archi, busy, run }: { owner: string; repo: string; work: WorkSummary; group: ArcGroup; archi: Arc[]; busy: boolean; run: Run }) {
  const arc = group.arco;
  const [editing, setEditing] = useState(false);
  const [titolo, setTitolo] = useState(arc?.titolo ?? "");
  const [sintesi, setSintesi] = useState(arc?.sintesi ?? "");
  const [target, setTarget] = useState(archi[0]?.id ?? "");
  const count = group.capitoli.length;
  const label = `${count} ${count === 1 ? "capitolo" : "capitoli"}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (arc && (await run({ azione: "arco-modifica", opera: work.slug, arco: arc.id, titolo, sintesi }))) setEditing(false);
  }

  return (
    <details className="arc" open={!arc?.chiuso}>
      <summary className="arc-head">
        <span className="arc-title serif">{arc ? arc.titolo : "Senza arco"}</span>
        <span className="small muted">{label}</span>
        {arc?.chiuso && <span className="badge">Concluso</span>}
      </summary>
      {arc?.sintesi && !editing && <p className="small muted arc-sintesi">{arc.sintesi}</p>}
      {arc && (
        <div className="row arc-actions">
          {editing ? (
            <form className="stack" style={{ flex: 1 }} onSubmit={save}>
              <label className="small" htmlFor={`arc-t-${arc.id}`}>
                Titolo dell&apos;arco
              </label>
              <input id={`arc-t-${arc.id}`} className="input" required maxLength={120} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
              <label className="small" htmlFor={`arc-s-${arc.id}`}>
                Di cosa parla (facoltativo)
              </label>
              <textarea id={`arc-s-${arc.id}`} className="textarea" rows={2} maxLength={2000} value={sintesi} onChange={(e) => setSintesi(e.target.value)} />
              <div className="row">
                <button type="submit" className="btn btn-small btn-primary" disabled={busy || !titolo.trim()}>
                  Salva
                </button>
                <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
                Modifica l&apos;arco
              </button>
              <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run({ azione: "arco-modifica", opera: work.slug, arco: arc.id, chiuso: !arc.chiuso })}>
                {arc.chiuso ? "Riapri" : "Segna come concluso"}
              </button>
              <button
                type="button"
                className="btn btn-small btn-ghost danger-text"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Eliminare l'arco «${arc.titolo}»? I suoi capitoli restano, senza arco.`)) void run({ azione: "arco-elimina", opera: work.slug, arco: arc.id });
                }}
              >
                Elimina l&apos;arco
              </button>
            </>
          )}
        </div>
      )}
      {!arc && count > 0 && (
        <div className="row arc-actions">
          <label className="small" htmlFor={`bulk-${work.slug}`}>
            Metti tutti in
          </label>
          <select id={`bulk-${work.slug}`} className="select" style={{ width: "auto" }} value={target} onChange={(e) => setTarget(e.target.value)}>
            {archi.map((a) => (
              <option key={a.id} value={a.id}>
                {a.titolo}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-small" disabled={busy || !target} onClick={() => void run({ azione: "capitolo-arco", opera: work.slug, files: group.capitoli.map((c) => c.entry.file), arco: target })}>
            Sposta {count === 1 ? "il capitolo" : `i ${count} capitoli`}
          </button>
        </div>
      )}
      <ol className="list" style={{ paddingLeft: 0 }}>
        {group.capitoli.map(({ entry, numero }) => (
          <ChapterRow key={entry.file} owner={owner} repo={repo} work={work} entry={entry} numero={numero} archi={archi} busy={busy} run={run} />
        ))}
        {count === 0 && <li className="small muted">Nessun capitolo in questo arco: spostane uno da un altro arco, o scrivi un nuovo capitolo qui sotto.</li>}
      </ol>
    </details>
  );
}

function ChapterRow({
  owner,
  repo,
  work,
  entry,
  numero,
  archi,
  busy,
  run,
}: {
  owner: string;
  repo: string;
  work: WorkSummary;
  entry: WorkSummary["capitoli"][number];
  numero: number;
  archi: Arc[];
  busy: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.titolo);

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (await run({ azione: "rinomina-capitolo", opera: work.slug, file: entry.file, titolo: title })) setEditing(false);
  }

  return (
    <li>
      <span className="small muted" style={{ width: 28 }}>
        {numero}
      </span>
      {editing ? (
        <form className="row" style={{ flex: 1 }} onSubmit={rename}>
          <label htmlFor={`rn-${entry.file}`} className="sr-only">
            Nuovo titolo
          </label>
          <input id={`rn-${entry.file}`} className="input" style={{ flex: "1 1 220px", width: "auto" }} autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
            Salva
          </button>
          <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
            Annulla
          </button>
        </form>
      ) : (
        <>
          <Link href={`/progetto/${owner}/${repo}/${work.slug}/${entry.file.replace(/\.md$/, "")}`} style={{ flex: 1, fontWeight: 500 }}>
            {entry.titolo}
          </Link>
          {archi.length > 0 && (
            <>
              <label htmlFor={`arc-of-${entry.file}`} className="sr-only">
                Arco di «{entry.titolo}»
              </label>
              <select
                id={`arc-of-${entry.file}`}
                className="select select-small"
                style={{ width: "auto" }}
                value={archi.some((a) => a.id === entry.arco) ? entry.arco : ""}
                disabled={busy}
                onChange={(e) => void run({ azione: "capitolo-arco", opera: work.slug, file: entry.file, arco: e.target.value || null })}
              >
                <option value="">Senza arco</option>
                {archi.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.titolo}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setEditing(true);
              setTitle(entry.titolo);
            }}
          >
            Rinomina
          </button>
        </>
      )}
    </li>
  );
}
