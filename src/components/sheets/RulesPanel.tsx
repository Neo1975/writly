"use client";

import { useState, type FormEvent } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { shortId } from "@/lib/project/slug";
import type { WorldRule } from "@/lib/project/world";
import type { SheetsData } from "@/lib/server/sheets";

/**
 * Regole del mondo: vincoli dichiarati e collegati alle voci. Nell'editor del
 * capitolo compaiono come promemoria quando una voce collegata è citata o è il
 * luogo di una scena del capitolo.
 */
export default function RulesPanel({
  base,
  data,
  onData,
  onOpenEntry,
}: {
  base: string;
  data: SheetsData;
  onData: (d: SheetsData) => void;
  onOpenEntry: (id: string) => void;
}) {
  const rules = data.regole.items;
  const [editing, setEditing] = useState<WorldRule | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(items: WorldRule[], okText: string): Promise<boolean> {
    try {
      const res = await api<{ sha: string; items: WorldRule[] }>(`${base}/schede`, {
        method: "POST",
        json: { azione: "regole", sha: data.regole.sha, items },
      });
      onData({ ...data, regole: res });
      setNotice({ kind: "ok", text: okText });
      return true;
    } catch (err) {
      const e = err as ClientApiError;
      setNotice({ kind: "error", text: e.status === 409 ? "Le regole sono cambiate su GitHub nel frattempo: ricarica la pagina." : e.message });
      return false;
    }
  }

  const name = (id: string) => data.voci.find((v) => v.data.id === id)?.data.nome ?? "(voce eliminata)";

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="small muted" style={{ margin: 0 }}>
          Vincoli del mondo («da Vael alla Torre servono 3 giorni di nave»). Compaiono come promemoria nel capitolo quando una voce collegata è in scena.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: shortId(), testo: "", voci: [], note: "" })}>
          Nuova regola
        </button>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {editing && (
        <RuleForm
          key={editing.id}
          rule={editing}
          data={data}
          isNew={!rules.some((r) => r.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={async (r) => {
            const exists = rules.some((x) => x.id === r.id);
            if (await save(exists ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r], "Regola salvata su GitHub.")) setEditing(null);
          }}
        />
      )}

      {rules.length === 0 && !editing && <section className="card muted">Nessuna regola ancora.</section>}
      {rules.length > 0 && (
        <ul className="rule-list">
          {rules.map((r) => (
            <li key={r.id} className="card rule">
              <div className="rule-text">{r.testo}</div>
              {r.note && <div className="small muted">{r.note}</div>}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="chips">
                  {r.voci.length === 0 && <span className="small muted">Non collegata a voci: non comparirà come promemoria.</span>}
                  {r.voci.map((id) => (
                    <button key={id} type="button" className="chip" onClick={() => onOpenEntry(id)}>
                      {name(id)}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button type="button" className="btn btn-small" onClick={() => setEditing(r)}>
                    Modifica
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost danger-text"
                    onClick={() => window.confirm("Eliminare questa regola?") && void save(rules.filter((x) => x.id !== r.id), "Regola eliminata.")}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleForm({
  rule,
  data,
  isNew,
  onSave,
  onCancel,
}: {
  rule: WorldRule;
  data: SheetsData;
  isNew: boolean;
  onSave: (r: WorldRule) => Promise<void>;
  onCancel: () => void;
}) {
  const [r, setR] = useState(rule);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ ...r, testo: r.testo.trim(), note: r.note.trim() });
    setBusy(false);
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label={isNew ? "Nuova regola" : "Modifica regola"}>
      <div className="field">
        <label htmlFor="rule-text">Regola</label>
        <textarea id="rule-text" className="textarea" rows={2} required maxLength={4000} value={r.testo} onChange={(e) => setR({ ...r, testo: e.target.value })} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="rule-note">Note</label>
        <input id="rule-note" className="input" maxLength={4000} value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} />
      </div>
      <fieldset className="fieldset">
        <legend>Si applica a</legend>
        {data.voci.length === 0 && <span className="small muted">Crea prima qualche voce del mondo.</span>}
        <div className="chips">
          {data.voci.map((v) => (
            <label key={v.data.id} className="chip-check">
              <input
                type="checkbox"
                checked={r.voci.includes(v.data.id)}
                onChange={(e) => setR({ ...r, voci: e.target.checked ? [...r.voci, v.data.id] : r.voci.filter((x) => x !== v.data.id) })}
              />
              {v.data.nome}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || !r.testo.trim()}>
          {busy ? "Salvo…" : isNew ? "Aggiungi regola" : "Salva regola"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      </div>
    </form>
  );
}
