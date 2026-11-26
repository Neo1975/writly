import { describe, expect, it } from "vitest";
import { layoutGraph, MIN_SEPARATION, NODE_R, routeEdges, samplePoints, type GraphEdge, type Point } from "./graph-layout";

// Il caso di chi ha scritto: 9 personaggi, 6 relazioni, 3 senza relazioni.
const IDS = ["stecca", "bruma", "grigio", "sifone", "lucio", "molla", "serena", "rospo", "riccio"];
const EDGES: GraphEdge[] = [
  { id: "r1", da: "stecca", a: "bruma" },
  { id: "r2", da: "grigio", a: "stecca" },
  { id: "r3", da: "bruma", a: "serena" },
  { id: "r4", da: "stecca", a: "molla" },
  { id: "r5", da: "stecca", a: "riccio" },
  { id: "r6", da: "molla", a: "riccio" },
];
const CONNECTED = ["stecca", "bruma", "grigio", "molla", "serena", "riccio"];
const ISOLATED = ["sifone", "lucio", "rospo"];

const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe("disposizione del grafo delle relazioni", () => {
  const layout = layoutGraph(IDS, EDGES);
  const pos = (id: string) => layout.positions.get(id)!;

  it("non sovrappone mai due personaggi e li tiene dentro la tela", () => {
    for (let i = 0; i < IDS.length; i++) {
      const p = pos(IDS[i]);
      expect(p.x).toBeGreaterThanOrEqual(NODE_R);
      expect(p.x).toBeLessThanOrEqual(layout.width - NODE_R);
      expect(p.y).toBeGreaterThanOrEqual(NODE_R);
      expect(p.y).toBeLessThanOrEqual(layout.height - NODE_R);
      for (let j = i + 1; j < IDS.length; j++) expect(d(p, pos(IDS[j]))).toBeGreaterThan(2 * NODE_R + 20);
    }
    // Chi ha relazioni sta a una distanza che lascia posto all'etichetta.
    for (let i = 0; i < CONNECTED.length; i++) for (let j = i + 1; j < CONNECTED.length; j++) expect(d(pos(CONNECTED[i]), pos(CONNECTED[j]))).toBeGreaterThanOrEqual(MIN_SEPARATION - 1);
  });

  it("mette i personaggi senza relazioni in una fascia sotto il grafo", () => {
    expect(layout.isolated).toEqual(ISOLATED);
    const lowestConnected = Math.max(...CONNECTED.map((id) => pos(id).y));
    for (const id of ISOLATED) expect(pos(id).y).toBeGreaterThan(Math.max(lowestConnected, layout.stripTop));
    expect(layout.stripTop).toBe(layout.mainHeight);
  });

  it("avvicina chi è collegato", () => {
    const edgeLen = EDGES.map((e) => d(pos(e.da), pos(e.a)));
    const linked = new Set(EDGES.map((e) => [e.da, e.a].sort().join("|")));
    const non: number[] = [];
    for (let i = 0; i < CONNECTED.length; i++) for (let j = i + 1; j < CONNECTED.length; j++) if (!linked.has([CONNECTED[i], CONNECTED[j]].sort().join("|"))) non.push(d(pos(CONNECTED[i]), pos(CONNECTED[j])));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(edgeLen)).toBeLessThan(mean(non));
  });

  it("dà sempre lo stesso risultato", () => {
    const again = layoutGraph(IDS, EDGES);
    expect([...again.positions]).toEqual([...layout.positions]);
    expect(again.width).toBe(layout.width);
  });

  it("gestisce i casi limite: nessuna relazione, una sola, riferimenti a personaggi eliminati", () => {
    const none = layoutGraph(["a", "b", "c"], []);
    expect(none.mainHeight).toBe(0);
    expect(none.isolated).toEqual(["a", "b", "c"]);
    expect(none.height).toBeGreaterThan(100);
    const one = layoutGraph(["a", "b"], [{ id: "x", da: "a", a: "b" }]);
    expect(one.isolated).toEqual([]);
    expect(d(one.positions.get("a")!, one.positions.get("b")!)).toBeGreaterThanOrEqual(MIN_SEPARATION - 1);
    const ghost = layoutGraph(["a", "b"], [{ id: "x", da: "a", a: "eliminato" }, { id: "y", da: "a", a: "a" }]);
    expect(ghost.isolated).toEqual(["a", "b"]);
    // Venti personaggi con una catena di relazioni: nessuna sovrapposizione.
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const big = layoutGraph(ids, ids.slice(1).map((id, i) => ({ id: `e${i}`, da: ids[i], a: id })));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(d(big.positions.get(ids[i])!, big.positions.get(ids[j])!)).toBeGreaterThan(2 * NODE_R + 20);
  });
});

describe("percorso delle linee", () => {
  const layout = layoutGraph(IDS, EDGES);
  const routes = routeEdges(EDGES, layout.positions, layout);

  it("non passa vicino a un personaggio che non c'entra, né mette l'etichetta su un cerchio", () => {
    for (const e of EDGES) {
      const route = routes.get(e.id)!;
      for (const [id, p] of layout.positions) {
        if (id === e.da || id === e.a) continue;
        for (const pt of samplePoints(route)) expect(d(pt, p), `${e.id} vicino a ${id}`).toBeGreaterThan(NODE_R + 6);
      }
      for (const p of layout.positions.values()) expect(d(route.label, p)).toBeGreaterThan(NODE_R + 20);
    }
  });

  it("aggira un personaggio che sta in mezzo", () => {
    const positions = new Map<string, Point>([
      ["a", { x: 100, y: 200 }],
      ["c", { x: 300, y: 200 }],
      ["b", { x: 500, y: 200 }],
    ]);
    const edges: GraphEdge[] = [{ id: "e", da: "a", a: "b" }];
    const route = routeEdges(edges, positions, { width: 600, height: 400 }).get("e")!;
    for (const pt of samplePoints(route)) expect(d(pt, positions.get("c")!)).toBeGreaterThan(NODE_R + 10);
    // Senza ostacoli resta dritta.
    positions.delete("c");
    const straight = routeEdges(edges, positions, { width: 600, height: 400 }).get("e")!;
    expect(straight.c.y).toBeCloseTo(200, 5);
  });

  it("separa due relazioni fra la stessa coppia, anche in versi opposti", () => {
    const positions = new Map<string, Point>([
      ["a", { x: 150, y: 200 }],
      ["b", { x: 450, y: 200 }],
    ]);
    const both: GraphEdge[] = [
      { id: "ab", da: "a", a: "b" },
      { id: "ba", da: "b", a: "a" },
    ];
    const r = routeEdges(both, positions, { width: 600, height: 400 });
    expect(d(r.get("ab")!.label, r.get("ba")!.label)).toBeGreaterThan(40);
  });
});
