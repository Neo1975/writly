"use client";

import { useState, type FormEvent } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { GLOSSARY_CATEGORIES, fold, type GlossaryTerm } from "@/lib/project/notes";
import { shortId } from "@/lib/project/slug";
import type { SheetsData } from "@/lib/server/sheets";

const EMPTY = (): GlossaryTerm => ({ id: shortId(), termine: "", definizione: "", categoria: "", note: "" });

/** Glossario del progetto: i termini sono accettati dal controllo ortografico. Ogni modifica è un commit. */
export default function GlossaryPanel({ base, data, onData }: { base: string; data: SheetsData; onData: (d: SheetsData) => void }) {
  const terms = data.glossario.items;
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(items: GlossaryTerm[], okText: string): Promise<boolean> {
    try {
      const res = await api<{ sha: string; items: GlossaryTerm[] }>(`${base}/schede`, {
        method: "POST",
        json: { azione: "glossario", sha: data.glossario.sha, items },
      });
      onData({ ...data, glossario: res });
      setNotice({ kind: "ok", text: okText });
      return true;
    } catch (err) {
      const e = err as ClientApiError;
      setNotice({ kind: "error", text: e.status === 409 ? "Il glossario è cambiato su GitHub nel frattempo: ricarica la pagina." : e.message });
      return false;
    }
  }

  const f = fold(filter.trim());
  const shown = f ? terms.filter((t) => fold(`${t.termine} ${t.definizione} ${t.categoria}`).includes(f)) : terms;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0 }}>
          Termini, lingue inventate, gergo: entrano nel dizionario del controllo ortografico di questo progetto.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(EMPTY())}>
          Nuovo termine
        </button>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}
      {editing && (
        <TermForm
          key={editing.id}
          term={editing}
          isNew={!terms.some((t) => t.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={async (t) => {
            if (terms.some((x) => x.id !== t.id && fold(x.termine) === fold(t.termine))) {
              setNotice({ kind: "error", text: `«${t.termine}» è già nel glossario.` });
              return;
            }
            const exists = terms.some((x) => x.id === t.id);
            if (await save(exists ? terms.map((x) => (x.id === t.id ? t : x)) : [...terms, t], `«${t.termine}» salvato nel glossario.`)) setEditing(null);
          }}
        />
      )}
      {terms.length > 5 && (
        <>
          <label htmlFor="gl-filter" className="sr-only">
            Filtra il glossario
          </label>
          <input id="gl-filter" className="input" type="search" placeholder="Filtra" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
        </>
      )}
      <section className="card table-card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Termine</th>
                <th scope="col">Definizione</th>
                <th scope="col">Categoria</th>
                <th scope="col">Note d&apos;uso</th>
                <th scope="col">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {terms.length ? "Nessun termine corrisponde." : "Il glossario è vuoto."}
                  </td>
                </tr>
              )}
              {shown.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="serif">
                    {t.termine}
                  </th>
                  <td>{t.definizione || "—"}</td>
                  <td>{t.categoria || "—"}</td>
                  <td>{t.note || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(t)}>
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost danger-text"
                      onClick={() => window.confirm(`Togliere «${t.termine}» dal glossario?`) && void save(terms.filter((x) => x.id !== t.id), `«${t.termine}» tolto dal glossario.`)}
                    >
                      Togli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TermForm({ term, isNew, onSave, onCancel }: { term: GlossaryTerm; isNew: boolean; onSave: (t: GlossaryTerm) => Promise<void>; onCancel: () => void }) {
  const [t, setT] = useState(term);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...t, termine: t.termine.trim() });
    setBusy(false);
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label={isNew ? "Nuovo termine" : `Termine ${term.termine}`}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="gl-termine">Termine</label>
          <input id="gl-termine" className="input" required maxLength={200} value={t.termine} onChange={(e) => setT({ ...t, termine: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="gl-cat">Categoria</label>
          <input id="gl-cat" className="input" list="gl-cats" maxLength={200} value={t.categoria} onChange={(e) => setT({ ...t, categoria: e.target.value })} />
          <datalist id="gl-cats">
            {GLOSSARY_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="field">
        <label htmlFor="gl-def">Definizione</label>
        <textarea id="gl-def" className="textarea" rows={2} maxLength={4000} value={t.definizione} onChange={(e) => setT({ ...t, definizione: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="gl-note">Note d&apos;uso</label>
        <input id="gl-note" className="input" maxLength={4000} value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || !t.termine.trim()}>
          {busy ? "Salvo…" : isNew ? "Aggiungi al glossario" : "Salva termine"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
    </form>
  );
}
