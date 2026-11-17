import YAML from "yaml";

/**
 * Formato dei file Writly dentro un repository GitHub.
 *
 *   writly.yaml                       manifest del progetto
 *   opere/<opera>/opera.yaml          titolo e ordine dei capitoli dell'opera
 *   opere/<opera>/capitoli/<file>.md  front-matter (id, stato) + testo Markdown
 *   dizionario.txt                    parole accettate dal controllo ortografico
 *
 * Il titolo di un capitolo vive solo in opera.yaml (unica fonte), così
 * rinominare un capitolo tocca un solo file e l'elenco si carica con una
 * sola lettura.
 */

export const FORMAT_VERSION = 1;

export const PROJECT_TYPES = ["racconto", "romanzo", "saga"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CHAPTER_STATUSES = ["bozza", "in-stesura", "scritto", "revisionato"] as const;
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
}

export interface WorkManifest {
  titolo: string;
  capitoli: ChapterEntry[];
  obiettivoParole?: number;
}

export interface ChapterMeta {
  id: string;
  stato: ChapterStatus;
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

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FormatError(`${what}: atteso un oggetto YAML`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string, what: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new FormatError(`${what}: campo «${key}» mancante o vuoto`);
  }
  return v;
}

function parseYaml(text: string, what: string): Record<string, unknown> {
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
    return {
      file: requireString(entry, "file", `${what}, capitolo ${i + 1}`),
      titolo: requireString(entry, "titolo", `${what}, capitolo ${i + 1}`),
    };
  });
  const goal = obj.obiettivoParole;
  return {
    titolo: requireString(obj, "titolo", what),
    capitoli,
    ...(typeof goal === "number" && goal > 0 ? { obiettivoParole: goal } : {}),
  };
}

export function serializeWorkManifest(w: WorkManifest): string {
  return YAML.stringify({
    titolo: w.titolo,
    ...(w.obiettivoParole ? { obiettivoParole: w.obiettivoParole } : {}),
    capitoli: w.capitoli.map((c) => ({ file: c.file, titolo: c.titolo })),
  });
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseChapter(text: string): ChapterDocument {
  const match = FRONT_MATTER.exec(text);
  if (!match) {
    // File scritto a mano senza front-matter: lo accettiamo come testo puro.
    return { meta: { id: "", stato: "bozza" }, body: text };
  }
  const obj = parseYaml(match[1], "front-matter del capitolo");
  const stato = CHAPTER_STATUSES.includes(obj.stato as ChapterStatus)
    ? (obj.stato as ChapterStatus)
    : "bozza";
  return {
    meta: { id: typeof obj.id === "string" ? obj.id : "", stato },
    body: text.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

export function serializeChapter(doc: ChapterDocument): string {
  const fm = YAML.stringify({ id: doc.meta.id, stato: doc.meta.stato }).trimEnd();
  const trimmed = doc.body.replace(/^\n+/, "");
  const body = trimmed.endsWith("\n") || trimmed === "" ? trimmed : `${trimmed}\n`;
  return `---\n${fm}\n---\n\n${body}`;
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
