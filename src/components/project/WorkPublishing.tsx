"use client";

import { useState, type FormEvent } from "react";
import type { WorkSummary } from "@/lib/server/projects";

/**
 * Impostazioni di pubblicazione a puntate di un'opera: lunghezza voluta dei capitoli
 * (l'editor e la panoramica avvisano quando se ne esce) e note fisse in testa e in coda
 * ai capitoli esportati per le piattaforme.
 */
export default function WorkPublishing({ work, busy, defaultOpen, onSave }: { work: WorkSummary; busy: boolean; defaultOpen: boolean; onSave: (json: Record<string, unknown>) => Promise<boolean> }) {
  const [min, setMin] = useState(work.paroleCapitolo ? String(work.paroleCapitolo.min) : "");
  const [max, setMax] = useState(work.paroleCapitolo ? String(work.paroleCapitolo.max) : "");
  const [iniziale, setIniziale] = useState(work.notaIniziale ?? "");
  const [finale, setFinale] = useState(work.notaFinale ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    const lo = min.trim() === "" ? null : Number(min);
    const hi = max.trim() === "" ? null : Number(max);
    if ((lo === null) !== (hi === null)) {
      setError("Indica sia il minimo sia il massimo, oppure lasciali vuoti.");
      return;
    }
    if (lo !== null && hi !== null && (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo)) {
      setError("Il minimo e il massimo sono numeri interi di parole, con il massimo non inferiore al minimo.");
      return;
    }
    const ok = await onSave({ azione: "impostazioni-opera", opera: work.slug, paroleCapitolo: lo !== null && hi !== null ? { min: lo, max: hi } : null, notaIniziale: iniziale, notaFinale: finale });
    setSaved(ok);
  }

  return (
    <details open={defaultOpen}>
      <summary className="small" style={{ fontWeight: 600, cursor: "pointer" }}>
        Pubblicazione a puntate
      </summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 10 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Per chi pubblica un capitolo alla volta (Royal Road, Wattpad, Webnovel…): la lunghezza voluta di un capitolo e le note da mettere in testa e in coda quando lo esporti per incollarlo.
        </p>
        <fieldset className="fieldset">
          <legend>Parole per capitolo</legend>
          <div className="row">
            <label htmlFor={`min-${work.slug}`} className="small">
              Da
            </label>
            <input id={`min-${work.slug}`} className="input" style={{ width: 110 }} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="1500" />
            <label htmlFor={`max-${work.slug}`} className="small">
              a
            </label>
            <input id={`max-${work.slug}`} className="input" style={{ width: 110 }} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder="3000" />
            <span className="small muted">parole (vuoti = nessun obiettivo)</span>
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`ni-${work.slug}`}>Nota iniziale</label>
          <textarea id={`ni-${work.slug}`} className="textarea" rows={2} maxLength={2000} value={iniziale} onChange={(e) => setIniziale(e.target.value)} placeholder="Per esempio: «Buona lettura! I capitoli escono il martedì e il venerdì.»" />
        </div>
        <div className="field">
          <label htmlFor={`nf-${work.slug}`}>Nota finale</label>
          <textarea id={`nf-${work.slug}`} className="textarea" rows={2} maxLength={2000} value={finale} onChange={(e) => setFinale(e.target.value)} placeholder="Per esempio: «Grazie di aver letto! Un commento fa sempre piacere.»" />
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
            Salva
          </button>
          {saved && (
            <span className="small" role="status">
              Salvato su GitHub.
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
