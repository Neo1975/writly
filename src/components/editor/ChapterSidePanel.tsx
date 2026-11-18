"use client";

import Link from "next/link";
import { CHARACTER_GROUPS } from "@/lib/project/entities";
import { SCENE_STATUS_LABEL, type Scene } from "@/lib/project/structure";
import type { WorldRule } from "@/lib/project/world";
import type { SheetsData } from "@/lib/server/sheets";
import { formatCount } from "@/lib/text/stats";
import type { ChecksReport, StylePrefs } from "./ChapterEditor";

const STYLE_CHECKS: { key: keyof StylePrefs; kind: keyof ChecksReport["counts"]; label: string }[] = [
  { key: "ripetizioni", kind: "ripetizione", label: "Ripetizioni ravvicinate" },
  { key: "frasiLunghe", kind: "frase-lunga", label: "Frasi molto lunghe" },
  { key: "avverbi", kind: "avverbio", label: "Avverbi in -mente" },
];

export interface EntitySummary {
  kind: "personaggio" | "voce";
  nome: string;
  sottotitolo: string;
  righe: [string, string][];
  href: string;
}

/** Scheda sintetica di un personaggio o di una voce del mondo (pannello e anteprima al passaggio del mouse). */
export function summarize(sheets: SheetsData, id: string, projectHref: string): EntitySummary | null {
  const c = sheets.personaggi.find((x) => x.data.id === id)?.data;
  if (c) {
    const righe: [string, string][] = [];
    if (c.eta) righe.push(["Età", c.eta]);
    for (const g of ["fisico", "morale", "comportamento"] as const) {
      for (const [field, label] of Object.entries(CHARACTER_GROUPS[g].fields)) {
        const v = (c[g] as Record<string, string>)[field];
        if (v) righe.push([label, v]);
      }
    }
    return { kind: "personaggio", nome: c.nome, sottotitolo: [c.ruolo, c.alias.join(", ")].filter(Boolean).join(" · "), righe, href: `${projectHref}/personaggi` };
  }
  const v = sheets.voci.find((x) => x.data.id === id);
  if (v) {
    const cat = sheets.categorie.items.find((x) => x.id === v.categoria);
    const righe: [string, string][] = (cat?.campi ?? []).filter((f) => v.data.campi[f.id]).map((f) => [f.nome, v.data.campi[f.id]]);
    const parent = v.data.genitore ? sheets.voci.find((x) => x.data.id === v.data.genitore)?.data.nome : null;
    if (parent) righe.unshift(["In", parent]);
    if (v.data.descrizione) righe.push(["Descrizione", v.data.descrizione.length > 240 ? `${v.data.descrizione.slice(0, 240)}…` : v.data.descrizione]);
    return { kind: "voce", nome: v.data.nome, sottotitolo: cat?.nome ?? v.categoria, righe, href: `${projectHref}/mondo` };
  }
  return null;
}

