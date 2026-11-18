"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { FONTS, PAGE_FORMATS, type FontName, type PageFormat, type PdfTemplate } from "@/lib/export/template";

/**
 * Editor di un template PDF. Modifica una copia: `onSave(template, comeNuovo)`
 * salva sul template stesso (se è dell'autore) oppure come nuovo template.
 */
export default function TemplateEditor({
  template,
  editable,
  onSave,
  onCancel,
}: {
  template: PdfTemplate;
  /** false per i predefiniti: si può solo salvare come nuovo. */
  editable: boolean;
  onSave: (t: PdfTemplate, asNew: boolean) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [t, setT] = useState<PdfTemplate>(() => structuredClone(template));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof PdfTemplate>(key: K, value: PdfTemplate[K]) => setT((cur) => ({ ...cur, [key]: value }));
  const setIn = <K extends "pagina" | "margini" | "testo" | "capitoli">(key: K, patch: Partial<PdfTemplate[K]>) =>
    setT((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));

  async function save(asNew: boolean) {
    setBusy(true);
    setError("");
    const failure = await onSave({ ...t, nome: t.nome.trim() }, asNew);
    if (failure) setError(failure);
    setBusy(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(!editable);
  }

  const number = (id: string, label: string, value: number, onChange: (n: number) => void, opts: { min: number; max: number; step: number; unit: string }) => (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="muted">({opts.unit})</span>
      </label>
      <input id={id} className="input" type="number" min={opts.min} max={opts.max} step={opts.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, hint?: ReactNode) => (
    <label className="row small" style={{ gap: 6, alignItems: "flex-start" }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        {label}
        {hint && <span className="muted"> — {hint}</span>}
      </span>
    </label>
  );

  return (
    <form className="stack" onSubmit={submit} aria-label="Template di impaginazione">
      <div className="field">
        <label htmlFor="tp-nome">Nome del template</label>
        <input id="tp-nome" className="input" required maxLength={200} value={t.nome} onChange={(e) => set("nome", e.target.value)} />
      </div>

      <fieldset className="fieldset">
        <legend>Pagina e margini</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tp-formato">Formato</label>
            <select
              id="tp-formato"
              className="select"
              value={t.pagina.formato}
              onChange={(e) => {
                const formato = e.target.value as PageFormat;
                const size = formato === "personalizzato" ? t.pagina : PAGE_FORMATS[formato];
                setIn("pagina", { formato, larghezza: size.larghezza, altezza: size.altezza });
              }}
            >
              {(Object.keys(PAGE_FORMATS) as PageFormat[]).map((f) => (
                <option key={f} value={f}>
                  {PAGE_FORMATS[f].nome}
                </option>
              ))}
            </select>
          </div>
          {t.pagina.formato === "personalizzato" && (
            <>
              {number("tp-w", "Larghezza", t.pagina.larghezza, (n) => setIn("pagina", { larghezza: n }), { min: 50, max: 500, step: 1, unit: "mm" })}
              {number("tp-h", "Altezza", t.pagina.altezza, (n) => setIn("pagina", { altezza: n }), { min: 50, max: 500, step: 1, unit: "mm" })}
            </>
          )}
        </div>
        <div className="form-grid">
          {number("tp-mt", "Margine alto", t.margini.alto, (n) => setIn("margini", { alto: n }), { min: 0, max: 80, step: 1, unit: "mm" })}
          {number("tp-mb", "Margine basso", t.margini.basso, (n) => setIn("margini", { basso: n }), { min: 0, max: 80, step: 1, unit: "mm" })}
          {number("tp-mi", "Interno (rilegatura)", t.margini.interno, (n) => setIn("margini", { interno: n }), { min: 0, max: 80, step: 1, unit: "mm" })}
          {number("tp-me", "Esterno", t.margini.esterno, (n) => setIn("margini", { esterno: n }), { min: 0, max: 80, step: 1, unit: "mm" })}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Testo</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tp-font">Carattere</label>
            <select id="tp-font" className="select" value={t.testo.font} onChange={(e) => setIn("testo", { font: e.target.value as FontName })}>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          {number("tp-corpo", "Corpo", t.testo.corpo, (n) => setIn("testo", { corpo: n }), { min: 6, max: 24, step: 0.5, unit: "pt" })}
          {number("tp-interlinea", "Interlinea", t.testo.interlinea, (n) => setIn("testo", { interlinea: n }), { min: 0.8, max: 3, step: 0.05, unit: "×" })}
          {number("tp-rientro", "Rientro prima riga", t.testo.rientro, (n) => setIn("testo", { rientro: n }), { min: 0, max: 30, step: 0.5, unit: "mm" })}
          {number("tp-spazio", "Spazio tra paragrafi", t.testo.spazioParagrafi, (n) => setIn("testo", { spazioParagrafi: n }), { min: 0, max: 30, step: 1, unit: "pt" })}
        </div>
        {check("Testo giustificato", t.testo.giustificato, (v) => setIn("testo", { giustificato: v }))}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Titoli dei capitoli</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tp-align">Allineamento</label>
            <select id="tp-align" className="select" value={t.capitoli.allineamento} onChange={(e) => setIn("capitoli", { allineamento: e.target.value as "centro" | "sinistra" })}>
              <option value="centro">Centrato</option>
              <option value="sinistra">A sinistra</option>
            </select>
          </div>
          {number("tp-tcorpo", "Corpo del titolo", t.capitoli.corpo, (n) => setIn("capitoli", { corpo: n }), { min: 8, max: 48, step: 1, unit: "pt" })}
          {number("tp-tsopra", "Spazio sopra", t.capitoli.spazioSopra, (n) => setIn("capitoli", { spazioSopra: n }), { min: 0, max: 150, step: 1, unit: "mm" })}
        </div>
        {check("Inizia sempre a destra", t.capitoli.aDestra, (v) => setIn("capitoli", { aDestra: v }), "aggiunge una pagina bianca quando serve")}
        {check("Mostra «Capitolo N»", t.capitoli.numero, (v) => setIn("capitoli", { numero: v }))}
        {check("Titolo in maiuscolo spaziato", t.capitoli.maiuscolo, (v) => setIn("capitoli", { maiuscolo: v }))}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Pagine</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tp-head">Intestazioni</label>
            <select id="tp-head" className="select" value={t.intestazioni} onChange={(e) => set("intestazioni", e.target.value as PdfTemplate["intestazioni"])}>
              <option value="nessuna">Nessuna</option>
              <option value="titoli">Titolo dell&apos;opera (pari) e del capitolo (dispari)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tp-num">Numeri di pagina</label>
            <select id="tp-num" className="select" value={t.numerazione} onChange={(e) => set("numerazione", e.target.value as PdfTemplate["numerazione"])}>
              <option value="centro">In basso al centro</option>
              <option value="esterno">In basso, sul lato esterno</option>
              <option value="nessuna">Nessuno</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tp-sep">Separatore di scena</label>
            <input id="tp-sep" className="input" maxLength={20} value={t.separatoreScena} onChange={(e) => set("separatoreScena", e.target.value)} placeholder="* * *" />
          </div>
        </div>
        {check("Frontespizio", t.frontespizio, (v) => set("frontespizio", v), "titolo, sottotitolo e autore")}
        {check("Indice", t.indice, (v) => set("indice", v))}
        {check("Filigrana «BOZZA»", t.filigrana, (v) => set("filigrana", v))}
      </fieldset>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
        {editable && (
          <button type="button" className="btn" onClick={() => void save(true)} disabled={busy || !t.nome.trim()}>
            Salva come nuovo
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !t.nome.trim()}>
          {busy ? "Salvo…" : editable ? "Salva template" : "Salva come nuovo template"}
        </button>
      </div>
    </form>
  );
}
