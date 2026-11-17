"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import ProjectNav from "@/components/project/ProjectNav";
import Modal from "@/components/ui/Modal";
import { api, ClientApiError, projectApi } from "@/lib/client/api";
import { useApiData, useBeforeUnload } from "@/lib/client/hooks";
import { ancestors, type WorldCategory, type WorldEntry } from "@/lib/project/entities";
import { slugify, uniqueSlug } from "@/lib/project/slug";
import type { ProjectData } from "@/lib/server/projects";
import type { SheetsData, WorldSheet } from "@/lib/server/sheets";

const emptyEntry = (): WorldEntry => ({ id: "nuova", nome: "", alias: [], genitore: null, campi: {}, collegamenti: [], descrizione: "" });

export default function WorldView({ owner, repo }: { owner: string; repo: string }) {
  const base = projectApi(owner, repo);
  const project = useApiData<ProjectData>(base);
  const sheets = useApiData<SheetsData>(`${base}/schede`);
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editCats, setEditCats] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useBeforeUnload(dirty);

  const data = sheets.data;
  const entriesById = useMemo(() => new Map((data?.voci ?? []).map((v) => [v.data.id, v.data])), [data]);

  const nav = <ProjectNav owner={owner} repo={repo} title={project.data?.manifest.titolo ?? "Progetto"} current="mondo" />;
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
  if (!data) {
    return (
      <main className="page">
        {nav}
        <p className="muted">Carico il mondo…</p>
      </main>
    );
  }

  const cats = data.categorie.items;
  const known = new Set(cats.map((c) => c.id));
  const orphanCats = Array.from(new Set(data.voci.map((v) => v.categoria).filter((c) => !known.has(c))));
  const allCats: WorldCategory[] = [...cats, ...orphanCats.map((id) => ({ id, nome: `${id} (categoria non definita)`, campi: [] }))];
  const cat = allCats.find((c) => c.id === category) ?? allCats[0];
  const inCat = data.voci.filter((v) => v.categoria === cat?.id);
  const current = creating ? null : (inCat.find((v) => v.data.id === selected) ?? inCat[0] ?? null);

  function guard(): boolean {
    if (dirty && !window.confirm("Ci sono modifiche non salvate a questa voce. Abbandonarle?")) return false;
    setDirty(false);
    setNotice(null);
    return true;
  }

  function openEntry(id: string) {
    const v = data!.voci.find((x) => x.data.id === id);
    if (!v || !guard()) return;
    setCategory(v.categoria);
    setSelected(id);
    setCreating(false);
  }

  function onSaved(sheet: WorldSheet, isNew: boolean) {
    const rest = data!.voci.filter((v) => v.path !== sheet.path);
    sheets.set({ ...data!, voci: [...rest, sheet].sort((a, b) => a.data.nome.localeCompare(b.data.nome, "it")) });
    setDirty(false);
    setCreating(false);
    setSelected(sheet.data.id);
    setNotice({ kind: "ok", text: isNew ? `Voce «${sheet.data.nome}» creata.` : `Voce «${sheet.data.nome}» salvata.` });
  }

  async function onDelete(sheet: WorldSheet) {
    const children = data!.voci.filter((v) => v.data.genitore === sheet.data.id).length;
    const msg = `Eliminare «${sheet.data.nome}»?${children ? ` ${children} voci la indicano come contenitore: resteranno senza.` : ""}`;
    if (!window.confirm(msg)) return;
    try {
      await api(`${base}/schede`, { method: "POST", json: { azione: "elimina", path: sheet.path, sha: sheet.sha } });
      sheets.set({ ...data!, voci: data!.voci.filter((v) => v.path !== sheet.path) });
      setDirty(false);
      setSelected(null);
      setNotice({ kind: "ok", text: `Voce «${sheet.data.nome}» eliminata.` });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
  }

  async function saveCategories(items: WorldCategory[]): Promise<string | null> {
    try {
      const res = await api<{ sha: string; items: WorldCategory[] }>(`${base}/schede`, {
        method: "POST",
        json: { azione: "categorie", sha: data!.categorie.sha, items },
      });
      sheets.set({ ...data!, categorie: res });
      setNotice({ kind: "ok", text: "Categorie salvate su GitHub." });
      return null;
    } catch (err) {
      const e = err as ClientApiError;
      return e.status === 409 ? "Le categorie sono cambiate su GitHub nel frattempo: ricarica la pagina." : e.message;
    }
  }

  // Albero dentro la categoria: radici = voci il cui contenitore non è nella stessa categoria.
  const idsInCat = new Set(inCat.map((v) => v.data.id));
  const childrenOf = (id: string | null) => inCat.filter((v) => (id === null ? !v.data.genitore || !idsInCat.has(v.data.genitore) : v.data.genitore === id));
  const renderTree = (id: string | null, depth: number, seen: Set<string>): ReactNode[] =>
    childrenOf(id)
      .filter((v) => !seen.has(v.data.id))
      .flatMap((v) => {
        const next = new Set(seen).add(v.data.id);
        return [
          <button
            key={v.path}
            type="button"
            className="side-item"
            style={{ paddingLeft: 10 + depth * 16 }}
            aria-current={current?.path === v.path || undefined}
            onClick={() => guard() && (setSelected(v.data.id), setCreating(false))}
          >
            <span>
              {depth > 0 && <span aria-hidden="true">↳ </span>}
              {v.data.nome}
            </span>
            {depth === 0 && v.data.genitore && entriesById.get(v.data.genitore) && <span className="small muted">in {entriesById.get(v.data.genitore)!.nome}</span>}
          </button>,
          ...renderTree(v.data.id, depth + 1, next),
        ];
      });

  return (
    <main className="page page-wide">
      {nav}
      <div className="page-head">
        <div>
          <h1>Mondo</h1>
          <div className="small muted">
            Luoghi, culture, sistemi, oggetti, storia e lingue: voci con campi per categoria, collegate fra loro e ai personaggi. I nomi vengono riconosciuti nei capitoli.
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setEditCats(true)}>
            Categorie e campi
          </button>
          {cat && (
            <button type="button" className="btn btn-primary" onClick={() => guard() && (setCreating(true), setSelected(null))} disabled={!known.has(cat.id)}>
              Nuova voce in {cat.nome}
            </button>
          )}
        </div>
      </div>

      {data.errori
        .filter((e) => e.path.startsWith("mondo/"))
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

      <div className="tabs" role="tablist" aria-label="Categorie del mondo">
        {allCats.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={cat?.id === c.id}
            onClick={() => guard() && (setCategory(c.id), setSelected(null), setCreating(false))}
          >
            {c.nome} <span className="muted">({data.voci.filter((v) => v.categoria === c.id).length})</span>
          </button>
        ))}
      </div>

      {cat && (
        <div className="split">
          <nav className="side-list" aria-label={`Voci di ${cat.nome}`}>
            {inCat.length === 0 && !creating && <div className="small muted" style={{ padding: 10 }}>Nessuna voce in questa categoria.</div>}
            {renderTree(null, 0, new Set())}
            {creating && (
              <div className="side-item" aria-current>
                <span>Nuova voce</span>
                <span className="small muted">non ancora salvata</span>
              </div>
            )}
          </nav>
          {creating || current ? (
            <EntryForm
              key={creating ? `nuova-${cat.id}` : current!.path}
              base={base}
              sheet={creating ? null : current}
              category={cat}
              data={data}
              entriesById={entriesById}
              onOpen={openEntry}
              onDirty={setDirty}
              onSaved={onSaved}
              onDelete={onDelete}
              onCancel={() => guard() && setCreating(false)}
            />
          ) : (
            <section className="card">
              <p className="muted" style={{ margin: 0 }}>
                Crea la prima voce di «{cat.nome}».
              </p>
            </section>
          )}
        </div>
      )}

      <Modal open={editCats} onClose={() => setEditCats(false)} title="Categorie e campi" wide>
        {editCats && <CategoriesEditor categories={cats} counts={(id) => data.voci.filter((v) => v.categoria === id).length} onSave={saveCategories} onClose={() => setEditCats(false)} />}
      </Modal>
    </main>
  );
}

