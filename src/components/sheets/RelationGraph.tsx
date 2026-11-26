"use client";

import { CENTER_INFO, CENTERS, type Character, type Relation } from "@/lib/project/entities";

/**
 * Grafo delle relazioni: personaggi disposti in cerchio, archi orientati con
 * etichetta. La tabella delle relazioni accanto è l'alternativa testuale.
 */
export default function RelationGraph({
  characters,
  relations,
  selected,
  onSelect,
}: {
  characters: Character[];
  relations: Relation[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const W = 720;
  const H = 460;
  const n = characters.length;
  const r = n <= 1 ? 0 : Math.min(W, H) / 2 - 70;
  const pos = new Map(
    characters.map((c, i) => {
      const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      return [c.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) }];
    }),
  );
  const visible = relations.filter((rel) => pos.has(rel.da) && pos.has(rel.a) && rel.da !== rel.a);
  // Coppie con più archi (anche in versi opposti): li curviamo per non sovrapporli.
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const pairCount = new Map<string, number>();
  for (const rel of visible) pairCount.set(pairKey(rel.da, rel.a), (pairCount.get(pairKey(rel.da, rel.a)) ?? 0) + 1);

  if (n === 0) return <p className="muted">Aggiungi dei personaggi per vedere il grafo.</p>;

  const byCenter = CENTERS.map((k) => ({ k, n: characters.filter((c) => c.polarizzazione.dominante === k).length }));
  const none = characters.filter((c) => !c.polarizzazione.dominante).length;

  return (
    <>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="graph"
      role="group"
      aria-label={`Grafo delle relazioni: ${n} personaggi, ${visible.length} relazioni. L'elenco completo è nella tabella.`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="graph-arrow" />
        </marker>
      </defs>
      {visible.map((rel) => {
        const a = pos.get(rel.da)!;
        const b = pos.get(rel.a)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const R = 30;
        const sx = a.x + ux * R;
        const sy = a.y + uy * R;
        const ex = b.x - ux * (R + 4);
        const ey = b.y - uy * (R + 4);
        // Il verso della curva dipende dall'ordine dei due estremi: archi opposti si separano.
        const curved = (pairCount.get(pairKey(rel.da, rel.a)) ?? 0) > 1;
        const bend = curved ? 30 : 0;
        const cx = (sx + ex) / 2 - uy * bend;
        const cy = (sy + ey) / 2 + ux * bend;
        const active = selected === rel.da || selected === rel.a;
        return (
          <g key={rel.id} className={`graph-edge${active ? " is-active" : ""}`} aria-hidden="true">
            <path d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`} markerEnd="url(#arrow)" fill="none" />
            <text x={cx} y={cy - 4} textAnchor="middle" className="graph-label">
              {rel.tipo}
            </text>
          </g>
        );
      })}
      {characters.map((c) => {
        const p = pos.get(c.id)!;
        const isSel = selected === c.id;
        const center = c.polarizzazione.dominante;
        return (
          <g
            key={c.id}
            className={`graph-node${isSel ? " is-selected" : ""}${center ? ` center-${center}` : ""}`}
            transform={`translate(${p.x},${p.y})`}
            tabIndex={0}
            role="button"
            aria-label={`Apri la scheda di ${c.nome}${center ? ` (${CENTER_INFO[center].label.toLowerCase()})` : ""}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
          >
            <circle r={28} />
            <text textAnchor="middle" dy="0.35em" className="graph-initials">
              {c.nome
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </text>
            <text textAnchor="middle" y={46} className="graph-name">
              {c.nome}
            </text>
            {center && (
              <g className="graph-center-badge" transform="translate(20,-20)" aria-hidden="true">
                <circle r={10} />
                <text textAnchor="middle" dy="0.35em">
                  {CENTER_INFO[center].label[0]}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
    <p className="graph-legend small" aria-label="Polarizzazione del cast">
      {byCenter.map(({ k, n: count }) => (
        <span key={k} className={`graph-legend-item center-${k}`}>
          <span className="graph-legend-dot" aria-hidden="true">
            {CENTER_INFO[k].label[0]}
          </span>
          {CENTER_INFO[k].label} {count}
        </span>
      ))}
      {none > 0 && <span className="muted">non indicata {none}</span>}
    </p>
    </>
  );
}
