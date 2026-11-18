"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import ProjectNav from "./ProjectNav";
import VariantsCard from "./VariantsCard";
import type { ProjectData, WorkSummary } from "@/lib/server/projects";
import { WORK_INFO_MAX } from "@/lib/project/format";

const TYPE_LABEL = { racconto: "Racconto", romanzo: "Romanzo", saga: "Saga" } as const;

export default function ProjectView({ owner, repo }: { owner: string; repo: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [newWork, setNewWork] = useState("");
  const [busy, setBusy] = useState(false);
  const base = projectApi(owner, repo);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<ProjectData>(base));
    } catch (err) {
      setError(err as ClientApiError);
    }
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    api<ProjectData>(base)
      .then((d) => !cancelled && setData(d))
      .catch((err: ClientApiError) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function addWork(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(base, { method: "POST", json: { azione: "nuova-opera", titolo: newWork } });
      setNewWork("");
      await load();
    } catch (err) {
      setError(err as ClientApiError);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="page">
        <div className="notice notice-error" role="alert">
          {error.message} {error.status === 401 && <Link href="/api/auth/signin" prefetch={false}>Accedi di nuovo</Link>}
        </div>
        <Link href="/">← Torna alla libreria</Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <p className="muted">Carico il progetto da GitHub…</p>
      </main>
    );
  }

  const { manifest } = data;
  return (
    <main className="page">
      <ProjectNav
        owner={owner}
        repo={repo}
        title={manifest.titolo}
        current="opere"
        asHeading
        subtitle={`${TYPE_LABEL[manifest.tipo]} · ${owner}/${repo} · dizionario di progetto: ${data.dizionario.length} parole`}
      />
      <div className="row">
        <a className="btn btn-small" href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer">
          Apri su GitHub
        </a>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      )}

      {data.opere.map((w) => (
        <WorkCard key={w.slug} owner={owner} repo={repo} work={w} onChanged={load} onError={setError} />
      ))}

      <VariantsCard base={base} owner={owner} repo={repo} works={data.opere} />

      <MentorCard base={base} owner={owner} repo={repo} mentore={data.mentore} onInstalled={load} />

      {manifest.tipo === "saga" && (
        <form className="card row" onSubmit={addWork}>
          <label htmlFor="nuova-opera" className="small" style={{ fontWeight: 600 }}>
            Nuovo libro della saga
          </label>
          <input
            id="nuova-opera"
            className="input"
            style={{ flex: "1 1 260px", width: "auto" }}
            required
            maxLength={200}
            value={newWork}
            onChange={(e) => setNewWork(e.target.value)}
            placeholder="Titolo"
          />
          <button type="submit" className="btn" disabled={busy || !newWork.trim()}>
            Aggiungi libro
          </button>
        </form>
      )}
    </main>
  );
}