function EntryForm({
  base,
  sheet,
  category,
  data,
  entriesById,
  onOpen,
  onDirty,
  onSaved,
  onDelete,
  onCancel,
}: {
  base: string;
  sheet: WorldSheet | null;
  category: WorldCategory;
  data: SheetsData;
  entriesById: Map<string, WorldEntry>;
  onOpen: (id: string) => void;
  onDirty: (d: boolean) => void;
  onSaved: (s: WorldSheet, isNew: boolean) => void;
  onDelete: (s: WorldSheet) => void;
  onCancel: () => void;
}) {
  const initial = sheet?.data ?? emptyEntry();
  const [e, setE] = useState<WorldEntry>(initial);
  const [aliasText, setAliasText] = useState(initial.alias.join(", "));
  const [linkTarget, setLinkTarget] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const splitAlias = (t: string) => Array.from(new Set(t.split(",").map((a) => a.trim()).filter(Boolean)));
  function change(next: WorldEntry, alias = aliasText) {
    setE(next);
    onDirty(JSON.stringify({ ...next, alias: splitAlias(alias) }) !== JSON.stringify(initial));
  }

  // Contenitore: qualsiasi voce tranne sé stessa e le voci che contiene (niente cicli).
  const descendants = new Set<string>();
  if (sheet) {
    for (const v of data.voci) if (ancestors(entriesById, v.data.id).some((a) => a.id === sheet.data.id)) descendants.add(v.data.id);
  }
  const parentOptions = data.voci.filter((v) => v.data.id !== sheet?.data.id && !descendants.has(v.data.id));
  const characterName = new Map(data.personaggi.map((c) => [c.data.id, c.data.nome]));
  const label = (id: string) => characterName.get(id) ?? entriesById.get(id)?.nome ?? "(scheda eliminata)";
  const children = sheet ? data.voci.filter((v) => v.data.genitore === sheet.data.id) : [];
  const incoming = sheet ? data.voci.filter((v) => v.data.collegamenti.some((l) => l.id === sheet.data.id)) : [];
  const path = sheet ? ancestors(entriesById, sheet.data.id).reverse() : [];

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<WorldSheet>(`${base}/schede`, {
        method: "POST",
        json: { azione: "voce", path: sheet?.path, sha: sheet?.sha, categoria: category.id, data: { ...e, alias: splitAlias(aliasText) } },
      });
      onSaved(res, !sheet);
    } catch (err) {
      const ex = err as ClientApiError;
      setError(ex.status === 409 ? "La voce è cambiata su GitHub nel frattempo: ricarica la pagina (copia prima le tue modifiche)." : ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label={sheet ? `Voce ${sheet.data.nome}` : "Nuova voce"}>
      {path.length > 0 && (
        <nav className="small muted" aria-label="Contenuta in">
          {path.map((p, i) => (
            <span key={p.id}>
              {i > 0 && " › "}
              <button type="button" className="link-button" onClick={() => onOpen(p.id)}>
                {p.nome}
              </button>
            </span>
          ))}
          {" › "}
          {sheet?.data.nome}
        </nav>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="w-nome">Nome</label>
          <input id="w-nome" className="input" required maxLength={200} value={e.nome} onChange={(x) => change({ ...e, nome: x.target.value })} autoFocus={!sheet} />
        </div>
        <div className="field">
          <label htmlFor="w-alias">Altri nomi</label>
          <input
            id="w-alias"
            className="input"
            maxLength={2000}
            placeholder="separati da virgola"
            value={aliasText}
            onChange={(x) => {
              setAliasText(x.target.value);
              change(e, x.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="w-genitore">Si trova in / fa parte di</label>
          <select id="w-genitore" className="select" value={e.genitore ?? ""} onChange={(x) => change({ ...e, genitore: x.target.value || null })}>
            <option value="">—</option>
            {parentOptions.map((v) => (
              <option key={v.data.id} value={v.data.id}>
                {v.data.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {category.campi.length > 0 && (
        <fieldset className="fieldset">
          <legend>Campi di {category.nome}</legend>
          <div className="form-grid">
            {category.campi.map((f) => (
              <div key={f.id} className="field">
                <label htmlFor={`w-f-${f.id}`}>{f.nome}</label>
                <input
                  id={`w-f-${f.id}`}
                  className="input"
                  maxLength={4000}
                  value={e.campi[f.id] ?? ""}
                  onChange={(x) => {
                    const campi = { ...e.campi, [f.id]: x.target.value };
                    if (!x.target.value) delete campi[f.id];
                    change({ ...e, campi });
                  }}
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {Object.keys(e.campi).filter((k) => !category.campi.some((f) => f.id === k)).length > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Questa voce ha anche campi non più previsti dalla categoria ({Object.keys(e.campi).filter((k) => !category.campi.some((f) => f.id === k)).join(", ")}): restano nel file.
        </p>
      )}

      <div className="field">
        <label htmlFor="w-desc">Descrizione</label>
        <textarea id="w-desc" className="textarea" rows={6} value={e.descrizione} onChange={(x) => change({ ...e, descrizione: x.target.value })} />
      </div>

      <fieldset className="fieldset">
        <legend>Collegamenti</legend>
        {e.collegamenti.length === 0 && <span className="small muted">Personaggi o altre voci legate a questa (es. «membro», «nato qui»).</span>}
        <ul className="plain-list">
          {e.collegamenti.map((l) => (
            <li key={l.id} className="row">
              <span style={{ flex: 1 }}>
                {entriesById.has(l.id) ? (
                  <button type="button" className="link-button" onClick={() => onOpen(l.id)}>
                    {label(l.id)}
                  </button>
                ) : (
                  label(l.id)
                )}
                {l.nota && <span className="muted"> — {l.nota}</span>}
              </span>
              <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => change({ ...e, collegamenti: e.collegamenti.filter((x) => x.id !== l.id) })}>
                Togli
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <label htmlFor="w-link" className="sr-only">
            Collega a
          </label>
          <select id="w-link" className="select" style={{ flex: "1 1 200px", width: "auto" }} value={linkTarget} onChange={(x) => setLinkTarget(x.target.value)}>
            <option value="">Collega a…</option>
            {data.personaggi.length > 0 && (
              <optgroup label="Personaggi">
                {data.personaggi.map((c) => (
                  <option key={c.data.id} value={c.data.id} disabled={e.collegamenti.some((l) => l.id === c.data.id)}>
                    {c.data.nome}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Voci del mondo">
              {data.voci
                .filter((v) => v.data.id !== sheet?.data.id)
                .map((v) => (
                  <option key={v.data.id} value={v.data.id} disabled={e.collegamenti.some((l) => l.id === v.data.id)}>
                    {v.data.nome}
                  </option>
                ))}
            </optgroup>
          </select>
          <label htmlFor="w-link-note" className="sr-only">
            Nota del collegamento
          </label>
          <input id="w-link-note" className="input" style={{ flex: "1 1 160px", width: "auto" }} maxLength={200} placeholder="nota (es. membro)" value={linkNote} onChange={(x) => setLinkNote(x.target.value)} />
          <button
            type="button"
            className="btn btn-small"
            disabled={!linkTarget}
            onClick={() => {
              change({ ...e, collegamenti: [...e.collegamenti, { id: linkTarget, nota: linkNote.trim() }] });
              setLinkTarget("");
              setLinkNote("");
            }}
          >
            Collega
          </button>
        </div>
      </fieldset>

      {(children.length > 0 || incoming.length > 0) && (
        <div className="form-grid">
          {children.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Contiene
              </div>
              <ul className="plain-list">
                {children.map((c) => (
                  <li key={c.path}>
                    <button type="button" className="link-button" onClick={() => onOpen(c.data.id)}>
                      {c.data.nome}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {incoming.length > 0 && (
            <div>
              <div className="side-label" style={{ padding: "0 0 4px" }}>
                Citata da
              </div>
              <ul className="plain-list">
                {incoming.map((c) => (
                  <li key={c.path}>
                    <button type="button" className="link-button" onClick={() => onOpen(c.data.id)}>
                      {c.data.nome}
                    </button>
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
        <button type="submit" className="btn btn-primary" disabled={busy || !e.nome.trim()}>
          {busy ? "Salvo su GitHub…" : sheet ? "Salva voce" : "Crea voce"}
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

function CategoriesEditor({
  categories,
  counts,
  onSave,
  onClose,
}: {
  categories: WorldCategory[];
  counts: (id: string) => number;
  onSave: (items: WorldCategory[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<WorldCategory[]>(() => structuredClone(categories));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState("");
  const original = new Set(categories.map((c) => c.id));

  const update = (i: number, patch: Partial<WorldCategory>) => setItems(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function save() {
    setBusy(true);
    setError("");
    const failure = await onSave(items);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Per ogni categoria definisci i campi della scheda (es. luogo → clima, popolazione, governo). L&apos;identificativo di una categoria è la cartella dei suoi file e non cambia rinominandola.
      </p>
      {items.map((c, i) => (
        <fieldset key={c.id} className="fieldset">
          <legend>
            <span className="sr-only">Categoria </span>
            {c.nome || c.id} <span className="small muted">· mondo/{c.id}/</span>
          </legend>
          <div className="row">
            <label htmlFor={`cat-${c.id}`} className="sr-only">
              Nome della categoria
            </label>
            <input id={`cat-${c.id}`} className="input" style={{ flex: "1 1 200px", width: "auto" }} maxLength={200} value={c.nome} onChange={(e) => update(i, { nome: e.target.value })} />
            <button
              type="button"
              className="btn btn-small btn-ghost danger-text"
              disabled={counts(c.id) > 0}
              title={counts(c.id) > 0 ? "Contiene delle voci" : undefined}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              {counts(c.id) > 0 ? `Contiene ${counts(c.id)} voci` : "Elimina categoria"}
            </button>
          </div>
          <ul className="plain-list" style={{ marginTop: 8 }}>
            {c.campi.map((f, k) => (
              <li key={f.id} className="row">
                <label htmlFor={`f-${c.id}-${f.id}`} className="sr-only">
                  Nome del campo
                </label>
                <input
                  id={`f-${c.id}-${f.id}`}
                  className="input"
                  style={{ flex: "1 1 200px", width: "auto" }}
                  maxLength={200}
                  value={f.nome}
                  onChange={(e) => update(i, { campi: c.campi.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)) })}
                />
                <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => update(i, { campi: c.campi.filter((_, j) => j !== k) })}>
                  Togli campo
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              const nome = "Nuovo campo";
              update(i, { campi: [...c.campi, { id: uniqueSlug(slugify(nome), c.campi.map((f) => f.id)), nome }] });
            }}
          >
            + Campo
          </button>
          {!original.has(c.id) && <span className="hint"> Nuova categoria, non ancora salvata.</span>}
        </fieldset>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const nome = newCat.trim();
          if (!nome) return;
          setItems([...items, { id: uniqueSlug(slugify(nome), items.map((c) => c.id)), nome, campi: [] }]);
          setNewCat("");
        }}
      >
        <label htmlFor="new-cat" className="sr-only">
          Nome della nuova categoria
        </label>
        <input id="new-cat" className="input" style={{ flex: "1 1 220px", width: "auto" }} maxLength={200} placeholder="Nuova categoria (es. Creature)" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button type="submit" className="btn btn-small" disabled={!newCat.trim()}>
          Aggiungi categoria
        </button>
      </form>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Annulla
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || items.length === 0}>
          {busy ? "Salvo…" : "Salva categorie"}
        </button>
      </div>
    </div>
  );
}
