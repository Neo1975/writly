import YAML from "yaml";
import { FormatError, parseYaml } from "./format";
import { LONG, isId, list, oneOf, record, requiredText, text } from "./normalize";

/**
 * Commenti ai capitoli.
 *
 *   opere/<opera>/commenti/<capitolo>.yaml
 *
 * Un commento è ancorato alla frase che cita (`citazione`, più qualche parola
 * prima e dopo per distinguere le ripetizioni), non a segni dentro il testo:
 * il Markdown del capitolo resta pulito per l'editor, il PDF e gli ebook. Se
 * la frase non c'è più, il commento resta visibile come «passaggio non più nel
 * testo». Scrivono qui sia l'autore (dall'app) sia il mentore AI (Claude Code
 * sul repository, con `tipo: mentore`).
 */

export const COMMENT_TYPES = ["autore", "mentore"] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];

export interface CommentReply {
  tipo: CommentType;
  autore: string;
  creato: string;
  testo: string;
}

export interface ChapterComment {
  id: string;
  tipo: CommentType;
  autore: string;
  /** Data e ora ISO. */
  creato: string;
  /** Aspetto narrativo (es. «punto di vista», «ritmo»), facoltativo. */
  categoria: string;
  /** Il testo citato così come si legge; vuoto = commento al capitolo intero. */
  citazione: string;
  prima: string;
  dopo: string;
  testo: string;
  risolto: boolean;
  risposte: CommentReply[];
}

const QUOTE = 2000;
const CONTEXT = 120;

function isoOrEmpty(v: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : "";
}

function normalizeReply(value: unknown, what: string): CommentReply {
  const obj = record(value, what);
  return {
    tipo: oneOf(obj.tipo, COMMENT_TYPES, "autore"),
    autore: text(obj, "autore", what),
    creato: isoOrEmpty(text(obj, "creato", what, 40)),
    testo: requiredText(obj, "testo", what, LONG),
  };
}

export function normalizeComment(value: unknown, what = "commento"): ChapterComment {
  const obj = record(value, what);
  if (!isId(obj.id)) throw new FormatError(`${what}: «id» mancante o non valido`);
  return {
    id: obj.id,
    tipo: oneOf(obj.tipo, COMMENT_TYPES, "autore"),
    autore: text(obj, "autore", what),
    creato: isoOrEmpty(text(obj, "creato", what, 40)),
    categoria: text(obj, "categoria", what, 60),
    citazione: text(obj, "citazione", what, QUOTE),
    prima: text(obj, "prima", what, CONTEXT),
    dopo: text(obj, "dopo", what, CONTEXT),
    testo: requiredText(obj, "testo", what, LONG),
    risolto: obj.risolto === true,
    risposte: list(obj.risposte, `${what}, risposte`, 200).map((r, i) => normalizeReply(r, `${what}, risposta ${i + 1}`)),
  };
}

/** Legge il file dei commenti; i commenti illeggibili si saltano e si segnalano, senza perdere gli altri. */
export function parseComments(source: string, path: string): { commenti: ChapterComment[]; errori: string[] } {
  const obj = parseYaml(source, path);
  const errori: string[] = [];
  const seen = new Set<string>();
  const commenti: ChapterComment[] = [];
  list(obj.commenti, `${path}: commenti`).forEach((item, i) => {
    try {
      const c = normalizeComment(item, `${path}, commento ${i + 1}`);
      if (seen.has(c.id)) throw new FormatError(`${path}: id «${c.id}» ripetuto`);
      seen.add(c.id);
      commenti.push(c);
    } catch (err) {
      errori.push((err as Error).message);
    }
  });
  return { commenti, errori };
}

export function serializeComments(commenti: ChapterComment[]): string {
  const items = commenti.map((c) => {
    const out: Record<string, unknown> = { id: c.id, tipo: c.tipo, autore: c.autore, creato: c.creato };
    if (c.categoria) out.categoria = c.categoria;
    if (c.citazione) {
      out.citazione = c.citazione;
      if (c.prima) out.prima = c.prima;
      if (c.dopo) out.dopo = c.dopo;
    }
    out.testo = c.testo;
    out.risolto = c.risolto;
    if (c.risposte.length) out.risposte = c.risposte;
    return out;
  });
  return `# Commenti al capitolo (Writly). Ogni commento cita il passaggio a cui si riferisce.\n${YAML.stringify({ commenti: items }, { lineWidth: 0 })}`;
}

// ——— Ancoraggio ———

/**
 * Testo confrontabile: spazi compressi, apostrofi e virgolette uniformati,
 * e (per le citazioni) senza i segni Markdown di enfasi e gli escape, che chi
 * cita copiando dal file .md può portarsi dietro. `map[i]` è la posizione del
 * carattere i nel testo originale.
 */
export function comparable(source: string, { dropMarkup = false } = {}): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < source.length; i++) {
    let c = source[i];
    if (dropMarkup && (c === "*" || c === "_" || c === "\\")) continue;
    if (/\s/u.test(c)) {
      if (space || out === "") continue;
      space = true;
      c = " ";
    } else {
      space = false;
      if (c === "’" || c === "‘") c = "'";
      else if (c === "“" || c === "”" || c === "«" || c === "»") c = '"';
    }
    out += c;
    map.push(i);
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { text: out, map };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Dove si trova oggi il passaggio citato: inizio e fine nel testo, o null se
 * la citazione è vuota o non c'è più. Con più occorrenze vince quella il cui
 * contesto (prima/dopo) somiglia di più.
 */
export function anchorComment(source: string, c: Pick<ChapterComment, "citazione" | "prima" | "dopo">): { start: number; end: number } | null {
  const quote = comparable(c.citazione, { dropMarkup: true }).text;
  if (!quote) return null;
  const doc = comparable(source);
  const find = (hay: string, needle: string) => {
    const hits: number[] = [];
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) hits.push(i);
    return hits;
  };
  let hay = doc.text;
  let needle = quote;
  let hits = find(hay, needle);
  if (hits.length === 0) {
    hay = hay.toLowerCase();
    needle = needle.toLowerCase();
    hits = find(hay, needle);
  }
  if (hits.length === 0) return null;
  let best = hits[0];
  if (hits.length > 1) {
    const before = comparable(c.prima, { dropMarkup: true }).text.toLowerCase();
    const after = comparable(c.dopo, { dropMarkup: true }).text.toLowerCase();
    const low = hay.toLowerCase();
    let score = -1;
    for (const h of hits) {
      const s = commonSuffix(low.slice(0, h).trimEnd(), before.trimEnd()) + commonPrefix(low.slice(h + needle.length).trimStart(), after.trimStart());
      if (s > score) {
        score = s;
        best = h;
      }
    }
  }
  return { start: doc.map[best], end: doc.map[best + needle.length - 1] + 1 };
}

/** Il contesto da salvare con una nuova citazione: qualche parola prima e dopo. */
export function quoteContext(source: string, start: number, end: number, size = 40): { prima: string; dopo: string } {
  const squash = (s: string) => s.replace(/\s+/g, " ");
  return { prima: squash(source.slice(Math.max(0, start - size), start)).trimStart(), dopo: squash(source.slice(end, end + size)).trimEnd() };
}
