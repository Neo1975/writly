"use client";

import { shortId } from "@/lib/project/slug";
import { useState } from "react";
import {
  MAX_SECTION_BATTUTE,
  moveItem,
  rebalance,
  scaleBattute,
  totalBattute,
  totalWeight,
  wordTargets,
  type Measure,
  type StructureAct,
  type StructureSection,
} from "@/lib/project/structure";
import { formatCount } from "@/lib/text/stats";

/**
 * Editor di atti e sezioni (nome, guida, peso o battute), usato sia per le
 * strutture di libreria sia per la struttura di un'opera. Le sezioni si misurano
 * in percentuale del libro oppure in battute esatte (con spazi), a scelta.
 * Con `readOnly` mostra solo l'anteprima.
 */
export default function ActsEditor({
  atti,
  onChange,
  misura = "percentuale",
  onMeasure,
  goal,
  readOnly = false,
  countFor,
}: {
  atti: StructureAct[];
  onChange?: (atti: StructureAct[]) => void;
  misura?: Measure;
  /** Cambio di misura: lo fa il genitore, che conosce l'obiettivo da cui partire. */
  onMeasure?: (misura: Measure) => void;
  /** Obiettivo di parole del libro, per la stima per sezione (solo in percentuale). */
  goal?: number;
  readOnly?: boolean;
  /** Scene presenti in una sezione (solo per le opere): avvisa prima di eliminarla. */
  countFor?: (sectionId: string) => number;
}) {
  const byBattute = misura === "battute";
  const total = totalWeight(atti);
  const sumBattute = totalBattute(atti);
  const [distribute, setDistribute] = useState("");
  const targets = goal && !byBattute ? wordTargets(atti, goal) : null;
  const size = (s: StructureSection) => (byBattute ? (s.battute ?? 0) : s.peso);
  const sizeLabel = (n: number) => (byBattute ? `${formatCount(n)} battute` : `${Math.round(n * 10) / 10}%`);
  const edit = (next: StructureAct[]) => onChange?.(next);

  const updateAct = (i: number, patch: Partial<StructureAct>) => edit(atti.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const updateSection = (i: number, k: number, patch: Partial<StructureSection>) =>
    updateAct(i, { sezioni: atti[i].sezioni.map((s, j) => (j === k ? { ...s, ...patch } : s)) });

  function removeSection(i: number, k: number) {
    const s = atti[i].sezioni[k];
    const n = countFor?.(s.id) ?? 0;
    if (n > 0 && !window.confirm(`«${s.nome}» contiene ${n} ${n === 1 ? "scena" : "scene"}: andranno in «Non assegnate». Eliminare la sezione?`)) return;
    updateAct(i, { sezioni: atti[i].sezioni.filter((_, j) => j !== k) });
  }

  function removeAct(i: number) {
    const a = atti[i];
    const n = a.sezioni.reduce((sum, s) => sum + (countFor?.(s.id) ?? 0), 0);
    const msg = n > 0 ? `L'atto «${a.nome}» ha ${n} scene: andranno in «Non assegnate». Eliminarlo?` : `Eliminare l'atto «${a.nome}» e le sue sezioni?`;
    if (a.sezioni.length > 0 && !window.confirm(msg)) return;
    edit(atti.filter((_, j) => j !== i));
  }

  /** Sposta una sezione all'atto precedente o successivo (in coda o in testa). */
  function shiftSection(i: number, k: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= atti.length) return;
    const s = atti[i].sezioni[k];
    edit(
      atti.map((a, j) => {
        if (j === i) return { ...a, sezioni: a.sezioni.filter((_, x) => x !== k) };
        if (j === target) return { ...a, sezioni: dir === 1 ? [s, ...a.sezioni] : [...a.sezioni, s] };
        return a;
      }),
    );
  }

  return (
    <div className="acts">
      {!readOnly && onMeasure && (
        <div className="row small" style={{ gap: 8 }}>
          <span id="misura-label">Misura delle sezioni</span>
          <div className="segmented" role="radiogroup" aria-labelledby="misura-label">
            <button type="button" role="radio" aria-checked={!byBattute} onClick={() => onMeasure("percentuale")}>
              Percentuale
            </button>
            <button type="button" role="radio" aria-checked={byBattute} onClick={() => onMeasure("battute")}>
              Battute esatte
            </button>
          </div>
          <span className="muted">{byBattute ? "Ogni sezione ha la sua lunghezza precisa, in battute con spazi." : "Ogni sezione pesa una parte del libro; le parole sono una stima."}</span>
        </div>
      )}
      <div className="weights">
        <div className="weight-bar" aria-hidden="true">
          {atti.flatMap((a, i) =>
            a.sezioni.map((s) => (
              <span
                key={s.id}
                className={`weight-seg act-${i % 4}`}
                style={{ flexGrow: Math.max(size(s), 0.0001) }}
                title={`${s.nome}: ${sizeLabel(size(s))}`}
              />
            )),
          )}
        </div>
        {byBattute ? (
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <span role="status">
              Totale: <strong>{formatCount(sumBattute)}</strong> battute con spazi (la somma delle sezioni)
            </span>
            {!readOnly && (
              <form
                className="row"
                style={{ gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Math.round(Number(distribute));
                  if (n > 0) {
                    edit(scaleBattute(atti, n));
                    setDistribute("");
                  }
                }}
              >
                <label htmlFor="distribuisci">Porta il totale a</label>
                <input
                  id="distribuisci"
                  className="input"
                  style={{ width: 110, minHeight: 32 }}
                  type="number"
                  min={1}
                  step={1}
                  placeholder={String(sumBattute || 10000)}
                  value={distribute}
                  onChange={(e) => setDistribute(e.target.value)}
                />
                <button type="submit" className="btn btn-small" disabled={!(Number(distribute) > 0)}>
                  Distribuisci
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <span className={total === 100 ? "muted" : "warn-text"} role={total === 100 ? undefined : "status"}>
              Totale pesi: {total}%{total !== 100 && " · dovrebbe essere 100%"}
            </span>
            {!readOnly && (
              <button type="button" className="btn btn-small" onClick={() => edit(rebalance(atti))} disabled={total === 100}>
                Ribilancia a 100%
              </button>
            )}
          </div>
        )}
      </div>

      {atti.map((a, i) => (
        <section key={a.id} className={`act act-border-${i % 4}`} aria-label={a.nome}>
          <div className="act-head">
            {readOnly ? (
              <h3>{a.nome}</h3>
            ) : (
              <>
                <label className="sr-only" htmlFor={`act-${a.id}`}>
                  Nome dell&apos;atto
                </label>
                <input
                  id={`act-${a.id}`}
                  className="input act-name"
                  value={a.nome}
                  maxLength={200}
                  onChange={(e) => updateAct(i, { nome: e.target.value })}
                />
                <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta su ${a.nome}`} onClick={() => edit(moveItem(atti, i, i - 1))} disabled={i === 0}>
                  ↑
                </button>
                <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta giù ${a.nome}`} onClick={() => edit(moveItem(atti, i, i + 1))} disabled={i === atti.length - 1}>
                  ↓
                </button>
                <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => removeAct(i)}>
                  Elimina atto
                </button>
              </>
            )}
            <span className="small muted">{sizeLabel(a.sezioni.reduce((sum, x) => sum + size(x), 0))}</span>
          </div>

          <ol className="sections">
            {a.sezioni.map((s, k) => (
              <li key={s.id} className="section-row">
                {readOnly ? (
                  <div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{s.nome}</strong>
                      <span className="small muted">
                        {sizeLabel(size(s))}
                        {targets ? ` · ≈ ${formatCount(targets.get(s.id) ?? 0)} parole` : ""}
                      </span>
                    </div>
                    {s.guida && <div className="small muted">{s.guida}</div>}
                  </div>
                ) : (
                  <>
                    <div className="section-fields">
                      <label className="sr-only" htmlFor={`sn-${s.id}`}>
                        Nome della sezione
                      </label>
                      <input id={`sn-${s.id}`} className="input" value={s.nome} maxLength={200} onChange={(e) => updateSection(i, k, { nome: e.target.value })} />
                      {byBattute ? (
                        <label className="peso peso-battute">
                          <span className="sr-only">Battute di {s.nome}</span>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            max={MAX_SECTION_BATTUTE}
                            step={1}
                            value={s.battute ?? 0}
                            onChange={(e) => updateSection(i, k, { battute: Math.min(MAX_SECTION_BATTUTE, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                          />
                          <span aria-hidden="true">battute</span>
                        </label>
                      ) : (
                        <label className="peso">
                          <span className="sr-only">Peso di {s.nome} in percentuale</span>
                          <input
                            type="number"
                            className="input"
                            min={0}
                            max={100}
                            step={0.5}
                            value={s.peso}
                            onChange={(e) => updateSection(i, k, { peso: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                          />
                          <span aria-hidden="true">%</span>
                        </label>
                      )}
                    </div>
                    <label className="sr-only" htmlFor={`sg-${s.id}`}>
                      Guida della sezione {s.nome}
                    </label>
                    <textarea
                      id={`sg-${s.id}`}
                      className="textarea section-guide"
                      rows={2}
                      maxLength={4000}
                      placeholder="Guida: cosa succede in questa sezione"
                      value={s.guida}
                      onChange={(e) => updateSection(i, k, { guida: e.target.value })}
                    />
                    <div className="row small">
                      {targets && <span className="muted">≈ {formatCount(targets.get(s.id) ?? 0)} parole</span>}
                      <span style={{ flex: 1 }} />
                      <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta su ${s.nome}`} onClick={() => updateAct(i, { sezioni: moveItem(a.sezioni, k, k - 1) })} disabled={k === 0}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-small btn-ghost" aria-label={`Sposta giù ${s.nome}`} onClick={() => updateAct(i, { sezioni: moveItem(a.sezioni, k, k + 1) })} disabled={k === a.sezioni.length - 1}>
                        ↓
                      </button>
                      {i > 0 && (
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => shiftSection(i, k, -1)}>
                          ← Atto prec.
                        </button>
                      )}
                      {i < atti.length - 1 && (
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => shiftSection(i, k, 1)}>
                          Atto succ. →
                        </button>
                      )}
                      <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => removeSection(i, k)}>
                        Elimina
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
          {!readOnly && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => updateAct(i, { sezioni: [...a.sezioni, { id: shortId(), nome: "Nuova sezione", guida: "", peso: 0, ...(byBattute ? { battute: 0 } : {}) }] })}
            >
              + Sezione
            </button>
          )}
        </section>
      ))}

      {!readOnly && (
        <button type="button" className="btn" onClick={() => edit([...atti, { id: shortId(), nome: `Atto ${atti.length + 1}`, sezioni: [] }])}>
          + Atto
        </button>
      )}
    </div>
  );
}
