import YAML from "yaml";

/**
 * Formato dei file Writly dentro un repository GitHub.
 *
 *   writly.yaml                       manifest del progetto
 *   opere/<opera>/opera.yaml          titolo, ordine dei capitoli, archi, obiettivi di pubblicazione
 *   opere/<opera>/capitoli/<file>.md  front-matter (id, stato, data di pubblicazione) + testo Markdown
 *   dizionario.txt                    parole accettate dal controllo ortografico
 *
 * Il titolo di un capitolo vive solo in opera.yaml (unica fonte), così
 * rinominare un capitolo tocca un solo file e l'elenco si carica con una
 * sola lettura.
 */

export const FORMAT_VERSION = 1;

export const PROJECT_TYPES = ["racconto", "romanzo", "saga", "webnovel"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CHAPTER_STATUSES = ["bozza", "in-stesura", "scritto", "revisionato", "pubblicato"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export interface ProjectManifest {
  writly: number;
  titolo: string;
  tipo: ProjectType;
  lingua: string;
  /** Slug delle opere, nell'ordine di lettura. */
  opere: string[];
}

export interface ChapterEntry {
  file: string;
  titolo: string;
  /** id dell'arco a cui appartiene (assente = senza arco; un id che non esiste più conta come assente). */
  arco?: string;
}

/** Un arco narrativo: un gruppo di capitoli con un inizio e una chiusura (volume, stagione, saga interna). */
export interface Arc {
  id: string;
  titolo: string;
  /** Arco concluso: nella pagina del progetto si ripiega. */
  chiuso?: boolean;
  /** Di cosa parla l'arco, in due righe. */
  sintesi?: string;
}

/** Lunghezza voluta di un capitolo, in parole (serie a puntate: es. 1.500–3.000). */
export interface WordRange {
  min: number;
  max: number;
}

export interface WorkManifest {
  titolo: string;
  capitoli: ChapterEntry[];
  obiettivoParole?: number;
  /** Di cosa parla davvero la storia, sotto la trama (es. «il prezzo della verità»). */
  tema?: string;
  /** L'idea da cui parte la storia: chi, cosa vuole, cosa glielo impedisce, cosa rischia. */
  premessa?: string;
  archi?: Arc[];
  paroleCapitolo?: WordRange;
  /** Note fisse per le piattaforme: in testa e in coda a ogni capitolo esportato per incollare. */
  notaIniziale?: string;
  notaFinale?: string;
}

/** Lunghezza massima di tema e premessa: qualche paragrafo, non una sinossi. */
export const WORK_INFO_MAX = 2000;

export interface ChapterMeta {
  id: string;
  stato: ChapterStatus;
  /** Giorno di uscita (AAAA-MM-GG), solo con stato «pubblicato»; nel futuro = programmato. */
  pubblicato?: string;
}

/** Data AAAA-MM-GG esistente nel calendario. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export interface ChapterDocument {
  meta: ChapterMeta;
  body: string;
}

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FormatError(`${what}: atteso un oggetto YAML`);
  }
  return value as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string, what: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new FormatError(`${what}: campo «${key}» mancante o vuoto`);
  }
  return v;
}

export function parseYaml(text: string, what: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = YAML.parse(text);
  } catch (err) {
    throw new FormatError(`${what}: YAML non valido (${(err as Error).message})`);
  }
  return asRecord(data, what);
}

export function parseProjectManifest(text: string): ProjectManifest {
  const what = "writly.yaml";
  const obj = parseYaml(text, what);
  const version = obj.writly;
  if (typeof version !== "number" || version < 1) {
    throw new FormatError(`${what}: campo «writly» (versione del formato) mancante`);
  }
  if (version > FORMAT_VERSION) {
    throw new FormatError(`${what}: formato v${version} più recente di questa versione di Writly`);
  }
  const tipo = obj.tipo;
  if (!PROJECT_TYPES.includes(tipo as ProjectType)) {
    throw new FormatError(`${what}: «tipo» deve essere uno tra ${PROJECT_TYPES.join(", ")}`);
  }
  const opere = obj.opere ?? [];
  if (!Array.isArray(opere) || !opere.every((o) => typeof o === "string")) {
    throw new FormatError(`${what}: «opere» deve essere un elenco di slug`);
  }
  return {
    writly: version,
    titolo: requireString(obj, "titolo", what),
    tipo: tipo as ProjectType,
    lingua: typeof obj.lingua === "string" ? obj.lingua : "it",
    opere: opere as string[],
  };
}

export function serializeProjectManifest(m: ProjectManifest): string {
  return YAML.stringify({
    writly: m.writly,
    titolo: m.titolo,
    tipo: m.tipo,
    lingua: m.lingua,
    opere: m.opere,
  });
}

export function parseWorkManifest(text: string, slug: string): WorkManifest {
  const what = `opere/${slug}/opera.yaml`;
  const obj = parseYaml(text, what);
  const raw = obj.capitoli ?? [];
  if (!Array.isArray(raw)) {
    throw new FormatError(`${what}: «capitoli» deve essere un elenco`);
  }
  const capitoli = raw.map((item, i) => {
    const entry = asRecord(item, `${what}, capitolo ${i + 1}`);
    const arco = typeof entry.arco === "string" && entry.arco.trim() ? { arco: entry.arco.trim() } : {};
    return {
      file: requireString(entry, "file", `${what}, capitolo ${i + 1}`),
      titolo: requireString(entry, "titolo", `${what}, capitolo ${i + 1}`),
      ...arco,
    };
  });
  const archi = parseArcs(obj.archi, what);
  const range = parseWordRange(obj.paroleCapitolo, what);
  const goal = obj.obiettivoParole;
  const info = (key: "tema" | "premessa" | "notaIniziale" | "notaFinale") => {
    const v = obj[key];
    if (v === undefined || v === null) return {};
    if (typeof v !== "string") throw new FormatError(`${what}: «${key}» deve essere un testo`);
    const t = v.trim().slice(0, WORK_INFO_MAX);
    return t ? { [key]: t } : {};
  };
  return {
    titolo: requireString(obj, "titolo", what),
    capitoli,
    ...(typeof goal === "number" && goal > 0 ? { obiettivoParole: goal } : {}),
    ...info("tema"),
    ...info("premessa"),
    ...(archi.length ? { archi } : {}),
    ...(range ? { paroleCapitolo: range } : {}),
    ...info("notaIniziale"),
    ...info("notaFinale"),
  };
}

function parseArcs(raw: unknown, what: string): Arc[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new FormatError(`${what}: «archi» deve essere un elenco`);
  const seen = new Set<string>();
  return raw.map((item, i) => {
    const entry = asRecord(item, `${what}, arco ${i + 1}`);
    const id = requireString(entry, "id", `${what}, arco ${i + 1}`);
    if (seen.has(id)) throw new FormatError(`${what}: due archi con lo stesso id «${id}»`);
    seen.add(id);
    const sintesi = typeof entry.sintesi === "string" ? entry.sintesi.trim().slice(0, WORK_INFO_MAX) : "";
    return {
      id,
      titolo: requireString(entry, "titolo", `${what}, arco ${i + 1}`),
      ...(entry.chiuso === true ? { chiuso: true } : {}),
      ...(sintesi ? { sintesi } : {}),
    };
  });
}

function parseWordRange(raw: unknown, what: string): WordRange | null {
  if (raw === undefined || raw === null) return null;
  const obj = asRecord(raw, `${what}: «paroleCapitolo»`);
  const { min, max } = obj;
  if (typeof min !== "number" || typeof max !== "number" || !(min > 0) || max < min) {
    throw new FormatError(`${what}: «paroleCapitolo» vuole «min» e «max» in parole, con min maggiore di zero e max non inferiore`);
  }
  return { min: Math.round(min), max: Math.round(max) };
}

export function serializeWorkManifest(w: WorkManifest): string {
  return YAML.stringify({
    titolo: w.titolo,
    ...(w.obiettivoParole ? { obiettivoParole: w.obiettivoParole } : {}),
    ...(w.tema ? { tema: w.tema } : {}),
    ...(w.premessa ? { premessa: w.premessa } : {}),
    ...(w.paroleCapitolo ? { paroleCapitolo: { min: w.paroleCapitolo.min, max: w.paroleCapitolo.max } } : {}),
    ...(w.notaIniziale ? { notaIniziale: w.notaIniziale } : {}),
    ...(w.notaFinale ? { notaFinale: w.notaFinale } : {}),
    ...(w.archi?.length ? { archi: w.archi.map((a) => ({ id: a.id, titolo: a.titolo, ...(a.chiuso ? { chiuso: true } : {}), ...(a.sintesi ? { sintesi: a.sintesi } : {}) })) } : {}),
    capitoli: w.capitoli.map((c) => ({ file: c.file, titolo: c.titolo, ...(c.arco ? { arco: c.arco } : {}) })),
  });
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Separa il front-matter YAML dal testo Markdown; `data` è null se il file non ne ha. */
export function splitFrontMatter(text: string, what: string): { data: Record<string, unknown> | null; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: null, body: text };
  return { data: parseYaml(match[1], what), body: text.slice(match[0].length).replace(/^\r?\n/, "") };
}

/** Front-matter + riga vuota + testo, con a capo finale. */
export function joinFrontMatter(data: Record<string, unknown>, body: string): string {
  const fm = YAML.stringify(data).trimEnd();
  const trimmed = body.replace(/^\n+/, "");
  const text = trimmed.endsWith("\n") || trimmed === "" ? trimmed : `${trimmed}\n`;
  return `---\n${fm}\n---\n\n${text}`;
}

export function parseChapter(text: string): ChapterDocument {
  const { data: obj, body } = splitFrontMatter(text, "front-matter del capitolo");
  // File scritto a mano senza front-matter: lo accettiamo come testo puro.
  if (!obj) return { meta: { id: "", stato: "bozza" }, body };
  const stato = CHAPTER_STATUSES.includes(obj.stato as ChapterStatus)
    ? (obj.stato as ChapterStatus)
    : "bozza";
  // YAML 1.1 legge le date come oggetti Date: le riportiamo a AAAA-MM-GG.
  const when = obj.pubblicato instanceof Date && !Number.isNaN(obj.pubblicato.getTime()) ? obj.pubblicato.toISOString().slice(0, 10) : obj.pubblicato;
  const pubblicato = stato === "pubblicato" && isIsoDate(when) ? { pubblicato: when } : {};
  return { meta: { id: typeof obj.id === "string" ? obj.id : "", stato, ...pubblicato }, body };
}

export function serializeChapter(doc: ChapterDocument): string {
  const published = doc.meta.stato === "pubblicato" && isIsoDate(doc.meta.pubblicato) ? { pubblicato: doc.meta.pubblicato } : {};
  return joinFrontMatter({ id: doc.meta.id, stato: doc.meta.stato, ...published }, doc.body);
}

export function parseDictionary(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => w !== "" && !w.startsWith("#"));
}

export function serializeDictionary(words: Iterable<string>): string {
  const unique = Array.from(new Set(words)).sort((a, b) => a.localeCompare(b, "it"));
  return `# Parole accettate dal controllo ortografico di Writly, una per riga.\n${unique.join("\n")}\n`;
}
