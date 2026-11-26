/**
 * Disposizione del grafo delle relazioni fra personaggi.
 *
 * - I personaggi con relazioni si dispongono con una simulazione a molle
 *   (Fruchterman-Reingold, deterministica): chi è collegato sta vicino, gli
 *   altri si respingono e non si sovrappongono.
 * - I personaggi senza relazioni stanno in una fascia a parte sotto il grafo.
 * - Le linee sono curve di Bézier che aggirano i personaggi che incontrano e
 *   tengono le etichette lontane dai cerchi; più relazioni fra la stessa
 *   coppia si separano.
 *
 * Logica pura, senza React: si prova con i test.
 */

export const NODE_R = 28;

export interface Point {
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  da: string;
  a: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  /** Altezza della parte con le relazioni (la fascia dei senza-relazioni viene dopo). */
  mainHeight: number;
  positions: Map<string, Point>;
  /** Personaggi senza relazioni visibili, nell'ordine dato. */
  isolated: string[];
  /** Ordinata d'inizio della fascia dei senza-relazioni (0 se non c'è). */
  stripTop: number;
}

/** Distanza minima fra i centri di due personaggi: lascia posto a un'etichetta fra i due. */
export const MIN_SEPARATION = 2 * NODE_R + 96;
const PAD_X = 80;
const PAD_TOP = NODE_R + 20;
const PAD_BOTTOM = NODE_R + 40;
const SLOT = 140;
const ROW_H = 104;
const STRIP_HEAD = 40;
const MIN_WIDTH = 560;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function layoutGraph(ids: string[], edges: GraphEdge[]): GraphLayout {
  const known = new Set(ids);
  const adj = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.da === e.a || !known.has(e.da) || !known.has(e.a)) continue;
    const key = e.da < e.a ? `${e.da}|${e.a}` : `${e.a}|${e.da}`;
    if (seen.has(key)) continue;
    seen.add(key);
    adj.get(e.da)!.add(e.a);
    adj.get(e.a)!.add(e.da);
    pairs.push([e.da, e.a]);
  }
  const index = new Map(ids.map((id, i) => [id, i]));
  const deg = (id: string) => adj.get(id)!.size;
  const byDeg = (a: string, b: string) => deg(b) - deg(a) || index.get(a)! - index.get(b)!;
  const connected = ids.filter((id) => deg(id) > 0);
  const isolated = ids.filter((id) => deg(id) === 0);

  // Ordine di partenza: visita in ampiezza dai più collegati, così i vicini partono vicini.
  const order: string[] = [];
  const visited = new Set<string>();
  for (const start of [...connected].sort(byDeg)) {
    if (visited.has(start)) continue;
    visited.add(start);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const nb of [...adj.get(cur)!].sort(byDeg)) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
  }

  const n = order.length;
  const positions = new Map<string, Point>();

  if (n === 0) {
    return finish(Math.max(MIN_WIDTH, stripWidth(isolated.length) + 2 * PAD_X), 0, positions, isolated);
  }

  const W0 = Math.max(MIN_WIDTH, Math.sqrt(n) * 300);
  const H0 = Math.max(380, Math.sqrt(n) * 230);
  const center = { x: W0 / 2, y: H0 / 2 };
  const pos = new Map<string, Point>();
  order.forEach((id, i) => {
    const r = Math.sqrt((i + 0.5) / n);
    const th = i * 2.399963; // angolo aureo: distribuzione a girasole
    pos.set(id, { x: center.x + Math.cos(th) * r * (W0 / 2), y: center.y + Math.sin(th) * r * (H0 / 2) });
  });

  // Lunghezza ideale di una relazione: abbastanza per l'etichetta, senza disperdere il grafo.
  const k = 175 + Math.min(70, n * 4);
  let temp = W0 / 8;
  for (let it = 0; it < 320; it++) {
    const disp = new Map(order.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(order[i])!;
        const b = pos.get(order[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 0.01 * (j + 1);
          dy = 0.01 * (i + 1);
          d = Math.hypot(dx, dy);
        }
        const f = (k * k) / d;
        const da = disp.get(order[i])!;
        const db = disp.get(order[j])!;
        da.x += (dx / d) * f;
        da.y += (dy / d) * f;
        db.x -= (dx / d) * f;
        db.y -= (dy / d) * f;
      }
    }
    for (const [u, v] of pairs) {
      const a = pos.get(u)!;
      const b = pos.get(v)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = (d * d) / k;
      disp.get(u)!.x -= (dx / d) * f;
      disp.get(u)!.y -= (dy / d) * f;
      disp.get(v)!.x += (dx / d) * f;
      disp.get(v)!.y += (dy / d) * f;
    }
    for (const id of order) {
      const p = pos.get(id)!;
      const dd = disp.get(id)!;
      // Gravità leggera: i gruppi scollegati restano nella stessa tela.
      dd.x -= (p.x - center.x) * 0.35;
      dd.y -= (p.y - center.y) * 0.35;
      const len = Math.hypot(dd.x, dd.y);
      if (len > 0) {
        const step = Math.min(len, temp);
        p.x += (dd.x / len) * step;
        p.y += (dd.y / len) * step;
      }
    }
    temp *= 0.985;
  }

  // Distanza minima garantita: spinge via i cerchi troppo vicini.
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(order[i])!;
        const b = pos.get(order[j])!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_SEPARATION - 0.5) continue;
        if (d < 0.01) {
          dx = 1;
          dy = 0.3;
          d = Math.hypot(dx, dy);
        }
        const push = (MIN_SEPARATION - d) / 2 + 0.25;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const xs = order.map((id) => pos.get(id)!.x);
  const ys = order.map((id) => pos.get(id)!.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const bboxW = Math.max(...xs) - minX;
  const bboxH = Math.max(...ys) - minY;
  const mainHeight = bboxH + PAD_TOP + PAD_BOTTOM;
  const width = Math.max(MIN_WIDTH, bboxW + 2 * PAD_X, stripWidth(isolated.length) + 2 * PAD_X);
  for (const id of order) {
    const p = pos.get(id)!;
    positions.set(id, { x: p.x - minX + (width - bboxW) / 2, y: p.y - minY + PAD_TOP });
  }
  return finish(width, mainHeight, positions, isolated);
}

