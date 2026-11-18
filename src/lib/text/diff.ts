/**
 * Confronto tra versioni di un testo, pensato per la prosa:
 * - a parole (non a righe): ogni parola, spazio o segno di punteggiatura è un token;
 * - per paragrafi: allineamento delle versioni per mostrare l'evoluzione di un
 *   paragrafo, ripristinarne uno solo o unire due versioni scegliendo blocco per blocco.
 */

export type DiffOp = { type: "equal" | "insert" | "delete"; text: string };

const TOKEN = /\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;
const WORD = /[\p{L}\p{N}]/u;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/**
 * Diff di Myers (O((N+M)·D)) su due sequenze di token, dopo aver tolto prefisso
 * e suffisso comuni. Restituisce le operazioni nell'ordine del testo.
 */
export function diffTokens(a: string[], b: string[]): DiffOp[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  push("equal", a.slice(0, start).join(""));
  for (const op of myers(a.slice(start, endA), b.slice(start, endB))) push(op.type, op.text);
  push("equal", a.slice(endA).join(""));
  return out;
}

function myers(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m ? [{ type: "insert", text: b.join("") }] : [];
  if (m === 0) return [{ type: "delete", text: a.join("") }];
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  // trace[d] = stato di v prima del passo d.
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Ricostruzione all'indietro, dal passo finale al primo.
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const prev = trace[d];
    const k = x - y;
    let prevK: number;
    if (d === 0) prevK = 0;
    else prevK = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : prev[offset + prevK];
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: "equal", text: a[x - 1] });
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === prevX) ops.push({ type: "insert", text: b[prevY] });
    else ops.push({ type: "delete", text: a[prevX] });
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

/** Differenze a parole tra due testi. */
export function diffWords(a: string, b: string): DiffOp[] {
  return diffTokens(tokenize(a), tokenize(b));
}

/** Parole aggiunte e tolte (spazi e punteggiatura non contano). */
export function diffStats(ops: DiffOp[]): { aggiunte: number; rimosse: number } {
  let aggiunte = 0;
  let rimosse = 0;
  for (const op of ops) {
    if (op.type === "equal") continue;
    const count = tokenize(op.text).filter((t) => WORD.test(t)).length;
    if (op.type === "insert") aggiunte += count;
    else rimosse += count;
  }
  return { aggiunte, rimosse };
}

/** Ricostruisce i due testi da un diff (per i test e i controlli). */
export function sides(ops: DiffOp[]): { a: string; b: string } {
  let a = "";
  let b = "";
  for (const op of ops) {
    if (op.type !== "insert") a += op.text;
    if (op.type !== "delete") b += op.text;
  }
  return { a, b };
}

// ——— Paragrafi ———

/** Paragrafi di un testo Markdown (separati da righe vuote). */
export function splitParagraphs(md: string): string[] {
  return md
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinParagraphs(paras: string[]): string {
  return paras.join("\n\n") + (paras.length ? "\n" : "");
}

function words(p: string): string[] {
  return tokenize(p.toLowerCase()).filter((t) => WORD.test(t));
}

/** Somiglianza tra due paragrafi (coefficiente di Dice sulle parole, 0–1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wb) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      common++;
      counts.set(w, c - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

export interface ParagraphPair {
  /** Indice nella prima versione, null se il paragrafo è nuovo. */
  a: number | null;
  /** Indice nella seconda versione, null se il paragrafo è stato tolto. */
  b: number | null;
}

const SIMILAR = 0.5;

/**
 * Allinea i paragrafi di due versioni: prima quelli identici (sottosequenza
 * comune più lunga), poi, negli intervalli rimasti, quelli abbastanza simili
 * (riscritti), mantenendo l'ordine.
 */
export function alignParagraphs(a: string[], b: string[]): ParagraphPair[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  anchors.push([n, m]);

  const out: ParagraphPair[] = [];
  let pa = 0;
  let pb = 0;
  for (const [ea, eb] of anchors) {
    out.push(...alignGap(a, b, pa, ea, pb, eb));
    if (ea < n) out.push({ a: ea, b: eb });
    pa = ea + 1;
    pb = eb + 1;
  }
  return out;
}

