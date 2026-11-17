"use client";

import { useState, type FormEvent } from "react";
import ProjectNav from "@/components/project/ProjectNav";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { useApiData, useBeforeUnload } from "@/lib/client/hooks";
import {
  CHARACTER_GROUPS,
  RELATION_SUGGESTIONS,
  emptyCharacter,
  type Character,
  type Relation,
} from "@/lib/project/entities";
import { shortId } from "@/lib/project/slug";
import type { ProjectData } from "@/lib/server/projects";
import type { Sheet, SheetsData } from "@/lib/server/sheets";
import RelationGraph from "./RelationGraph";

type Tab = "schede" | "relazioni";
type GroupKey = keyof typeof CHARACTER_GROUPS;

export default function CharactersView({ owner, repo }: { owner: string; repo: string }) {
  const base = projectApi(owner, repo);
  const project = useApiData<ProjectData>(base);
  const sheets = useApiData<SheetsData>(`${base}/schede`);
  const [tab, setTab] = useState<Tab>("schede");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useBeforeUnload(dirty);

  const nav = <ProjectNav owner={owner} repo={repo} title={project.data?.manifest.titolo ?? "Progetto"} current="personaggi" />;
  const error = project.error ?? sheets.error;
  if (error) {
    return (
      <main className="page">
        {nav}
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      </main>
    );
  }
  const data = sheets.data;
  if (!data || !project.data) {
    return (
      <main className="page">
        {nav}
        <p className="muted">Carico i personaggi…</p>
      </main>
    );
  }

  const characters = data.personaggi;
  const current = creating ? null : (characters.find((c) => c.data.id === selected) ?? characters[0] ?? null);

  function select(id: string | null, create = false) {
    if (dirty && !window.confirm("Ci sono modifiche non salvate a questa scheda. Abbandonarle?")) return;
    setDirty(false);
    setCreating(create);
    setSelected(id);
    setNotice(null);
  }

  function onSaved(sheet: Sheet<Character>, isNew: boolean) {
    const rest = data!.personaggi.filter((c) => c.path !== sheet.path);
    sheets.set({ ...data!, personaggi: [...rest, sheet].sort((a, b) => a.data.nome.localeCompare(b.data.nome, "it")) });
    setDirty(false);
    setCreating(false);
    setSelected(sheet.data.id);
    setNotice({ kind: "ok", text: isNew ? `Scheda di ${sheet.data.nome} creata.` : `Scheda di ${sheet.data.nome} salvata.` });
  }

  async function onDelete(sheet: Sheet<Character>) {
    const n = data!.relazioni.items.filter((r) => r.da === sheet.data.id || r.a === sheet.data.id).length;
    const msg = `Eliminare la scheda di ${sheet.data.nome}?${n ? ` Verranno tolte anche le sue ${n} relazioni.` : ""} Le scene che lo citano lo mostreranno come «eliminato».`;
    if (!window.confirm(msg)) return;
    try {
      await api(`${base}/schede`, { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha, id: sheet.data.id } });
      sheets.set({
        ...data!,
        personaggi: data!.personaggi.filter((c) => c.path !== sheet.path),
        relazioni: { ...data!.relazioni, items: data!.relazioni.items.filter((r) => r.da !== sheet.data.id && r.a !== sheet.data.id) },
      });
      // Lo sha di relazioni.yaml è cambiato sul server: lo rileggiamo per le prossime modifiche.
      if (n) api<SheetsData>(`${base}/schede`).then(sheets.set).catch(() => undefined);
      setDirty(false);
      setSelected(null);
      setNotice({ kind: "ok", text: `Scheda di ${sheet.data.nome} eliminata.` });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  async function saveRelations(items: Relation[]): Promise<boolean> {
    try {
      const res = await api<{ sha: string; items: Relation[] }>(`${base}/schede`, {
        method: "POST",
        json: { azione: "relazioni", sha: data!.relazioni.sha, items },
      });
      sheets.set({ ...data!, relazioni: res });
      setNotice({ kind: "ok", text: "Relazioni salvate su GitHub." });
      return true;
    } catch (err) {
      const e = err as ClientApiError;
      setNotice({ kind: "error", text: e.status === 409 ? "Le relazioni sono cambiate su GitHub nel frattempo: ricarica la pagina." : e.message });
      return false;
    }
  }

  const nameOf = (id: string) => characters.find((c) => c.data.id === id)?.data.nome ?? "(eliminato)";
  const works = project.data.opere;

  return (
    <main className="page page-wide">
      {nav}
      <div className="page-head">
        <div>
          <h1>Personaggi</h1>
          <div className="small muted">
            {characters.length} {characters.length === 1 ? "scheda" : "schede"} · {data.relazioni.items.length} relazioni. Nomi e alias vengono riconosciuti nei capitoli e accettati dal controllo ortografico.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => select(null, true)}>
          Nuovo personaggio
        </button>
      </div>

      {data.errori
        .filter((e) => e.path.startsWith("personaggi/") || e.path === "relazioni.yaml")
        .map((e) => (
          <div key={e.path} className="notice notice-warn" role="alert">
            Non riesco a leggere {e.path}: {e.message}
          </div>
        ))}
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Viste dei personaggi">
        <button type="button" role="tab" className="tab" aria-selected={tab === "schede"} onClick={() => setTab("schede")}>
          Schede
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "relazioni"} onClick={() => setTab("relazioni")}>
          Relazioni e grafo
        </button>
      </div>

      {tab === "schede" ? (
        <div className="split">
          <nav className="side-list" aria-label="Elenco dei personaggi">
            {characters.length === 0 && !creating && <div className="small muted" style={{ padding: 10 }}>Nessun personaggio ancora.</div>}
            {characters.map((c) => (
              <button key={c.path} type="button" className="side-item" aria-current={current?.path === c.path || undefined} onClick={() => select(c.data.id)}>
                <span>{c.data.nome}</span>
                {c.data.ruolo && <span className="small muted">{c.data.ruolo}</span>}
              </button>
            ))}
            {creating && (
              <div className="side-item" aria-current>
                <span>Nuovo personaggio</span>
                <span className="small muted">non ancora salvato</span>
              </div>
            )}
          </nav>
          {creating || current ? (
            <CharacterForm
              key={creating ? "nuovo" : current!.path}
              base={base}
              sheet={creating ? null : current}
              relations={current ? data.relazioni.items.filter((r) => r.da === current.data.id || r.a === current.data.id) : []}
              backlinks={current ? data.voci.filter((v) => v.data.collegamenti.some((l) => l.id === current.data.id)).map((v) => ({ nome: v.data.nome, nota: v.data.collegamenti.find((l) => l.id === current.data.id)?.nota ?? "" })) : []}
              nameOf={nameOf}
              onDirty={setDirty}
              onSaved={onSaved}
              onDelete={onDelete}
              onCancel={() => select(null)}
            />
          ) : (
            <section className="card">
              <p className="muted" style={{ margin: 0 }}>
                Crea il primo personaggio: nome, alias e tratti fisici, morali e di comportamento.
              </p>
            </section>
          )}
        </div>
      ) : (
        <RelationsPanel
          characters={characters.map((c) => c.data)}
          relations={data.relazioni.items}
          works={works.length > 1 ? works.map((w) => ({ slug: w.slug, titolo: w.titolo })) : []}
          nameOf={nameOf}
          onSave={saveRelations}
          onOpen={(id) => {
            setTab("schede");
            select(id);
          }}
        />
      )}
    </main>
  );
}

