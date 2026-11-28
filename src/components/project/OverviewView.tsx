"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { projectApi } from "@/lib/client/api";
import { useApiData } from "@/lib/client/hooks";
import { dailyTotals, today, useDiary } from "@/lib/client/prefs";
import type { OverviewData, OverviewEntity, OverviewWork } from "@/lib/server/overview";
import { formatCount } from "@/lib/text/stats";
import ProjectNav from "./ProjectNav";
import PublicationCard from "./PublicationCard";

const STATUS_LABEL: Record<string, string> = {
  bozza: "Bozza",
  "in-stesura": "In stesura",
  scritto: "Scritto",
  revisionato: "Revisionato",
  pubblicato: "Pubblicato",
  mancante: "File mancante",
};

const DAYS = 30;

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
}

/** Gli ultimi N giorni, oggi compreso, anche quelli senza scrittura. */
function lastDays(totals: Map<string, number>, n: number) {
  const out: { day: string; words: number }[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const key = today(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i));
    out.push({ day: key, words: totals.get(key) ?? 0 });
  }
  return out;
}

function WritingChart({ owner, repo }: { owner: string; repo: string }) {
  const diary = useDiary(owner, repo);
  const [hover, setHover] = useState<number | null>(null);
  const totals = new Map(dailyTotals(diary).map((t) => [t.day, t.words]));
  const days = lastDays(totals, DAYS);
  const max = Math.max(1, ...days.map((d) => d.words));
  const min = Math.min(0, ...days.map((d) => d.words));
  const span = max - min;
  const zero = (max / span) * 100; // linea dello zero, dall'alto, in %
  const week = days.slice(-7).reduce((s, d) => s + d.words, 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].words > 0; i--) streak++;
  const active = days.filter((d) => d.words !== 0);
  const positive = days.filter((d) => d.words > 0);
  const shown = hover !== null ? days[hover] : null;

  return (
    <section className="card stack" aria-labelledby="andamento-title">
      <div>
        <h2 id="andamento-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
          Parole scritte negli ultimi {DAYS} giorni
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Parole nette (scritte meno tagliate), registrate in questo browser mentre scrivi: ogni dispositivo ha il suo diario.
        </p>
      </div>
      <dl className="overview-tiles">
        <div>
          <dt>Ultimi 7 giorni</dt>
          <dd>{formatCount(week)}</dd>
        </div>
        <div>
          <dt>Giorni di fila</dt>
          <dd>{streak}</dd>
        </div>
        <div>
          <dt>Media nei giorni di scrittura</dt>
          <dd>{positive.length ? formatCount(Math.round(positive.reduce((s, d) => s + d.words, 0) / positive.length)) : "—"}</dd>
        </div>
      </dl>
      {active.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Ancora nessuna scrittura registrata in questo browser.
        </p>
      ) : (
        <>
          <div className="chart-readout small" aria-live="polite">
            {shown ? (
              <>
                <strong>{dayLabel(shown.day)}</strong>: {shown.words >= 0 ? "+" : "−"}
                {formatCount(Math.abs(shown.words))} parole
              </>
            ) : (
              <span className="muted">Passa sopra una barra per il dettaglio.</span>
            )}
          </div>
          <div className="day-chart" role="img" aria-label={`Parole al giorno negli ultimi ${DAYS} giorni, massimo ${formatCount(max)}`} onMouseLeave={() => setHover(null)}>
            <div className="day-chart-zero" style={{ top: `${zero}%` }} />
            {days.map((d, i) => {
              const h = (Math.abs(d.words) / span) * 100;
              return (
                <div key={d.day} className={`day-col${hover === i ? " is-hover" : ""}`} onMouseEnter={() => setHover(i)}>
                  {d.words !== 0 && (
                    <div className={`day-bar${d.words < 0 ? " negative" : ""}`} style={d.words > 0 ? { bottom: `${100 - zero}%`, height: `${h}%` } : { top: `${zero}%`, height: `${h}%` }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="day-chart-axis small muted">
            <span>{dayLabel(days[0].day)}</span>
            <span>oggi</span>
          </div>
          <details>
            <summary className="small">Mostra come tabella</summary>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Giorno</th>
                  <th scope="col">Parole</th>
                </tr>
              </thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.day}>
                    <td>{dayLabel(d.day)}</td>
                    <td>{formatCount(d.words)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

/** Intensità della cella (una sola tinta, dal chiaro allo scuro); il numero è sempre scritto. */
function heat(n: number, max: number) {
  if (!n) return undefined;
  return `heat-${Math.min(4, Math.ceil((n / max) * 4))}`;
}

function PresenceTable({ work, schede, href }: { work: OverviewWork; schede: OverviewEntity[]; href: (file: string) => string }) {
  const rows = schede
    .map((s) => ({ s, counts: work.capitoli.map((c) => c.presenze[s.id] ?? 0) }))
    .map((r) => ({ ...r, total: r.counts.reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (a.s.tipo === b.s.tipo ? b.total - a.total : a.s.tipo === "personaggio" ? -1 : 1));
  if (rows.length === 0) return <p className="small muted">Nessun personaggio o voce del mondo citata nei capitoli salvati.</p>;
  const max = Math.max(...rows.flatMap((r) => r.counts));
  return (
    <div className="table-wrap">
      <table className="table presence-table">
        <caption className="sr-only">Citazioni di ogni scheda per capitolo di {work.titolo}</caption>
        <thead>
          <tr>
            <th scope="col">Scheda</th>
            {work.capitoli.map((c, i) => (
              <th key={c.file} scope="col" title={c.titolo}>
                <Link href={href(c.file)} aria-label={`Capitolo ${i + 1}: ${c.titolo}`}>
                  {i + 1}
                </Link>
              </th>
            ))}
            <th scope="col">Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s.id}>
              <th scope="row">
                {r.s.nome}
                {r.s.tipo === "voce" && <span className="small muted"> {r.s.categoria}</span>}
              </th>
              {r.counts.map((n, i) => (
                <td key={i} className={heat(n, max)} title={`${r.s.nome} · ${work.capitoli[i].titolo}: ${n}`}>
                  {n || ""}
                </td>
              ))}
              <td>
                <strong>{r.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SagaTable({ data, href }: { data: OverviewData; href: (work: string, file: string) => string }) {
  const rows = data.schede
    .map((s) => {
      const perWork = data.opere.map((w) => w.capitoli.reduce((sum, c) => sum + (c.presenze[s.id] ?? 0), 0));
      let first: { work: OverviewWork; file: string; titolo: string } | null = null;
      for (const w of data.opere) {
        const c = w.capitoli.find((x) => x.presenze[s.id]);
        if (c) {
          first = { work: w, file: c.file, titolo: c.titolo };
          break;
        }
      }
      return { s, perWork, first, total: perWork.reduce((a, b) => a + b, 0) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  if (rows.length === 0) return <p className="small muted">Nessuna scheda citata finora.</p>;
  const max = Math.max(...rows.flatMap((r) => r.perWork));
  return (
    <div className="table-wrap">
      <table className="table presence-table">
        <caption className="sr-only">Citazioni di ogni scheda per opera</caption>
        <thead>
          <tr>
            <th scope="col">Scheda</th>
            {data.opere.map((w) => (
              <th key={w.slug} scope="col">
                {w.titolo}
              </th>
            ))}
            <th scope="col">Prima comparsa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s.id}>
              <th scope="row">{r.s.nome}</th>
              {r.perWork.map((n, i) => (
                <td key={i} className={heat(n, max)}>
                  {n || "—"}
                </td>
              ))}
              <td className="small">
                {r.first && (
                  <Link href={href(r.first.work.slug, r.first.file)}>
                    {r.first.work.titolo} · {r.first.titolo}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewView({ owner, repo }: { owner: string; repo: string }) {
  const { data, error } = useApiData<OverviewData>(`${projectApi(owner, repo)}/panoramica`);
  const base = `/progetto/${owner}/${repo}`;
  const chapterHref = (work: string, file: string) => `${base}/${work}/${file.replace(/\.md$/, "")}`;

  const derived = useMemo(() => {
    if (!data) return null;
    const chapters = data.opere.flatMap((w) => w.capitoli);
    const total = chapters.reduce((s, c) => s + c.parole, 0);
    const done = chapters.filter((c) => c.stato === "scritto" || c.stato === "revisionato" || c.stato === "pubblicato").length;
    const warnings = data.opere.flatMap((w) => w.capitoli.flatMap((c) => c.avvisi.map((a) => ({ ...a, work: w, chapter: c }))));
    const cited = new Set(chapters.flatMap((c) => Object.keys(c.presenze)));
    const unused = data.schede.filter((s) => !cited.has(s.id));
    return { chapters, total, done, warnings, unused };
  }, [data]);

  const nav = <ProjectNav owner={owner} repo={repo} title={data?.titolo ?? "Progetto"} current="panoramica" />;
  if (error) {
    return (
      <main className="page stack">
        {nav}
        <div className="notice notice-error" role="alert">
          {error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="page stack">
      {nav}
      <h1 className="serif" style={{ margin: 0 }}>
        Panoramica
      </h1>
      {!data || !derived ? (
        <p className="muted">Leggo tutti i capitoli salvati…</p>
      ) : (
        <>
          <section className="card stack" aria-labelledby="riepilogo-title">
            <h2 id="riepilogo-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
              Riepilogo
            </h2>
            <dl className="overview-tiles">
              <div>
                <dt>Parole in versione</dt>
                <dd>{formatCount(derived.total)}</dd>
              </div>
              <div>
                <dt>Capitoli scritti, rivisti o pubblicati</dt>
                <dd>
                  {derived.done} / {derived.chapters.length}
                </dd>
              </div>
              <div>
                <dt>Avvisi di continuità</dt>
                <dd>{derived.warnings.length}</dd>
              </div>
            </dl>
            {data.opere.map((w) => {
              const words = w.capitoli.reduce((s, c) => s + c.parole, 0);
              return (
                <div key={w.slug} className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{w.titolo}</strong>
                    <span className="small">
                      {formatCount(words)} parole
                      {w.obiettivoParole ? ` su ${formatCount(w.obiettivoParole)} (${Math.round((words / w.obiettivoParole) * 100)}%)` : ""}
                    </span>
                  </div>
                  {w.obiettivoParole && <progress className="goal-bar" max={w.obiettivoParole} value={Math.min(words, w.obiettivoParole)} aria-label={`Obiettivo di ${w.titolo}`} />}
                </div>
              );
            })}
            <p className="small muted" style={{ margin: 0 }}>
              Conteggi sull&apos;ultima versione salvata di ogni capitolo: le modifiche non ancora salvate in versione non sono comprese.
            </p>
          </section>

          <WritingChart owner={owner} repo={repo} />

          {data.opere.length > 1 && (
            <section className="card stack" aria-labelledby="saga-title">
              <div>
                <h2 id="saga-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
                  {data.tipo === "saga" ? "La saga, libro per libro" : "Le opere a confronto"}
                </h2>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  Chi compare in quale libro, e dove compare per la prima volta.
                </p>
              </div>
              <SagaTable data={data} href={chapterHref} />
            </section>
          )}

          {(data.tipo === "webnovel" || derived.chapters.some((c) => c.stato === "pubblicato")) && <PublicationCard data={data} href={chapterHref} />}

          {data.opere.map((w) => (
            <section key={w.slug} className="card stack" aria-labelledby={`opera-${w.slug}`}>
              <h2 id={`opera-${w.slug}`} className="serif" style={{ margin: 0, fontSize: 22 }}>
                {data.opere.length > 1 ? w.titolo : "Capitoli"}
              </h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Capitolo</th>
                      <th scope="col">Stato</th>
                      <th scope="col">Parole</th>
                      <th scope="col">Battute</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.capitoli.map((c, i) => (
                      <tr key={c.file}>
                        <td>{i + 1}</td>
                        <td>
                          <Link href={chapterHref(w.slug, c.file)}>{c.titolo}</Link>
                        </td>
                        <td>
                          {STATUS_LABEL[c.stato] ?? c.stato}
                          {c.pubblicato ? <span className="muted"> · {c.pubblicato.split("-").reverse().join("/")}</span> : null}
                        </td>
                        <td>{formatCount(c.parole)}</td>
                        <td>{formatCount(c.battute)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ margin: "8px 0 0", fontSize: 16 }}>Presenze per capitolo</h3>
              <PresenceTable work={w} schede={data.schede} href={(f) => chapterHref(w.slug, f)} />
            </section>
          ))}

          <section className="card stack" aria-labelledby="continuita-title">
            <h2 id="continuita-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
              Continuità
            </h2>
            {derived.warnings.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Nessun contrasto trovato tra il testo e le schede (occhi, capelli, barba, pelle).
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {derived.warnings.map((a, i) => (
                  <li key={i} className="continuity-item">
                    <strong>{a.nome}</strong>: «{a.testo}», nella scheda «{a.atteso.join(", ")}» — <Link href={chapterHref(a.work.slug, a.chapter.file)}>{a.chapter.titolo}</Link>
                    <div className="small muted serif">{a.frase}</div>
                  </li>
                ))}
              </ul>
            )}
            <h3 style={{ margin: "8px 0 0", fontSize: 16 }}>Schede mai citate nel testo</h3>
            {derived.unused.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Ogni scheda compare almeno una volta.
              </p>
            ) : (
              <p className="small" style={{ margin: 0 }}>
                {derived.unused.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    <Link href={`${base}/${s.tipo === "personaggio" ? "personaggi" : "mondo"}`}>{s.nome}</Link>
                    {s.tipo === "voce" && <span className="muted"> ({s.categoria})</span>}
                  </span>
                ))}
              </p>
            )}
            <p className="small muted" style={{ margin: 0 }}>
              Controlli automatici sul testo salvato: possono sbagliare e non bloccano nulla.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
