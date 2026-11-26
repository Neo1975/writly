"use client";

import { useMemo, type CSSProperties } from "react";
import { CENTER_INFO, CENTERS, type Character, type Relation } from "@/lib/project/entities";
import { layoutGraph, NODE_R, routeEdges } from "@/lib/project/graph-layout";

/**
 * Grafo delle relazioni. I personaggi con relazioni si dispongono per vicinanza
 * (chi è collegato sta vicino), quelli senza relazioni stanno in una fascia sotto;
 * le linee aggirano i personaggi che incontrano. Toccando un personaggio le
 * relazioni degli altri si attenuano. La tabella delle relazioni accanto è
 * l'alternativa testuale.
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
  const n = characters.length;
  const ids = useMemo(() => characters.map((c) => c.id), [characters]);
  const known = useMemo(() => new Set(ids), [ids]);
  const visible = useMemo(() => relations.filter((rel) => known.has(rel.da) && known.has(rel.a) && rel.da !== rel.a), [relations, known]);
  const layout = useMemo(() => layoutGraph(ids, visible), [ids, visible]);
  const routes = useMemo(() => routeEdges(visible, layout.positions, layout), [visible, layout]);

  if (n === 0) return <p className="muted">Aggiungi dei personaggi per vedere il grafo.</p>;

  const byCenter = CENTERS.map((k) => ({ k, n: characters.filter((c) => c.polarizzazione.dominante === k).length }));
  const none = characters.filter((c) => !c.polarizzazione.dominante).length;

  // Con un personaggio scelto: sue relazioni in evidenza, le altre attenuate; i suoi vicini restano pieni.
  const neighbours = new Set<string>();
  if (selected) for (const rel of visible) if (rel.da === selected || rel.a === selected) neighbours.add(rel.da === selected ? rel.a : rel.da);
  const isActive = (rel: Relation) => !!selected && (rel.da === selected || rel.a === selected);
  // Le relazioni in evidenza si disegnano per ultime, sopra le altre.
  const drawOrder = [...visible].sort((a, b) => Number(isActive(a)) - Number(isActive(b)));

  return (
    <>
      {/* Misura naturale, mai oltre. Sugli schermi larghi non scende sotto il 75% (le scritte restano leggibili) e, se non ci sta, scorre di lato qui dentro; sul telefono si adatta alla larghezza e si ingrandisce con le dita. */}
      <div className="graph-wrap" tabIndex={0} aria-label="Grafo delle relazioni (scorre di lato se è largo)">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="graph"
          style={{ width: layout.width, maxWidth: "100%", "--graph-min": `${Math.round(layout.width * 0.75)}px` } as CSSProperties}
          role="group"
          aria-label={`Grafo delle relazioni: ${n} personaggi, ${visible.length} relazioni. L'elenco completo è nella tabella.`}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="graph-arrow" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="graph-arrow is-active" />
            </marker>
          </defs>

          {layout.isolated.length > 0 && (
            <g className="graph-strip" aria-hidden="true">
              {layout.stripTop > 0 && <line x1={40} x2={layout.width - 40} y1={layout.stripTop} y2={layout.stripTop} />}
              <text x={layout.width / 2} y={layout.stripTop + 24} textAnchor="middle">
                Senza relazioni ({layout.isolated.length})
              </text>
            </g>
          )}

          {drawOrder.map((rel) => {
            const route = routes.get(rel.id);
            if (!route) return null;
            const active = isActive(rel);
            const dim = !!selected && !active;
            return (
              <g key={rel.id} className={`graph-edge${active ? " is-active" : ""}${dim ? " is-dim" : ""}`} aria-hidden="true">
                <path d={route.path} markerEnd={active ? "url(#arrow-active)" : "url(#arrow)"} fill="none" />
                <text x={route.label.x} y={route.label.y} textAnchor="middle" dy="0.35em" className="graph-label">
                  {rel.tipo}
                </text>
              </g>
            );
          })}

          {characters.map((c) => {
            const p = layout.positions.get(c.id)!;
            const isSel = selected === c.id;
            const center = c.polarizzazione.dominante;
            const dim = !!selected && !isSel && !neighbours.has(c.id);
            return (
              <g
                key={c.id}
                className={`graph-node${isSel ? " is-selected" : ""}${dim ? " is-dim" : ""}${center ? ` center-${center}` : ""}`}
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
                <circle r={NODE_R} />
                <text textAnchor="middle" dy="0.35em" className="graph-initials">
                  {c.nome
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </text>
                <text textAnchor="middle" y={NODE_R + 18} className="graph-name">
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
      </div>
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