function CharacterForm({
  base,
  sheet,
  relations,
  backlinks,
  nameOf,
  onDirty,
  onSaved,
  onDelete,
  onCancel,
}: {
  base: string;
  sheet: Sheet<Character> | null;
  relations: Relation[];
  backlinks: { nome: string; nota: string }[];
  nameOf: (id: string) => string;
  onDirty: (dirty: boolean) => void;
  onSaved: (sheet: Sheet<Character>, isNew: boolean) => void;
  onDelete: (sheet: Sheet<Character>) => void;
  onCancel: () => void;
}) {
  const initial = sheet?.data ?? emptyCharacter("nuovo", "");
  const [c, setC] = useState<Character>(initial);
  const [aliasText, setAliasText] = useState(initial.alias.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function change(next: Character, alias = aliasText) {
    setC(next);
    const normalized = { ...next, alias: splitAlias(alias) };
    onDirty(JSON.stringify(normalized) !== JSON.stringify(initial));
  }
  const setGroup = <K extends GroupKey>(g: K, field: string, value: string) => change({ ...c, [g]: { ...c[g], [field]: value } });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = { ...c, alias: splitAlias(aliasText) };
      const res = await api<Sheet<Character>>(`${base}/schede`, {
        method: "POST",
        json: { azione: "personaggio", path: sheet?.path, sha: sheet?.sha, data },
      });
      onSaved(res, !sheet);
    } catch (err) {
      const ex = err as ClientApiError;
      setError(ex.status === 409 ? "La scheda è cambiata su GitHub nel frattempo: ricarica la pagina (copia prima le tue modifiche)." : ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label={sheet ? `Scheda di ${sheet.data.nome}` : "Nuovo personaggio"}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ch-nome">Nome</label>
          <input id="ch-nome" className="input" required maxLength={200} value={c.nome} onChange={(e) => change({ ...c, nome: e.target.value })} autoFocus={!sheet} />
        </div>
        <div className="field">
          <label htmlFor="ch-alias">Alias e soprannomi</label>
          <input
            id="ch-alias"
            className="input"
            maxLength={2000}
            value={aliasText}
            placeholder="separati da virgola"
            onChange={(e) => {
              setAliasText(e.target.value);
              change(c, e.target.value);
            }}
          />
          <span className="hint">Servono a riconoscerlo nel testo.</span>
        </div>
        <div className="field">
          <label htmlFor="ch-ruolo">Ruolo</label>
          <input id="ch-ruolo" className="input" maxLength={200} value={c.ruolo} placeholder="protagonista, antagonista, mentore…" onChange={(e) => change({ ...c, ruolo: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ch-eta">Età</label>
          <input id="ch-eta" className="input" maxLength={200} value={c.eta} onChange={(e) => change({ ...c, eta: e.target.value })} />
        </div>
      </div>

      {(Object.keys(CHARACTER_GROUPS) as GroupKey[]).map((g) => (
        <fieldset key={g} className="fieldset">
          <legend>{CHARACTER_GROUPS[g].label}</legend>
          <div className="form-grid">
            {Object.entries(CHARACTER_GROUPS[g].fields).map(([field, label]) => (
              <div key={field} className="field">
                <label htmlFor={`ch-${g}-${field}`}>{label}</label>
                <textarea
                  id={`ch-${g}-${field}`}
                  className="textarea"
                  rows={2}
                  maxLength={4000}
                  value={(c[g] as Record<string, string>)[field]}
                  onChange={(e) => setGroup(g, field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="field">
        <label htmlFor="ch-bio">Biografia</label>
        <textarea id="ch-bio" className="textarea" rows={6} value={c.biografia} onChange={(e) => change({ ...c, biografia: e.target.value })} />
        <span className="hint">Testo libero in Markdown: è il corpo del file della scheda.</span>
      </div>

      {sheet && (relations.length > 0 || backlinks.length > 0) && (
        <div className="form-grid">
          {relations.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Relazioni
              </div>
              <ul className="plain-list">
                {relations.map((r) => (
                  <li key={r.id}>
                    {nameOf(r.da)} <em>{r.tipo}</em> {nameOf(r.a)}
                    {r.nota && <span className="muted"> — {r.nota}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {backlinks.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Nel mondo
              </div>
              <ul className="plain-list">
                {backlinks.map((b) => (
                  <li key={b.nome}>
                    {b.nome}
                    {b.nota && <span className="muted"> — {b.nota}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="row sticky-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !c.nome.trim()}>
          {busy ? "Salvo su GitHub…" : sheet ? "Salva scheda" : "Crea scheda"}
        </button>
        {!sheet && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Annulla
          </button>
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

function splitAlias(text: string): string[] {
  return Array.from(new Set(text.split(",").map((a) => a.trim()).filter(Boolean)));
}

function RelationsPanel({
  characters,
  relations,
  works,
  nameOf,
  onSave,
  onOpen,
}: {
  characters: Character[];
  relations: Relation[];
  works: { slug: string; titolo: string }[];
  nameOf: (id: string) => string;
  onSave: (items: Relation[]) => Promise<boolean>;
  onOpen: (id: string) => void;
}) {
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [tipo, setTipo] = useState("");
  const [nota, setNota] = useState("");
  const [libri, setLibri] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = filter ? relations.filter((r) => r.libri.length === 0 || r.libri.includes(filter)) : relations;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!da || !a || !tipo.trim()) return;
    setBusy(true);
    const ok = await onSave([...relations, { id: shortId(), da, a, tipo: tipo.trim(), nota: nota.trim(), libri }]);
    setBusy(false);
    if (ok) {
      setTipo("");
      setNota("");
      setLibri([]);
    }
  }

  async function remove(r: Relation) {
    if (!window.confirm(`Togliere la relazione «${nameOf(r.da)} ${r.tipo} ${nameOf(r.a)}»?`)) return;
    setBusy(true);
    await onSave(relations.filter((x) => x.id !== r.id));
    setBusy(false);
  }

  const bookTitle = (slug: string) => works.find((w) => w.slug === slug)?.titolo ?? slug;

  return (
    <div className="stack">
      {works.length > 0 && (
        <div className="row">
          <label htmlFor="rel-filter" className="small">
            Mostra le relazioni valide in
          </label>
          <select id="rel-filter" className="select" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">tutti i libri</option>
            {works.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.titolo}
              </option>
            ))}
          </select>
        </div>
      )}
      <section className="card">
        <RelationGraph characters={characters} relations={shown} selected={focus} onSelect={(id) => (focus === id ? onOpen(id) : setFocus(id))} />
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Un clic evidenzia le relazioni di un personaggio, il secondo clic apre la scheda.
        </p>
      </section>

      <section className="card table-card">
        <h2 className="h2">Relazioni</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Da</th>
                <th scope="col">Relazione</th>
                <th scope="col">A</th>
                <th scope="col">Nota</th>
                {works.length > 0 && <th scope="col">Libri</th>}
                <th scope="col">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Nessuna relazione.
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{nameOf(r.da)}</td>
                  <td>
                    <em>{r.tipo}</em>
                  </td>
                  <td>{nameOf(r.a)}</td>
                  <td>{r.nota || "—"}</td>
                  {works.length > 0 && <td>{r.libri.length ? r.libri.map(bookTitle).join(", ") : "tutti"}</td>}
                  <td>
                    <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => remove(r)} disabled={busy}>
                      Togli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="stack" style={{ marginTop: 16 }} onSubmit={add}>
          <h3 className="h2" style={{ margin: 0 }}>
            Nuova relazione
          </h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rel-da">Da</label>
              <select id="rel-da" className="select" required value={da} onChange={(e) => setDa(e.target.value)}>
                <option value="">Scegli…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rel-tipo">Relazione</label>
              <input id="rel-tipo" className="input" required list="rel-tipi" maxLength={200} value={tipo} placeholder="es. mentore di" onChange={(e) => setTipo(e.target.value)} />
              <datalist id="rel-tipi">
                {RELATION_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="rel-a">A</label>
              <select id="rel-a" className="select" required value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Scegli…</option>
                {characters
                  .filter((c) => c.id !== da)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rel-nota">Nota</label>
              <input id="rel-nota" className="input" maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </div>
          {works.length > 0 && (
            <fieldset className="fieldset">
              <legend>Vale nei libri (nessuno = in tutti)</legend>
              <div className="chips">
                {works.map((w) => (
                  <label key={w.slug} className="chip-check">
                    <input type="checkbox" checked={libri.includes(w.slug)} onChange={(e) => setLibri(e.target.checked ? [...libri, w.slug] : libri.filter((x) => x !== w.slug))} />
                    {w.titolo}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <button type="submit" className="btn" disabled={busy || !da || !a || !tipo.trim() || characters.length < 2}>
              {busy ? "Salvo…" : "Aggiungi relazione"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