export function SummaryCard({ s, compact = false }: { s: EntitySummary; compact?: boolean }) {
  const righe = compact ? s.righe.slice(0, 4) : s.righe;
  return (
    <div className="entity-card">
      <div className="entity-name">{s.nome}</div>
      {s.sottotitolo && <div className="small muted">{s.sottotitolo}</div>}
      {righe.length > 0 ? (
        <dl className="entity-fields">
          {righe.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="small muted">Scheda ancora vuota.</div>
      )}
    </div>
  );
}

export default function ChapterSidePanel({
  projectHref,
  structureHref,
  sheets,
  sheetsError,
  scenes,
  rules,
  structureState,
  counts,
  ambiguous,
  focus,
  onFocus,
  report,
  stylePrefs,
  onStylePrefs,
  sessionWords,
  sessionGoal,
  onSessionGoal,
  overviewHref,
  commentsSlot,
  workInfo,
}: {
  projectHref: string;
  structureHref: string;
  sheets: SheetsData | null;
  sheetsError: string | null;
  scenes: Scene[];
  /** Regole del mondo che riguardano le voci in scena (citate o luogo delle scene). */
  rules: WorldRule[];
  structureState: "loading" | "none" | "ready" | "error";
  counts: Map<string, number>;
  ambiguous: string[];
  focus: string | null;
  onFocus: (id: string | null) => void;
  report: ChecksReport;
  stylePrefs: StylePrefs;
  onStylePrefs: (p: StylePrefs) => void;
  sessionWords: number | null;
  sessionGoal: number;
  onSessionGoal: (n: number) => void;
  overviewHref: string;
  /** Sezione dei commenti, gestita dall'editor. */
  commentsSlot?: React.ReactNode;
  /** Tema e premessa dell'opera, da tenere sotto gli occhi mentre si scrive. */
  workInfo?: { tema?: string; premessa?: string } | null;
}) {
  const found = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const isCharacter = (id: string) => !!sheets?.personaggi.some((c) => c.data.id === id);
  const characters = found.filter(([id]) => isCharacter(id));
  const world = found.filter(([id]) => !isCharacter(id));
  const names = new Map<string, string>();
  for (const c of sheets?.personaggi ?? []) names.set(c.data.id, c.data.nome);
  for (const v of sheets?.voci ?? []) names.set(v.data.id, v.data.nome);

  const entityList = (items: [string, number][], empty: string) =>
    items.length === 0 ? (
      <p className="small muted">{empty}</p>
    ) : (
      <ul className="panel-list">
        {items.map(([id, n]) => {
          const open = focus === id;
          const s = open && sheets ? summarize(sheets, id, projectHref) : null;
          return (
            <li key={id}>
              <button type="button" className="panel-item" aria-expanded={open} onClick={() => onFocus(open ? null : id)}>
                <span>{names.get(id) ?? id}</span>
                <span className="small muted">{n}×</span>
              </button>
              {s && (
                <div className="panel-detail">
                  <SummaryCard s={s} />
                  <Link href={s.href} className="small">
                    Apri {s.kind === "personaggio" ? "Personaggi" : "Mondo"} →
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <aside className="side-panel" aria-label="Nel capitolo">
      {(workInfo?.tema || workInfo?.premessa) && (
        <section>
          <details open>
            <summary className="panel-title">L&apos;opera</summary>
            <dl className="work-info-list small">
              {workInfo.tema && (
                <div>
                  <dt>Tema</dt>
                  <dd>{workInfo.tema}</dd>
                </div>
              )}
              {workInfo.premessa && (
                <div>
                  <dt>Premessa</dt>
                  <dd>{workInfo.premessa}</dd>
                </div>
              )}
            </dl>
          </details>
        </section>
      )}
      {commentsSlot}
      <section>
        <h2 className="panel-title">Scene del capitolo</h2>
        {structureState === "loading" && <p className="small muted">Carico la struttura…</p>}
        {structureState === "error" && <p className="small muted">Struttura non disponibile.</p>}
        {structureState === "none" && (
          <p className="small muted">
            L&apos;opera non ha ancora una struttura. <Link href={structureHref}>Scegli un modello</Link>
          </p>
        )}
        {structureState === "ready" &&
          (scenes.length === 0 ? (
            <p className="small muted">
              Nessuna scena collegata. <Link href={structureHref}>Collega le scene</Link>
            </p>
          ) : (
            <ul className="panel-list">
              {scenes.map((s) => (
                <li key={s.id} className="panel-scene">
                  <strong>{s.titolo}</strong> <span className={`pill pill-${s.stato}`}>{SCENE_STATUS_LABEL[s.stato]}</span>
                  {s.obiettivo && <div className="small">Obiettivo: {s.obiettivo}</div>}
                  {s.conflitto && <div className="small">Conflitto: {s.conflitto}</div>}
                  {(s.pov || s.luogo) && (
                    <div className="small muted">
                      {s.pov && `POV ${names.get(s.pov) ?? "(eliminato)"}`}
                      {s.pov && s.luogo && " · "}
                      {s.luogo && (names.get(s.luogo) ?? "(eliminato)")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </section>

      {rules.length > 0 && (
        <section>
          <h2 className="panel-title">Regole del mondo</h2>
          <ul className="panel-list">
            {rules.map((r) => (
              <li key={r.id} className="panel-rule">
                {r.testo}
                <div className="small muted">{r.voci.map((id) => names.get(id) ?? "(eliminata)").join(", ")}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.continuity.length > 0 && (
        <section>
          <h2 className="panel-title">Continuità</h2>
          <ul className="panel-list">
            {report.continuity.map((w, i) => (
              <li key={i} className="panel-rule">
                <strong>{w.nome}</strong>: qui «{w.testo}», nella scheda «{w.atteso.join(", ")}».
                <div className="small muted serif">{w.frase}</div>
              </li>
            ))}
          </ul>
          <p className="small muted">Controllo automatico, può sbagliare: sono solo promemoria.</p>
        </section>
      )}

      <section>
        <h2 className="panel-title">Personaggi citati</h2>
        {sheetsError ? <p className="small muted">{sheetsError}</p> : !sheets ? <p className="small muted">Carico le schede…</p> : entityList(characters, sheets.personaggi.length ? "Nessun personaggio citato finora." : "Nessuna scheda personaggio nel progetto.")}
      </section>

      <section>
        <h2 className="panel-title">Mondo citato</h2>
        {sheets && entityList(world, sheets.voci.length ? "Nessun luogo o voce citata finora." : "Nessuna voce del mondo nel progetto.")}
      </section>

      <section>
        <h2 className="panel-title">Stile</h2>
        <div className="stack" style={{ gap: 4 }}>
          {STYLE_CHECKS.map((c) => (
            <label key={c.key} className="row small" style={{ gap: 6, justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={stylePrefs[c.key]} onChange={(e) => onStylePrefs({ ...stylePrefs, [c.key]: e.target.checked })} />
                <span className={`style-swatch style-${c.kind}`} aria-hidden="true" />
                {c.label}
              </span>
              {stylePrefs[c.key] && <span className="muted">{report.counts[c.kind]}</span>}
            </label>
          ))}
        </div>
        {report.overused.length > 0 && (
          <>
            <div className="small muted" style={{ marginTop: 10 }}>
              Parole più usate nel capitolo
            </div>
            <ul className="word-freq">
              {report.overused.map((f) => (
                <li key={f.word}>
                  <span className="serif">{f.word}</span> <span className="small muted">{f.count}×</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2 className="panel-title">Obiettivo della sessione</h2>
        <label className="row small" style={{ gap: 6 }}>
          Parole da scrivere
          <input
            type="number"
            min={0}
            step={50}
            className="input"
            style={{ width: 100, minHeight: 32 }}
            value={sessionGoal || ""}
            placeholder="nessuno"
            onChange={(e) => onSessionGoal(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </label>
        {sessionWords !== null && sessionGoal > 0 && (
          <progress className="goal-bar" style={{ marginTop: 8 }} max={sessionGoal} value={Math.max(0, Math.min(sessionWords, sessionGoal))} aria-label="Obiettivo della sessione" />
        )}
        {sessionWords !== null && (
          <p className="small" style={{ margin: "6px 0 0" }}>
            {sessionGoal > 0 && sessionWords >= sessionGoal
              ? `Obiettivo raggiunto: ${formatCount(sessionWords)} parole in questa sessione.`
              : `${sessionWords >= 0 ? "+" : "−"}${formatCount(Math.abs(sessionWords))} parole da quando hai aperto il capitolo.`}
          </p>
        )}
        <Link href={overviewHref} className="small">
          Statistiche e andamento →
        </Link>
      </section>

      {ambiguous.length > 0 && (
        <p className="small warn-text">
          Nomi usati da più schede: {ambiguous.join(", ")}. Il riconoscimento usa la prima.
        </p>
      )}
    </aside>
  );
}
