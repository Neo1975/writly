import YAML from "yaml";
import { FormatError, joinFrontMatter, parseYaml, splitFrontMatter } from "./format";
import { LONG, compact, idList, isId, list, oneOf, record, requiredText, text, textList } from "./normalize";

/**
 * Appunti e glossario.
 *
 *   appunti/<slug>.md    front-matter (titolo, tipo, tag, collegamenti…) + testo Markdown
 *                        — nel repository del progetto, oppure in writly-libreria
 *                        per gli appunti globali
 *   glossario.yaml       termini del progetto (entrano nel dizionario ortografico)
 */

export const NOTE_TYPES = ["idea", "spunto", "ricerca", "citazione", "lista"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  idea: "Idea",
  spunto: "Spunto",
  ricerca: "Ricerca",
  citazione: "Citazione",
  lista: "Lista",
};

const REPO_REF = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export interface Note {
  id: string;
  titolo: string;
  tipo: NoteType;
  tag: string[];
  /** Da smistare (catturato al volo). */
  inbox: boolean;
  /** Data di creazione, AAAA-MM-GG. */
  creato: string;
  /** Solo appunti globali: progetti collegati ("autore/repo"). */
  progetti: string[];
  /** Solo appunti di progetto: id di personaggi, voci del mondo, scene. */
  collegamenti: string[];
  testo: string;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyNote(titolo = ""): Note {
  return { id: "nuovo", titolo, tipo: "idea", tag: [], inbox: false, creato: today(), progetti: [], collegamenti: [], testo: "" };
}

export function normalizeNote(value: unknown, what = "appunto"): Note {
  const obj = record(value, what);
  if (!isId(obj.id)) throw new FormatError(`${what}: «id» mancante o non valido`);
  const creato = text(obj, "creato", what, 40);
  const progetti = textList(obj.progetti, `${what}, progetti`).filter((p) => {
    if (!REPO_REF.test(p)) throw new FormatError(`${what}: progetto «${p}» non valido`);
    return true;
  });
  return {
    id: obj.id,
    titolo: requiredText(obj, "titolo", what),
    tipo: oneOf(obj.tipo, NOTE_TYPES, "idea"),
    tag: textList(obj.tag, `${what}, tag`, 60).map((t) => t.replace(/^#/, "")),
    inbox: obj.inbox === true,
    creato: /^\d{4}-\d{2}-\d{2}/.test(creato) ? creato.slice(0, 10) : "",
    progetti,
    collegamenti: idList(obj.collegamenti, `${what}, collegamenti`),
    testo: text(obj, "testo", what, LONG * 10),
  };
}

export function parseNote(source: string, path: string): Note {
  const { data, body } = splitFrontMatter(source, path);
  if (!data) throw new FormatError(`${path}: manca il front-matter dell'appunto`);
  return normalizeNote({ ...data, testo: body.trimEnd() }, path);
}

export function serializeNote(n: Note): string {
  return joinFrontMatter(
    compact({
      id: n.id,
      titolo: n.titolo,
      tipo: n.tipo,
      tag: n.tag,
      inbox: n.inbox || null,
      creato: n.creato,
      progetti: n.progetti,
      collegamenti: n.collegamenti,
    }),
    n.testo,
  );
}

// ——— Collegamenti [[Titolo]] e ricerca ———

const WIKI_LINK = /\[\[([^\[\]\n|]{1,200})(?:\|[^\[\]\n]{0,200})?\]\]/g;

/** Titoli citati con [[Titolo]] (o [[Titolo|testo]]), senza ripetizioni. */
export function wikiLinks(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(WIKI_LINK)) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Appunto con quel titolo (senza badare a maiuscole e accenti). */
export function findByTitle<T extends { titolo: string }>(notes: T[], title: string): T | undefined {
  const f = fold(title.trim());
  return notes.find((n) => fold(n.titolo) === f);
}

/** Appunti che contengono [[titolo di `target`]]. */
export function backlinks<T extends { titolo: string; testo: string }>(notes: T[], target: { titolo: string }): T[] {
  const f = fold(target.titolo);
  return notes.filter((n) => n !== target && wikiLinks(n.testo).some((t) => fold(t) === f));
}

/** Ricerca full-text: tutte le parole della ricerca devono comparire in titolo, testo o tag. */
export function searchNotes<T extends Pick<Note, "titolo" | "testo" | "tag">>(notes: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes;
  return notes.filter((n) => {
    const hay = fold(`${n.titolo}\n${n.testo}\n${n.tag.map((t) => `#${t}`).join(" ")}`);
    return words.every((w) => hay.includes(w));
  });
}

// ——— Glossario ———

export const GLOSSARY_CATEGORIES = ["lingua inventata", "luogo", "gergo", "tecnologia", "titolo o carica", "altro"];

export interface GlossaryTerm {
  id: string;
  termine: string;
  definizione: string;
  categoria: string;
  note: string;
}

export function normalizeGlossary(value: unknown, what = "glossario.yaml"): GlossaryTerm[] {
  const ids = new Set<string>();
  return list(value, what, 5000).map((t, i) => {
    const label = `${what}, termine ${i + 1}`;
    const obj = record(t, label);
    if (!isId(obj.id) || ids.has(obj.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    ids.add(obj.id);
    return {
      id: obj.id,
      termine: requiredText(obj, "termine", label),
      definizione: text(obj, "definizione", label, 4000),
      categoria: text(obj, "categoria", label),
      note: text(obj, "note", label, 4000),
    };
  });
}

export function parseGlossary(source: string): GlossaryTerm[] {
  return normalizeGlossary(parseYaml(source, "glossario.yaml").termini);
}

export function serializeGlossary(items: GlossaryTerm[]): string {
  const sorted = [...items].sort((a, b) => a.termine.localeCompare(b.termine, "it"));
  return YAML.stringify({ termini: sorted.map((t) => compact({ ...t })) });
}