function WorkCard({
  owner,
  repo,
  work,
  onChanged,
  onError,
}: {
  owner: string;
  repo: string;
  work: WorkSummary;
  onChanged: () => Promise<void>;
  onError: (e: ClientApiError) => void;
}) {
  const base = projectApi(owner, repo);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(json: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(base, { method: "POST", json });
      await onChanged();
      return true;
    } catch (err) {
      onError(err as ClientApiError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addChapter(e: FormEvent) {
    e.preventDefault();
    if (await run({ azione: "nuovo-capitolo", opera: work.slug, titolo: title })) setTitle("");
  }

  async function rename(e: FormEvent, file: string) {
    e.preventDefault();
    if (await run({ azione: "rinomina-capitolo", opera: work.slug, file, titolo: editTitle })) setEditing(null);
  }

  return (
    <section className="card" aria-labelledby={`opera-${work.slug}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id={`opera-${work.slug}`} className="serif" style={{ margin: 0, fontSize: 22 }}>
          {work.titolo}
        </h2>
        <Link className="btn btn-small" href={`/progetto/${owner}/${repo}/struttura/${work.slug}`}>
          Struttura e scene
        </Link>
      </div>
      <WorkInfo work={work} busy={busy} onSave={(tema, premessa) => run({ azione: "info-opera", opera: work.slug, tema, premessa })} />
      <ol className="list" style={{ paddingLeft: 0 }}>
        {work.capitoli.map((c, i) => (
          <li key={c.file}>
            <span className="small muted" style={{ width: 28 }}>
              {i + 1}
            </span>
            {editing === c.file ? (
              <form className="row" style={{ flex: 1 }} onSubmit={(e) => rename(e, c.file)}>
                <label htmlFor={`rn-${c.file}`} className="sr-only">
                  Nuovo titolo
                </label>
                <input
                  id={`rn-${c.file}`}
                  className="input"
                  style={{ flex: "1 1 220px", width: "auto" }}
                  autoFocus
                  required
                  maxLength={200}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
                  Salva
                </button>
                <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>
                  Annulla
                </button>
              </form>
            ) : (
              <>
                <Link
                  href={`/progetto/${owner}/${repo}/${work.slug}/${c.file.replace(/\.md$/, "")}`}
                  style={{ flex: 1, fontWeight: 500 }}
                >
                  {c.titolo}
                </Link>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    setEditing(c.file);
                    setEditTitle(c.titolo);
                  }}
                >
                  Rinomina
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
      <form className="row" onSubmit={addChapter}>
        <label htmlFor={`nc-${work.slug}`} className="sr-only">
          Titolo del nuovo capitolo
        </label>
        <input
          id={`nc-${work.slug}`}
          className="input"
          style={{ flex: "1 1 260px", width: "auto" }}
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titolo del nuovo capitolo"
        />
        <button type="submit" className="btn" disabled={busy || !title.trim()}>
          Nuovo capitolo
        </button>
      </form>
    </section>
  );
}

/**
 * Il mentore AI è Claude Code aperto sul repository del progetto, con la skill
 * «writly-mentore»: rivede i capitoli lasciando commenti ancorati al testo,
 * fa revisioni strutturali e coaching. Qui si installa o aggiorna la skill.
 */
function MentorCard({ base, owner, repo, mentore, onInstalled }: { base: string; owner: string; repo: string; mentore: ProjectData["mentore"]; onInstalled: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const state = mentore.installata === 0 ? "assente" : mentore.installata < mentore.attuale ? "vecchio" : "aggiornato";

  async function install() {
    setBusy(true);
    setNotice(null);
    try {
      await api(base, { method: "POST", json: { azione: "installa-mentore" } });
      await onInstalled();
      setNotice({ kind: "ok", text: "Mentore AI installato nel repository. Se lo hai già clonato, fai «git pull» prima di aprire Claude Code." });
    } catch (err) {
      setNotice({ kind: "error", text: (err as ClientApiError).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="mentore-title">
      <div>
        <h2 id="mentore-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
          Mentore AI
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Claude Code, aperto sul repository del progetto, fa da editor e mentore: rivede un capitolo lasciando commenti sui passaggi (li trovi nel pannello «Commenti» del capitolo),
          fa una revisione strutturale dell&apos;opera o una sessione di coaching quando sei bloccato. Non riscrive il tuo testo.
        </p>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}
      <div className="row">
        <span className="small">
          {state === "assente" ? "Non ancora installato in questo progetto." : state === "vecchio" ? `Installata la versione ${mentore.installata}: c'è la versione ${mentore.attuale}.` : `Installato (versione ${mentore.installata}).`}
        </span>
        {state !== "aggiornato" && (
          <button type="button" className="btn btn-small btn-primary" onClick={install} disabled={busy}>
            {busy ? "Installo…" : state === "assente" ? "Installa il mentore AI" : "Aggiorna il mentore AI"}
          </button>
        )}
      </div>
      <details>
        <summary className="small">Come si usa</summary>
        <ol className="small" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>
            Clona il repository: <code>git clone https://github.com/{owner}/{repo}.git</code> (o <code>git pull</code> se lo hai già).
          </li>
          <li>Apri Claude Code nella cartella del progetto.</li>
          <li>
            Chiedi, per esempio: «rivedi il capitolo 3», «fai una revisione strutturale del libro», «sono bloccato sulla scena del faro, facciamo coaching».
          </li>
          <li>Claude salva commenti e appunti con un commit: ricarica il capitolo in Writly per vederli.</li>
        </ol>
      </details>
    </section>
  );
}

/** Tema e premessa dell'opera: in vista, oppure in modifica. */
function WorkInfo({ work, busy, onSave }: { work: WorkSummary; busy: boolean; onSave: (tema: string, premessa: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [tema, setTema] = useState("");
  const [premessa, setPremessa] = useState("");
  const id = `info-${work.slug}`;

  if (editing) {
    return (
      <form
        className="stack work-info"
        style={{ gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(tema, premessa)) setEditing(false);
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-tema`}>Tema</label>
          <textarea id={`${id}-tema`} className="textarea" rows={2} maxLength={WORK_INFO_MAX} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Di cosa parla davvero la storia, sotto la trama. Es. «il prezzo della verità», «si può perdonare chi ci ha tradito?»" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-premessa`}>Premessa</label>
          <textarea id={`${id}-premessa`} className="textarea" rows={3} maxLength={WORK_INFO_MAX} value={premessa} onChange={(e) => setPremessa(e.target.value)} placeholder="L'idea da cui parte la storia: chi, cosa vuole, cosa glielo impedisce, cosa rischia. Es. «Una guardiana del faro scopre che il naufragio non fu un incidente: se parla, perde la casa»" />
        </div>
        <div className="row">
          <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
            Salva
          </button>
          <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
            Annulla
          </button>
        </div>
      </form>
    );
  }

  const start = () => {
    setTema(work.tema ?? "");
    setPremessa(work.premessa ?? "");
    setEditing(true);
  };
  if (!work.tema && !work.premessa) {
    return (
      <div className="row small">
        <span className="muted">Tema e premessa non ancora scritti.</span>
        <button type="button" className="btn btn-small btn-ghost" onClick={start}>
          Aggiungi tema e premessa
        </button>
      </div>
    );
  }
  return (
    <div className="work-info">
      <dl className="work-info-list">
        <div>
          <dt>Tema</dt>
          <dd>{work.tema || <span className="muted">—</span>}</dd>
        </div>
        <div>
          <dt>Premessa</dt>
          <dd>{work.premessa || <span className="muted">—</span>}</dd>
        </div>
      </dl>
      <button type="button" className="btn btn-small btn-ghost" onClick={start}>
        Modifica tema e premessa
      </button>
    </div>
  );
}
