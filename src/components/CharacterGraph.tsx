"use client";

import { useMemo } from "react";
import type { Character, CharacterRole } from "@/lib/types";

const ROLE_COLORS: Record<CharacterRole, string> = {
  protagonista: "#15803d",
  antagonista: "#dc2626",
  comprimario: "#d97706",
  altro: "#71717a",
};

interface GraphEdge {
  key: string;
  fromId: string;
  toId: string;
  label: string;
}

export function CharacterGraph({ characters }: { characters: Character[] }) {
  const { nodes, edges, size } = useMemo(() => {
    const n = characters.length;
    const radius = Math.max(90, n * 16);
    const size = radius * 2 + 100;
    const center = size / 2;

    const nodes = characters.map((character, index) => {
      const angle = (2 * Math.PI * index) / n - Math.PI / 2;
      return {
        character,
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    });

    const byId = new Map(characters.map((c) => [c.id, c]));
    const edgeLabels = new Map<string, Set<string>>();
    const edgeEndpoints = new Map<string, [string, string]>();

    for (const character of characters) {
      for (const rel of character.relationships ?? []) {
        if (!rel.personaggioId || !byId.has(rel.personaggioId)) continue;
        if (rel.personaggioId === character.id) continue;
        const key = [character.id, rel.personaggioId].sort().join("::");
        const label = rel.relazione.trim();
        if (!edgeLabels.has(key)) {
          edgeLabels.set(key, new Set());
          edgeEndpoints.set(key, [character.id, rel.personaggioId]);
        }
        if (label) edgeLabels.get(key)!.add(label);
      }
    }

    const edges: GraphEdge[] = Array.from(edgeLabels.entries()).map(([key, labels]) => {
      const [fromId, toId] = edgeEndpoints.get(key)!;
      return { key, fromId, toId, label: Array.from(labels).join(" / ") };
    });

    return { nodes, edges, size };
  }, [characters]);

  const positionById = new Map(nodes.map((node) => [node.character.id, node]));

  return (
    <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4">
      <svg width={size} height={size} className="mx-auto">
        {edges.map((edge) => {
          const from = positionById.get(edge.fromId);
          const to = positionById.get(edge.toId);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={edge.key}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#d4d4d8"
                strokeWidth={1}
              />
              {edge.label && (
                <text
                  x={midX}
                  y={midY}
                  textAnchor="middle"
                  className="fill-zinc-500"
                  fontSize={10}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map(({ character, x, y }) => (
          <g key={character.id}>
            <circle cx={x} cy={y} r={6} fill={ROLE_COLORS[character.role]} />
            <text
              x={x}
              y={y - 12}
              textAnchor="middle"
              className="fill-zinc-700"
              fontSize={11}
              fontWeight={500}
            >
              {character.name || "(senza nome)"}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
