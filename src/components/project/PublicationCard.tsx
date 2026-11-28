"use client";

import Link from "next/link";
import { useMemo } from "react";
import { groupByArc, publicationStats, rangeStatus, todayIso } from "@/lib/project/serial";
import type { OverviewData, OverviewWork } from "@/lib/server/overview";
import { formatCount } from "@/lib/text/stats";

const day = (iso: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`));
const oneDecimal = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);

/**
 * Pubblicazione a puntate: capitoli usciti, scorta in magazzino e ritmo di uscita (ultimi 28 giorni),
 * avanzamento per arco e capitoli fuori dalla lunghezza voluta.
 */
export default function PublicationCard({ data, href }: { data: OverviewData; href: (work: string, file: string) => string }) {
  const today = useMemo(() => todayIso(), []);
  return (
    <section className="card stack" aria-labelledby="pubblicazione-title">
      <div>
        <h2 id="pubblicazione-title" className="serif" style={{ margin: 0, fontSize: 22 }}>
          Pubblicazione
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          «Scorta» sono i capitoli scritti o rivisti che non sono ancora usciti, più quelli con la data di uscita nel futuro. Il ritmo si calcola sulle uscite degli ultimi 28 giorni.
        </p>
      </div>
      {data.opere.map((w) => (
        <WorkPublication key={w.slug} work={w} title={data.opere.length > 1 ? w.titolo : null} today={today} href={href} />
      ))}
    </section>
  );
}

function WorkPublication({ work, title, today, href }: { work: OverviewWork; title: string | null; today: string; href: (work: string, file: string) => string }) {
  const stats = publicationStats(work.capitoli, today);
  const groups = groupByArc(
    work.capitoli.map((c) => ({ file: c.file, titolo: c.titolo, ...(c.arco ? { arco: c.arco } : {}) })),
    work.archi,
  );
  const byFile = new Map(work.capitoli.map((c) => [c.file, c]));
  const outside = work.capitoli
    .map((c, i) => ({ c, i, range: rangeStatus(c.parole, work.paroleCapitolo) }))
    .filter((x) => x.range === "sotto" || x.range === "sopra");
  const lowStock = stats.settimaneDiScorta !== null && stats.settimaneDiScorta < 1;

  return (
    <div className="stack">
      {title && (
        <h3 style={{ margin: 0, fontSize: 18 }} className="serif">
          {title}
        </h3>
      )}
      <dl className="overview-tiles">
        <div>
          <dt>Usciti</dt>
          <dd>{stats.pubblicati}</dd>
        </div>
        <div>
          <dt>Scorta</dt>
          <dd>
            {stats.scorta}
            <span className="small muted">
              {" "}
              ({stats.pronti} pronti · {stats.programmati} programmati)
            </span>
          </dd>
        </div>
        <div>
          <dt>Ritmo</dt>
          <dd>{stats.perSettimana === null ? "—" : `${oneDecimal(stats.perSettimana)} a settimana`}</dd>
        </div>
        <div>
          <dt>La scorta basta per</dt>
          <dd className={lowStock ? "range-sotto" : undefined}>{stats.settimaneDiScorta === null ? "—" : `${oneDecimal(stats.settimaneDiScorta)} settimane`}</dd>
        </div>
        <div>
          <dt>Ultima uscita</dt>
          <dd>{stats.ultimaUscita ? day(stats.ultimaUscita) : "—"}</dd>
        </div>
        <div>
          <dt>Prossima uscita</dt>
          <dd>{stats.prossimaUscita ? day(stats.prossimaUscita) : "—"}</dd>
        </div>
      </dl>
      {lowStock && (
        <div className="notice notice-warn" role="status">
          La scorta basta per meno di una settimana al ritmo attuale: conviene scrivere qualche capitolo in anticipo.
        </div>
      )}

      {work.archi.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Avanzamento per arco</caption>
            <thead>
              <tr>
                <th scope="col">Arco</th>
                <th scope="col">Capitoli</th>
                <th scope="col">Usciti</th>
                <th scope="col">Parole</th>
                <th scope="col">Stato</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rows = g.capitoli.map((x) => byFile.get(x.entry.file)!);
                return (
                  <tr key={g.arco?.id ?? "senza-arco"}>
                    <th scope="row">{g.arco ? g.arco.titolo : "Senza arco"}</th>
                    <td>{rows.length}</td>
                    <td>{rows.filter((r) => r.stato === "pubblicato" && !(r.pubblicato && r.pubblicato > today)).length}</td>
                    <td>{formatCount(rows.reduce((s, r) => s + r.parole, 0))}</td>
                    <td>{g.arco ? (g.arco.chiuso ? "Concluso" : "Aperto") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {work.paroleCapitolo && (
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
            Fuori dalla lunghezza voluta ({formatCount(work.paroleCapitolo.min)}–{formatCount(work.paroleCapitolo.max)} parole)
          </h3>
          {outside.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Tutti i capitoli scritti sono nella lunghezza voluta.
            </p>
          ) : (
            <ul className="list">
              {outside.map(({ c, i, range }) => (
                <li key={c.file}>
                  <span className="small muted" style={{ width: 28 }}>
                    {i + 1}
                  </span>
                  <Link href={href(work.slug, c.file)} style={{ flex: 1 }}>
                    {c.titolo}
                  </Link>
                  <span className={`small range-${range}`}>
                    {formatCount(c.parole)} parole · {range === "sotto" ? "troppo breve" : "troppo lungo"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
