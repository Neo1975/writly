"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { useApiData, useBeforeUnload } from "@/lib/client/hooks";
import type { StructureTemplate } from "@/lib/project/structure";
import { allSections, battuteFromWords, changeMeasure, measureOf } from "@/lib/project/structure";
import type { LibraryData, LibraryStructure } from "@/lib/server/structures";
import ActsEditor from "./ActsEditor";

type Selection = { kind: "predefinita" | "personale"; id: string } | { kind: "nuova" };

function cloneOf(t: StructureTemplate): StructureTemplate {
  return { ...structuredClone(t), id: "", nome: `${t.nome} (copia)`, origine: t.nome };
}

const EMPTY: StructureTemplate = {
  id: "",
  nome: "Nuova struttura",
  descrizione: "",
  origine: "",
  atti: [{ id: "atto-1", nome: "Atto 1", sezioni: [] }],
};

/** Editor delle strutture narrative: predefinite (sola lettura, clonabili) e personali. */
export default function StructureLibrary() {
  const lib = useApiData<LibraryData>("/api/strutture");
  const [selected, setSelected] = useState<Selection>({ kind: "predefinita", id: "viaggio-eroe" });
  const [draft, setDraft] = useState<StructureTemplate | null>(null);
  const [goal, setGoal] = useState(80000);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useBeforeUnload(draft !== null);

  if (lib.error) {
    return (
      <main className="page">
        <div className="notice notice-error" role="alert">
          {lib.error.message}
        </div>
      </main>
    );
  }
  const data = lib.data;
  if (!data) {
    return (
      <main className="page">
        <p className="muted">Carico le strutture…</p>
      </main>
    );
  }

  const personal = selected.kind === "personale" ? data.personali.find((p) => p.struttura.id === selected.id) : undefined;
  const builtin = selected.kind === "predefinita" ? data.predefinite.find((p) => p.id === selected.id) : undefined;
  const shown: StructureTemplate | undefined = draft ?? personal?.struttura ?? builtin;
  const editable = selected.kind !== "predefinita";

  function choose(next: Selection) {
    if (draft && !window.confirm("Ci sono modifiche non salvate a questa struttura. Abbandonarle?")) return;
    setDraft(next.kind === "nuova" ? structuredClone(EMPTY) : null);
    setSelected(next);
    setNotice(null);
  }

  function startClone(t: StructureTemplate) {
    if (draft && !window.confirm("Ci sono modifiche non salvate a questa struttura. Abbandonarle?")) return;
    setSelected({ kind: "nuova" });
    setDraft(cloneOf(t));
    setNotice({ kind: "ok", text: `Copia di «${t.nome}» pronta: modificala e salvala nelle tue strutture.` });
  }

  function edit(patch: Partial<StructureTemplate>) {
    if (!shown) return;
    setDraft({ ...shown, ...patch });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<LibraryStructure>("/api/strutture", {
        method: "POST",
        json: { azione: "salva", id: personal?.struttura.id, sha: personal?.sha, struttura: draft },
      });
      const others = data!.personali.filter((p) => p.struttura.id !== res.struttura.id);
      lib.set({ ...data!, exists: true, personali: [...others, res].sort((a, b) => a.struttura.nome.localeCompare(b.struttura.nome, "it")) });
      setDraft(null);
      setSelected({ kind: "personale", id: res.struttura.id });
      setNotice({ kind: "ok", text: `Struttura «${res.struttura.nome}» salvata in ${data!.owner}/${data!.repo}.` });
    } catch (err) {
      const e = err as ClientApiError;
      setNotice({ kind: "error", text: e.status === 409 ? "La struttura è cambiata su GitHub nel frattempo: ricarica la pagina." : e.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!personal || !window.confirm(`Eliminare la struttura «${personal.struttura.nome}»? Le opere che la usano non cambiano: ne hanno una copia.`)) return;
    setBusy(true);
    try {
      await api("/api/strutture", { method: "POST", json: { azione: "elimina", id: personal.struttura.id, sha: personal.sha } });
      lib.set({ ...data!, personali: data!.personali.filter((p) => p !== personal) });
      setDraft(null);
      setSelected({ kind: "predefinita", id: "viaggio-eroe" });
      setNotice({ kind: "ok", text: "Struttura eliminata." });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const isSel = (kind: string, id: string) => selected.kind === kind && "id" in selected && selected.id === id;

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <Link href="/" className="small">
            ← Libreria
          </Link>
          <h1>Strutture narrative</h1>
          <div className="small muted">
            Le predefinite sono in sola lettura: clonale per personalizzarle. Le tue strutture sono file YAML nel repository privato{" "}
            <code>
              {data.owner}/{data.repo}
            </code>
            {data.exists ? "" : " (lo creo al primo salvataggio)"}.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => choose({ kind: "nuova" })}>
          Nuova da zero
        </button>
      </div>

      {data.errori.map((e) => (
        <div key={e.path} className="notice notice-warn" role="alert">
          Non riesco a leggere {e.path}: {e.message}
        </div>
      ))}

      <div className="split">
        <nav className="side-list" aria-label="Strutture">
          <div className="side-label">Predefinite</div>
          {data.predefinite.map((t) => (
            <button key={t.id} type="button" className="side-item" aria-current={isSel("predefinita", t.id) || undefined} onClick={() => choose({ kind: "predefinita", id: t.id })}>
              <span>{t.nome}</span>
              <span className="small muted">{allSections(t.atti).length} sezioni</span>
            </button>
          ))}
          <div className="side-label">Le mie strutture</div>
          {data.personali.length === 0 && <div className="small muted" style={{ padding: "4px 10px" }}>Nessuna: clona una predefinita o creane una.</div>}
          {data.personali.map((p) => (
            <button
              key={p.struttura.id}
              type="button"
              className="side-item"
              aria-current={isSel("personale", p.struttura.id) || undefined}
              onClick={() => choose({ kind: "personale", id: p.struttura.id })}
            >
              <span>{p.struttura.nome}</span>
              <span className="small muted">{p.struttura.origine ? `clonata da ${p.struttura.origine}` : `${allSections(p.struttura.atti).length} sezioni`}</span>
            </button>
          ))}
          {selected.kind === "nuova" && (
            <div className="side-item" aria-current>
              <span>{draft?.nome || "Nuova struttura"}</span>
              <span className="small muted">non ancora salvata</span>
            </div>
          )}
        </nav>

        {shown && (
          <section className="card stack" aria-label={`Struttura ${shown.nome}`}>
            {notice && (
              <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
                {notice.text}
              </div>
            )}
            {editable ? (
              <>
                <div className="field">
                  <label htmlFor="st-nome">Nome</label>
                  <input id="st-nome" className="input" maxLength={200} value={shown.nome} onChange={(e) => edit({ nome: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="st-desc">Descrizione</label>
                  <textarea id="st-desc" className="textarea" rows={2} maxLength={4000} value={shown.descrizione} onChange={(e) => edit({ descrizione: e.target.value })} />
                  {shown.origine && <span className="hint">Clonata da «{shown.origine}».</span>}
                </div>
              </>
            ) : (
              <div>
                <h2 className="serif" style={{ margin: "0 0 4px" }}>
                  {shown.nome} <span className="badge">Predefinita</span>
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  {shown.descrizione}
                </p>
              </div>
            )}

            {measureOf(shown) === "percentuale" && <div className="row">
              <label htmlFor="st-goal" className="small">
                Anteprima su un libro di
              </label>
              <input
                id="st-goal"
                type="number"
                className="input"
                style={{ width: 120 }}
                min={1000}
                step={1000}
                value={goal}
                onChange={(e) => setGoal(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="small">parole</span>
            </div>}

            <ActsEditor
              atti={shown.atti}
              misura={measureOf(shown)}
              onMeasure={(m) => {
                const next = changeMeasure(shown, m, battuteFromWords(goal));
                edit({ misura: next.misura, atti: next.atti });
              }}
              goal={goal}
              readOnly={!editable}
              onChange={(atti) => edit({ atti })}
            />

            <div className="row sticky-actions">
              {editable && (
                <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !draft}>
                  {busy ? "Salvo su GitHub…" : selected.kind === "nuova" ? "Salva nelle mie strutture" : "Salva modifiche"}
                </button>
              )}
              {editable && draft && selected.kind === "personale" && (
                <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>
                  Annulla modifiche
                </button>
              )}
              {selected.kind !== "nuova" && (
                <button type="button" className="btn" onClick={() => startClone(shown)} disabled={busy}>
                  Clona
                </button>
              )}
              {personal && (
                <button type="button" className="btn btn-ghost danger-text" onClick={remove} disabled={busy}>
                  Elimina
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
