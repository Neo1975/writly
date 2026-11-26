"use client";

import { useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import type { ChapterEntry } from "@/lib/project/format";
import { SCENE_STATUSES, SCENE_STATUS_LABEL, type Scene, type SceneStatus, type StructureAct } from "@/lib/project/structure";
import type { SheetsData } from "@/lib/server/sheets";
import { CENTER_INFO, CENTERS, type Center } from "@/lib/project/entities";

/** Cosa vuol dire il registro di una scena (diverso dalla polarizzazione di un personaggio). */
export const SCENE_REGISTER: Record<Center, string> = {
  testa: "Scena di testa: riflessione, scoperta, piano, indagine; il lettore capisce.",
  cuore: "Scena di cuore: emozione, relazione, confronto fra persone; il lettore sente.",
  pancia: "Scena di pancia: azione, pericolo, istinto, corpo; il lettore trattiene il fiato.",
};

/** Editor di scena: modifica una copia, la restituisce con `onSave` (il commit avviene con «Salva struttura»). */
export default function SceneEditor({
  scene,
  isNew,
  atti,
  capitoli,
  sheets,
  onSave,
  onDelete,
  onClose,
}: {
  scene: Scene | null;
  isNew: boolean;
  atti: StructureAct[];
  capitoli: ChapterEntry[];
  sheets: SheetsData | null;
  onSave: (scene: Scene) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={!!scene} onClose={onClose} title={isNew ? "Nuova scena" : "Scena"} wide>
      {scene && (
        <SceneForm key={scene.id} scene={scene} isNew={isNew} atti={atti} capitoli={capitoli} sheets={sheets} onSave={onSave} onDelete={onDelete} onClose={onClose} />
      )}
    </Modal>
  );
}

function SceneForm({
  scene,
  isNew,
  atti,
  capitoli,
  sheets,
  onSave,
  onDelete,
  onClose,
}: {
  scene: Scene;
  isNew: boolean;
  atti: StructureAct[];
  capitoli: ChapterEntry[];
  sheets: SheetsData | null;
  onSave: (scene: Scene) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<Scene>(scene);
  const set = (patch: Partial<Scene>) => setS((cur) => ({ ...cur, ...patch }));
  const characters = sheets?.personaggi ?? [];
  const known = new Set(characters.map((c) => c.data.id));
  const povCenter = characters.find((c) => c.data.id === s.pov)?.data.polarizzazione.dominante ?? null;
  const missing = s.personaggi.filter((id) => !known.has(id));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ ...s, titolo: s.titolo.trim() });
  }

  const area = (key: "sinossi" | "obiettivo" | "conflitto" | "esito", label: string, hint?: string, rows = 2) => (
    <div className="field">
      <label htmlFor={`sc-${key}`}>{label}</label>
      <textarea id={`sc-${key}`} className="textarea" rows={rows} maxLength={key === "sinossi" ? 20000 : 4000} value={s[key]} onChange={(e) => set({ [key]: e.target.value })} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="sc-titolo">Titolo</label>
        <input id="sc-titolo" className="input" required maxLength={200} value={s.titolo} onChange={(e) => set({ titolo: e.target.value })} autoFocus />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="sc-sezione">Sezione della struttura</label>
          <select id="sc-sezione" className="select" value={s.sezione ?? ""} onChange={(e) => set({ sezione: e.target.value || null })}>
            <option value="">Non assegnata</option>
            {atti.map((a) => (
              <optgroup key={a.id} label={a.nome}>
                {a.sezioni.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-stato">Stato</label>
          <select id="sc-stato" className="select" value={s.stato} onChange={(e) => set({ stato: e.target.value as SceneStatus })}>
            {SCENE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {SCENE_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span id="sc-pol" className="label">
            Registro della scena
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="sc-pol">
            {CENTERS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={s.polarizzazione === k} onClick={() => set({ polarizzazione: s.polarizzazione === k ? undefined : k })}>
                {CENTER_INFO[k].label}
              </button>
            ))}
          </div>
          <span className="hint">
            {s.polarizzazione ? SCENE_REGISTER[s.polarizzazione] : "Facoltativo: testa (riflessione, scoperta), cuore (emozione, relazioni), pancia (azione, istinto). Un secondo clic toglie la scelta."}
            {povCenter && ` Il punto di vista è di ${CENTER_INFO[povCenter].label.toLowerCase()}.`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="sc-capitolo">Capitolo di destinazione</label>
          <select id="sc-capitolo" className="select" value={s.capitolo ?? ""} onChange={(e) => set({ capitolo: e.target.value || null })}>
            <option value="">Nessuno (non ancora scritta)</option>
            {capitoli.map((c, i) => (
              <option key={c.file} value={c.file}>
                {i + 1}. {c.titolo}
              </option>
            ))}
            {s.capitolo && !capitoli.some((c) => c.file === s.capitolo) && <option value={s.capitolo}>{s.capitolo} (non più nell&apos;opera)</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-pov">Punto di vista</label>
          <select id="sc-pov" className="select" value={s.pov ?? ""} onChange={(e) => set({ pov: e.target.value || null })}>
            <option value="">—</option>
            {characters.map((c) => (
              <option key={c.data.id} value={c.data.id}>
                {c.data.nome}
              </option>
            ))}
            {s.pov && !known.has(s.pov) && <option value={s.pov}>(scheda eliminata)</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-luogo">Luogo</label>
          <select id="sc-luogo" className="select" value={s.luogo ?? ""} onChange={(e) => set({ luogo: e.target.value || null })}>
            <option value="">—</option>
            {(sheets?.categorie.items ?? []).map((cat) => {
              const voci = sheets!.voci.filter((v) => v.categoria === cat.id);
              return voci.length ? (
                <optgroup key={cat.id} label={cat.nome}>
                  {voci.map((v) => (
                    <option key={v.data.id} value={v.data.id}>
                      {v.data.nome}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
            {s.luogo && !sheets?.voci.some((v) => v.data.id === s.luogo) && <option value={s.luogo}>(voce eliminata)</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sc-quando">Quando accade</label>
          <input id="sc-quando" className="input" maxLength={200} placeholder="es. la notte dopo il naufragio" value={s.quando} onChange={(e) => set({ quando: e.target.value })} />
        </div>
      </div>

      {area("sinossi", "Sinossi", undefined, 3)}
      <div className="form-grid">
        {area("obiettivo", "Obiettivo", "Cosa vuole il personaggio in questa scena.")}
        {area("conflitto", "Conflitto", "Cosa glielo impedisce.")}
        {area("esito", "Esito", "Come cambia la situazione alla fine.")}
      </div>

      <fieldset className="fieldset">
        <legend>Personaggi presenti</legend>
        {characters.length === 0 && <span className="small muted">Nessun personaggio: aggiungili nella sezione Personaggi.</span>}
        <div className="chips">
          {characters.map((c) => (
            <label key={c.data.id} className="chip-check">
              <input
                type="checkbox"
                checked={s.personaggi.includes(c.data.id)}
                onChange={(e) =>
                  set({ personaggi: e.target.checked ? [...s.personaggi, c.data.id] : s.personaggi.filter((id) => id !== c.data.id) })
                }
              />
              {c.data.nome}
            </label>
          ))}
          {missing.length > 0 && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => set({ personaggi: s.personaggi.filter((id) => known.has(id)) })}>
              Togli {missing.length} {missing.length === 1 ? "scheda eliminata" : "schede eliminate"}
            </button>
          )}
        </div>
      </fieldset>

      <p className="hint" style={{ margin: 0 }}>
        La scena si aggiorna nella bacheca; diventa una versione su GitHub quando premi «Salva struttura».
      </p>
      <div className="modal-actions">
        {!isNew && (
          <button
            type="button"
            className="btn btn-ghost danger-text"
            style={{ marginRight: "auto" }}
            onClick={() => window.confirm(`Eliminare la scena «${scene.titolo}»?`) && onDelete(scene.id)}
          >
            Elimina scena
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Annulla
        </button>
        <button type="submit" className="btn btn-primary" disabled={!s.titolo.trim()}>
          {isNew ? "Aggiungi scena" : "Applica"}
        </button>
      </div>
    </form>
  );
}
