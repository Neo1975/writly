"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import ProjectNav from "@/components/project/ProjectNav";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { useApiData, useBeforeUnload } from "@/lib/client/hooks";
import {
  NOTE_TYPES,
  NOTE_TYPE_LABEL,
  backlinks,
  emptyNote,
  findByTitle,
  searchNotes,
  wikiLinks,
  type Note,
  type NoteType,
} from "@/lib/project/notes";
import type { WorkStructure } from "@/lib/project/structure";
import type { RepoSummary } from "@/lib/server/github";
import type { LibraryNotes } from "@/lib/server/notes";
import type { ProjectData } from "@/lib/server/projects";
import type { Sheet, SheetsData } from "@/lib/server/sheets";
import GlossaryPanel from "./GlossaryPanel";

export type NotesScope = { kind: "progetto"; owner: string; repo: string } | { kind: "libreria" };

interface LinkOption {
  id: string;
  label: string;
  group: string;
}

/**
 * Appunti di un progetto oppure globali (repository writly-libreria): ricerca,
 * filtri, «da smistare», collegamenti [[Titolo]] e spostamento tra libreria e progetti.
 */
export default function NotesView({ scope, initialTab = "appunti" }: { scope: NotesScope; initialTab?: "appunti" | "glossario" }) {
  const isProject = scope.kind === "progetto";
  const base = isProject ? projectApi(scope.owner, scope.repo) : null;
  const project = useApiData<ProjectData>(base);
  const sheets = useApiData<SheetsData>(base ? `${base}/schede` : null);
  const library = useApiData<LibraryNotes>(isProject ? null : "/api/appunti");
  const projects = useApiData<{ progetti: RepoSummary[] }>(isProject ? null : "/api/progetti");

  const [tab, setTab] = useState<"appunti" | "glossario">(initialTab);
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<NoteType | "">("");
  const [tag, setTag] = useState("");
  const [onlyInbox, setOnlyInbox] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string; href?: string } | null>(null);
  const [scenes, setScenes] = useState<LinkOption[]>([]);
  useBeforeUnload(dirty);

  // Scene di tutte le opere del progetto, per i collegamenti.
  useEffect(() => {
    if (!base || !project.data) return;
    let cancelled = false;
    const works = project.data.opere;
    Promise.all(works.map((w) => api<{ struttura: WorkStructure | null }>(`${base}/opere/${w.slug}/struttura`).catch(() => ({ struttura: null }))))
      .then((list) => {
        if (cancelled) return;
        setScenes(list.flatMap((r, i) => (r.struttura?.scene ?? []).map((s) => ({ id: s.id, label: s.titolo, group: `Scene · ${works[i].titolo}` }))));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [base, project.data]);

  const notes: Sheet<Note>[] = useMemo(() => (isProject ? (sheets.data?.appunti ?? []) : (library.data?.appunti ?? [])), [isProject, sheets.data, library.data]);
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.data.tag))).sort((a, b) => a.localeCompare(b, "it")), [notes]);

  const linkOptions: LinkOption[] = useMemo(
    () =>
      sheets.data
        ? [
            ...sheets.data.personaggi.map((c) => ({ id: c.data.id, label: c.data.nome, group: "Personaggi" })),
            ...sheets.data.voci.map((v) => ({ id: v.data.id, label: v.data.nome, group: "Mondo" })),
            ...scenes,
          ]
        : [],
    [sheets.data, scenes],
  );

  const title = isProject ? (project.data?.manifest.titolo ?? "Progetto") : "Appunti globali";
  const header = isProject ? (
    <ProjectNav owner={scope.owner} repo={scope.repo} title={title} current="appunti" />
  ) : (
    <div className="page-head">
      <div>
        <Link href="/" className="small">
          ← Libreria
        </Link>
        <h1>Appunti globali</h1>
        <div className="small muted">
          Idee non legate a un solo libro: collegale a uno o più progetti, o spostale dentro un progetto quando trovano casa. Sono nel repository privato{" "}
          <code>{library.data ? `${library.data.owner}/${library.data.repo}` : "writly-libreria"}</code>
          {library.data && !library.data.exists ? " (lo creo al primo salvataggio)" : ""}.
        </div>
      </div>
    </div>
  );

  const error = project.error ?? sheets.error ?? library.error;
  if (error) {
    return (
      <main className="page">
        {header}
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      </main>
    );
  }
  const loaded = isProject ? !!sheets.data : !!library.data;
  if (!loaded) {
    return (
      <main className="page">
        {header}
        <p className="muted">Carico gli appunti…</p>
      </main>
    );
  }

  function setNotes(next: Sheet<Note>[]) {
    const sorted = [...next].sort((a, b) => b.data.creato.localeCompare(a.data.creato) || a.data.titolo.localeCompare(b.data.titolo, "it"));
    if (isProject) sheets.set({ ...sheets.data!, appunti: sorted });
    else library.set({ ...library.data!, exists: true, appunti: sorted });
  }

  function guard() {
    if (dirty && !window.confirm("Ci sono modifiche non salvate a questo appunto. Abbandonarle?")) return false;
    setDirty(false);
    return true;
  }

  function open(path: string) {
    if (!guard()) return;
    setSelected(path);
    setCreating(null);
    setNotice(null);
  }

  function startNew(titolo = "") {
    if (!guard()) return;
    setCreating(titolo);
    setSelected(null);
    setNotice(null);
  }

  async function save(note: Note, sheet: Sheet<Note> | null): Promise<string | null> {
    try {
      const res = isProject
        ? await api<Sheet<Note>>(`${base}/schede`, { method: "POST", json: { azione: "appunto", path: sheet?.path, sha: sheet?.sha, data: note } })
        : await api<Sheet<Note>>("/api/appunti", { method: "POST", json: { azione: "salva", path: sheet?.path, sha: sheet?.sha, data: note } });
      setNotes([...notes.filter((n) => n.path !== res.path), res]);
      setDirty(false);
      setCreating(null);
      setSelected(res.path);
      setNotice({ kind: "ok", text: sheet ? "Appunto salvato." : `Appunto «${res.data.titolo}» creato.` });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      return e.status === 409 ? "L'appunto è cambiato su GitHub nel frattempo: ricarica la pagina (copia prima le tue modifiche)." : e.message;
    }
  }

  async function remove(sheet: Sheet<Note>) {
    if (!window.confirm(`Eliminare l'appunto «${sheet.data.titolo}»?`)) return;
    try {
      if (isProject) await api(`${base}/schede`, { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha } });
      else await api("/api/appunti", { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha } });
      setNotes(notes.filter((n) => n.path !== sheet.path));
      setDirty(false);
      setSelected(null);
      setNotice({ kind: "ok", text: "Appunto eliminato." });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  async function move(sheet: Sheet<Note>, target?: { owner: string; repo: string }) {
    try {
      if (isProject) {
        await api(`${base}/schede`, { method: "POST", json: { azione: "sposta-in-libreria", path: sheet.path, sha: sheet.sha } });
        setNotice({ kind: "ok", text: `«${sheet.data.titolo}» spostato negli appunti globali.`, href: "/appunti" });
      } else if (target) {
        await api("/api/appunti", { method: "POST", json: { azione: "sposta", path: sheet.path, sha: sheet.sha, ...target } });
        setNotice({ kind: "ok", text: `«${sheet.data.titolo}» spostato in ${target.owner}/${target.repo}.`, href: `/progetto/${target.owner}/${target.repo}/appunti` });
      }
      setNotes(notes.filter((n) => n.path !== sheet.path));
      setDirty(false);
      setSelected(null);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  const inboxCount = notes.filter((n) => n.data.inbox).length;
  let shown = searchNotes(notes.map((n) => ({ ...n.data, sheet: n })), query).map((n) => n.sheet);
  if (tipo) shown = shown.filter((n) => n.data.tipo === tipo);
  if (tag) shown = shown.filter((n) => n.data.tag.includes(tag));
  if (onlyInbox) shown = shown.filter((n) => n.data.inbox);
  const current = creating !== null ? null : (notes.find((n) => n.path === selected) ?? null);
  const projectList = (projects.data?.progetti ?? []).filter((p) => p.isProject);

  return (
    <main className="page page-wide">
      {header}
      {isProject && (
        <div className="page-head">
          <div>
            <h1>Appunti</h1>
            <div className="small muted">Idee, spunti, ricerche e citazioni del progetto, collegati a personaggi, mondo e scene; e il glossario.</div>
          </div>
        </div>
      )}
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}{" "}
          {notice.href && (
            <Link href={notice.href} className="small">
              Vai →
            </Link>
          )}
        </div>
      )}
      {(isProject ? sheets.data!.errori.filter((e) => e.path.startsWith("appunti/") || e.path === "glossario.yaml") : library.data!.errori).map((e) => (
        <div key={e.path} className="notice notice-warn" role="alert">
          Non riesco a leggere {e.path}: {e.message}
        </div>
      ))}

      {isProject && (
        <div className="segmented" role="tablist" aria-label="Appunti e glossario">
          <button type="button" role="tab" aria-selected={tab === "appunti"} onClick={() => guard() && setTab("appunti")}>
            Appunti ({notes.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === "glossario"} onClick={() => guard() && setTab("glossario")}>
            Glossario ({sheets.data!.glossario.items.length})
          </button>
        </div>
      )}

      {tab === "glossario" && isProject ? (
        <GlossaryPanel base={base!} data={sheets.data!} onData={sheets.set} />
      ) : (
        <div className="split">
          <div className="stack" style={{ gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => startNew()}>
              Nuovo appunto
            </button>
            <label htmlFor="note-search" className="sr-only">
              Cerca negli appunti
            </label>
            <input id="note-search" className="input" type="search" placeholder="Cerca (anche #tag)" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="row">
              <label htmlFor="note-tipo" className="sr-only">
                Filtra per tipo
              </label>
              <select id="note-tipo" className="select" style={{ flex: 1, width: "auto" }} value={tipo} onChange={(e) => setTipo(e.target.value as NoteType | "")}>
                <option value="">Tutti i tipi</option>
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NOTE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              {allTags.length > 0 && (
                <>
                  <label htmlFor="note-tag" className="sr-only">
                    Filtra per tag
                  </label>
                  <select id="note-tag" className="select" style={{ flex: 1, width: "auto" }} value={tag} onChange={(e) => setTag(e.target.value)}>
                    <option value="">Tutti i tag</option>
                    {allTags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <label className="small row" style={{ gap: 6 }}>
              <input type="checkbox" checked={onlyInbox} onChange={(e) => setOnlyInbox(e.target.checked)} />
              Solo da smistare ({inboxCount})
            </label>
            <nav className="side-list" aria-label="Elenco degli appunti">
              {shown.length === 0 && <div className="small muted" style={{ padding: 10 }}>{notes.length ? "Nessun appunto corrisponde." : "Nessun appunto ancora."}</div>}
              {shown.map((n) => (
                <button key={n.path} type="button" className="side-item" aria-current={n.path === current?.path || undefined} onClick={() => open(n.path)}>
                  <span>
                    {n.data.inbox && <span className="dot-inbox" aria-label="Da smistare" />}
                    {n.data.titolo}
                  </span>
                  <span className="small muted">
                    {NOTE_TYPE_LABEL[n.data.tipo]}
                    {n.data.creato ? ` · ${n.data.creato}` : ""}
                    {n.data.tag.length ? ` · ${n.data.tag.map((t) => `#${t}`).join(" ")}` : ""}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {creating !== null || current ? (
            <NoteForm
              key={creating !== null ? `nuovo-${creating}` : `${current!.path}-${current!.sha}`}
              sheet={current}
              initialTitle={creating ?? ""}
              notes={notes}
              isProject={isProject}
              linkOptions={linkOptions}
              projectList={projectList}
              onDirty={setDirty}
              onSave={save}
              onDelete={remove}
              onMove={move}
              onOpenTitle={(t) => {
                const found = findByTitle(notes.map((n) => ({ titolo: n.data.titolo, path: n.path })), t);
                if (found) open(found.path);
                else startNew(t);
              }}
              onCancel={() => guard() && setCreating(null)}
            />
          ) : (
            <section className="card muted">Scegli un appunto o creane uno nuovo. Con Alt+Maiusc+N catturi un&apos;idea da qualsiasi pagina.</section>
          )}
        </div>
      )}
    </main>
  );
}

function NoteForm({
  sheet,
  initialTitle,
  notes,
  isProject,
  linkOptions,
  projectList,
  onDirty,
  onSave,
  onDelete,
  onMove,
  onOpenTitle,
  onCancel,
}: {
  sheet: Sheet<Note> | null;
  initialTitle: string;
  notes: Sheet<Note>[];
  isProject: boolean;
  linkOptions: LinkOption[];
  projectList: RepoSummary[];
  onDirty: (d: boolean) => void;
  onSave: (n: Note, sheet: Sheet<Note> | null) => Promise<string | null>;
  onDelete: (s: Sheet<Note>) => void;
  onMove: (s: Sheet<Note>, target?: { owner: string; repo: string }) => void;
  onOpenTitle: (title: string) => void;
  onCancel: () => void;
}) {
  const initial = sheet?.data ?? emptyNote(initialTitle);
  const [n, setN] = useState<Note>(initial);
  const [tagText, setTagText] = useState(initial.tag.join(", "));
  const [linkTarget, setLinkTarget] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const splitTags = (t: string) => Array.from(new Set(t.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean)));
  function change(next: Note, tags = tagText) {
    setN(next);
    onDirty(JSON.stringify({ ...next, tag: splitTags(tags) }) !== JSON.stringify(initial));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const failure = await onSave({ ...n, titolo: n.titolo.trim(), tag: splitTags(tagText) }, sheet);
    if (failure) setError(failure);
    setBusy(false);
  }

  const plain = notes.map((x) => ({ ...x.data, path: x.path }));
  const links = wikiLinks(n.testo);
  const incoming = sheet ? backlinks(plain, { titolo: sheet.data.titolo }).filter((x) => x.path !== sheet.path) : [];
  const labelOf = (id: string) => linkOptions.find((o) => o.id === id)?.label ?? "(scheda eliminata)";
  const groups = Array.from(new Set(linkOptions.map((o) => o.group)));

  return (
    <form className="card stack" onSubmit={submit} aria-label={sheet ? `Appunto ${sheet.data.titolo}` : "Nuovo appunto"}>
      {n.inbox && (
        <div className="notice notice-warn row" style={{ justifyContent: "space-between" }}>
          <span>Da smistare: catturato al volo.</span>
          <button type="button" className="btn btn-small" onClick={() => change({ ...n, inbox: false })}>
            Segna come smistato
          </button>
        </div>
      )}
      <div className="form-grid">
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="note-titolo">Titolo</label>
          <input id="note-titolo" className="input" required maxLength={200} value={n.titolo} onChange={(e) => change({ ...n, titolo: e.target.value })} autoFocus={!sheet} />
        </div>
        <div className="field">
          <label htmlFor="note-tipo-f">Tipo</label>
          <select id="note-tipo-f" className="select" value={n.tipo} onChange={(e) => change({ ...n, tipo: e.target.value as NoteType })}>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="note-tags">Tag</label>
          <input
            id="note-tags"
            className="input"
            maxLength={1000}
            placeholder="separati da virgola"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              change(n, e.target.value);
            }}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="note-testo">Testo</label>
        <textarea id="note-testo" className="textarea note-text" rows={12} value={n.testo} onChange={(e) => change({ ...n, testo: e.target.value })} />
        <span className="hint">Markdown. Scrivi [[Titolo]] per collegare un altro appunto.</span>
      </div>

      {(links.length > 0 || incoming.length > 0) && (
        <div className="form-grid">
          {links.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Rimanda a
              </div>
              <ul className="plain-list">
                {links.map((t) => {
                  const exists = !!findByTitle(plain, t);
                  return (
                    <li key={t}>
                      <button type="button" className="link-button" onClick={() => onOpenTitle(t)}>
                        {t}
                      </button>
                      {!exists && <span className="small muted"> — non esiste ancora: clic per crearlo</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {incoming.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Citato da
              </div>
              <ul className="plain-list">
                {incoming.map((x) => (
                  <li key={x.path}>
                    <button type="button" className="link-button" onClick={() => onOpenTitle(x.titolo)}>
                      {x.titolo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isProject ? (
        <fieldset className="fieldset">
          <legend>Collegato a</legend>
          <div className="chips">
            {n.collegamenti.length === 0 && <span className="small muted">Personaggi, voci del mondo o scene.</span>}
            {n.collegamenti.map((id) => (
              <span key={id} className="chip chip-static">
                {labelOf(id)}
                <button type="button" className="chip-x" aria-label={`Togli ${labelOf(id)}`} onClick={() => change({ ...n, collegamenti: n.collegamenti.filter((x) => x !== id) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label htmlFor="note-link" className="sr-only">
              Collega a
            </label>
            <select id="note-link" className="select" style={{ flex: "1 1 220px", width: "auto" }} value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}>
              <option value="">Collega a…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {linkOptions
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <option key={o.id} value={o.id} disabled={n.collegamenti.includes(o.id)}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-small"
              disabled={!linkTarget}
              onClick={() => {
                change({ ...n, collegamenti: [...n.collegamenti, linkTarget] });
                setLinkTarget("");
              }}
            >
              Collega
            </button>
          </div>
        </fieldset>
      ) : (
        <fieldset className="fieldset">
          <legend>Progetti collegati</legend>
          {projectList.length === 0 && <span className="small muted">Nessun progetto.</span>}
          <div className="chips">
            {projectList.map((p) => {
              const ref = `${p.owner}/${p.repo}`;
              return (
                <label key={ref} className="chip-check">
                  <input
                    type="checkbox"
                    checked={n.progetti.includes(ref)}
                    onChange={(e) => change({ ...n, progetti: e.target.checked ? [...n.progetti, ref] : n.progetti.filter((x) => x !== ref) })}
                  />
                  {p.repo}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="row sticky-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !n.titolo.trim()}>
          {busy ? "Salvo su GitHub…" : sheet ? "Salva appunto" : "Crea appunto"}
        </button>
        {!sheet && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Annulla
          </button>
        )}
        {sheet && isProject && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => window.confirm("Spostare l'appunto negli appunti globali? Resterà collegato a questo progetto; i collegamenti a personaggi e scene si perdono.") && onMove(sheet)}
          >
            Sposta negli appunti globali
          </button>
        )}
        {sheet && !isProject && projectList.length > 0 && (
          <span className="row">
            <label htmlFor="move-target" className="sr-only">
              Progetto di destinazione
            </label>
            <select id="move-target" className="select" style={{ width: "auto" }} value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
              <option value="">Sposta in un progetto…</option>
              {projectList.map((p) => (
                <option key={`${p.owner}/${p.repo}`} value={`${p.owner}/${p.repo}`}>
                  {p.repo}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || !moveTarget}
              onClick={() => {
                const [owner, repo] = moveTarget.split("/");
                onMove(sheet, { owner, repo });
              }}
            >
              Sposta
            </button>
          </span>
        )}
        {sheet && (
          <button type="button" className="btn btn-ghost danger-text" onClick={() => onDelete(sheet)} disabled={busy}>
            Elimina
          </button>
        )}
      </div>
    </form>
  );
}