function stripWidth(count: number): number {
  return Math.min(count, 6) * SLOT;
}

/** Mette i personaggi senza relazioni in una fascia a righe sotto il grafo. */
function finish(width: number, mainHeight: number, positions: Map<string, Point>, isolated: string[]): GraphLayout {
  if (isolated.length === 0) return { width, height: mainHeight, mainHeight, positions, isolated, stripTop: 0 };
  const perRow = Math.max(1, Math.floor((width - 2 * PAD_X) / SLOT));
  const rows = Math.ceil(isolated.length / perRow);
  const stripTop = mainHeight;
  isolated.forEach((id, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, isolated.length - row * perRow);
    const col = i - row * perRow;
    positions.set(id, { x: width / 2 + (col - (inRow - 1) / 2) * SLOT, y: stripTop + STRIP_HEAD + NODE_R + row * ROW_H });
  });
  return { width, height: stripTop + STRIP_HEAD + rows * ROW_H + 6, mainHeight, positions, isolated, stripTop };
}

// ——— Linee ———

export interface Route {
  /** Tracciato SVG (curva quadratica di Bézier). */
  path: string;
  p0: Point;
  c: Point;
  p2: Point;
  /** Dove scrivere l'etichetta: il punto di mezzo della curva. */
  label: Point;
}

const bezier = (p0: Point, c: Point, p2: Point, t: number): Point => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
});

const towards = (from: Point, to: Point, len: number): Point => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * len, y: from.y + ((to.y - from.y) / d) * len };
};

/** Quanto una curva disturba: passa troppo vicino a un altro personaggio, esce dalla tela, o mette l'etichetta su un cerchio. */
function penalty(p0: Point, c: Point, p2: Point, others: Point[], all: Point[], width: number, height: number): number {
  let pen = 0;
  for (let t = 0.05; t < 0.96; t += 0.05) {
    const pt = bezier(p0, c, p2, t);
    for (const o of others) if (dist(pt, o) < NODE_R + 12) pen += 1;
    if (pt.x < 10 || pt.x > width - 10 || pt.y < 10 || pt.y > height - 10) pen += 1;
  }
  const label = bezier(p0, c, p2, 0.5);
  for (const o of all) if (dist(label, o) < NODE_R + 28) pen += 3;
  return pen;
}

/**
 * Percorso di ogni relazione. Parte dritto; se incontra un personaggio (o
 * finirebbe fuori dalla tela) prova curve sempre più larghe da un lato e
 * dall'altro. Due relazioni fra la stessa coppia (anche in versi opposti) si
 * dispongono su curve diverse.
 */
export function routeEdges(edges: GraphEdge[], positions: Map<string, Point>, size: { width: number; height: number }): Map<string, Route> {
  const out = new Map<string, Route>();
  const groups = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (e.da === e.a || !positions.has(e.da) || !positions.has(e.a)) continue;
    const key = e.da < e.a ? `${e.da}|${e.a}` : `${e.a}|${e.da}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const allPoints = [...positions.values()];
  for (const group of groups.values()) {
    group.forEach((e, i) => {
      const A = positions.get(e.da)!;
      const B = positions.get(e.a)!;
      // La normale si calcola sempre dal nodo con l'id minore: la stessa curva vale in entrambi i versi.
      const [lo, hi] = e.da < e.a ? [A, B] : [B, A];
      const len = dist(lo, hi) || 1;
      const nx = -(hi.y - lo.y) / len;
      const ny = (hi.x - lo.x) / len;
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const base = (i - (group.length - 1) / 2) * 52;
      const others = [...positions].filter(([id]) => id !== e.da && id !== e.a).map(([, p]) => p);

      const candidates = [base];
      for (const step of [38, 76, 118, 170, 230]) candidates.push(base + step, base - step);

      let best: { route: Route; pen: number } | null = null;
      for (const bend of candidates) {
        const c = { x: mid.x + nx * 2 * bend, y: mid.y + ny * 2 * bend };
        const p0 = towards(A, c, NODE_R);
        const p2 = towards(B, c, NODE_R + 4);
        const pen = penalty(p0, c, p2, others, allPoints, size.width, size.height);
        const label = bezier(p0, c, p2, 0.5);
        const route: Route = { path: `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`, p0, c, p2, label };
        if (!best || pen < best.pen) best = { route, pen };
        if (pen === 0) break;
      }
      out.set(e.id, best!.route);
    });
  }
  return out;
}

/** Punti di una rotta, per i controlli. */
export function samplePoints(route: Route, steps = 40): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => bezier(route.p0, route.c, route.p2, i / steps));
}