/** Negli intervalli tra paragrafi identici, abbina in ordine quelli simili. */
function alignGap(a: string[], b: string[], fromA: number, toA: number, fromB: number, toB: number): ParagraphPair[] {
  const out: ParagraphPair[] = [];
  let j = fromB;
  for (let i = fromA; i < toA; i++) {
    let best = -1;
    let bestScore = SIMILAR;
    for (let k = j; k < toB; k++) {
      const s = similarity(a[i], b[k]);
      if (s >= bestScore) {
        best = k;
        bestScore = s;
        if (s === 1) break;
      }
    }
    if (best < 0) {
      out.push({ a: i, b: null });
      continue;
    }
    for (; j < best; j++) out.push({ a: null, b: j });
    out.push({ a: i, b: best });
    j = best + 1;
  }
  for (; j < toB; j++) out.push({ a: null, b: j });
  return out;
}

/**
 * Ripristina un solo paragrafo di una versione precedente (`old[oldIndex]`) nel
 * testo attuale: sostituisce il paragrafo corrispondente, oppure, se nel testo
 * attuale non c'è più, lo reinserisce dopo il paragrafo precedente che c'è ancora.
 */
export function restoreParagraph(current: string[], old: string[], oldIndex: number): string[] {
  const pairs = alignParagraphs(old, current);
  const pair = pairs.find((p) => p.a === oldIndex);
  if (pair && pair.b !== null) return current.map((p, i) => (i === pair.b ? old[oldIndex] : p));
  let insertAt = 0;
  for (const p of pairs) {
    if (p.a !== null && p.a < oldIndex && p.b !== null) insertAt = p.b + 1;
  }
  return [...current.slice(0, insertAt), old[oldIndex], ...current.slice(insertAt)];
}

/**
 * Evoluzione di un paragrafo: dato il paragrafo `index` dell'ultima versione,
 * risale versione per versione e restituisce, per ognuna (dalla più vecchia
 * alla più recente), il paragrafo corrispondente (null dove non esisteva).
 */
export function paragraphHistory(versions: string[][], index: number): (string | null)[] {
  const out: (string | null)[] = new Array(versions.length).fill(null);
  let cur: number | null = index;
  for (let v = versions.length - 1; v >= 0 && cur !== null; v--) {
    out[v] = versions[v][cur] ?? null;
    if (v === 0) break;
    const target: number = cur;
    cur = alignParagraphs(versions[v - 1], versions[v]).find((p) => p.b === target)?.a ?? null;
  }
  return out;
}

export type Chunk = { kind: "same"; text: string[] } | { kind: "diff"; mine: string[]; theirs: string[] };

/** Blocchi uguali e diversi tra due versioni (per unire scegliendo blocco per blocco). */
export function paragraphChunks(mine: string[], theirs: string[]): Chunk[] {
  const out: Chunk[] = [];
  for (const p of alignParagraphs(mine, theirs)) {
    const m = p.a === null ? null : mine[p.a];
    const t = p.b === null ? null : theirs[p.b];
    const last = out[out.length - 1];
    if (m !== null && m === t) {
      if (last?.kind === "same") last.text.push(m);
      else out.push({ kind: "same", text: [m] });
      continue;
    }
    let cur: Extract<Chunk, { kind: "diff" }>;
    if (last?.kind === "diff") cur = last;
    else {
      cur = { kind: "diff", mine: [], theirs: [] };
      out.push(cur);
    }
    if (m !== null) cur.mine.push(m);
    if (t !== null) cur.theirs.push(t);
  }
  return out;
}

export type ChunkChoice = "mine" | "theirs" | "both";

/** Testo unito: per ogni blocco diverso la scelta indicata (predefinita: la mia). */
export function applyChoices(chunks: Chunk[], choices: ChunkChoice[]): string[] {
  const out: string[] = [];
  let d = 0;
  for (const c of chunks) {
    if (c.kind === "same") {
      out.push(...c.text);
      continue;
    }
    const choice = choices[d++] ?? "mine";
    if (choice === "mine" || choice === "both") out.push(...c.mine);
    if (choice === "theirs" || choice === "both") out.push(...c.theirs);
  }
  return out;
}
