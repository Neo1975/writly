import {
  DEFAULT_CATEGORIES,
  normalizeCategories,
  normalizeCharacter,
  normalizeRelations,
  normalizeWorldEntry,
  parseCategories,
  parseCharacter,
  parseRelations,
  parseWorldEntry,
  serializeCategories,
  serializeCharacter,
  serializeRelations,
  serializeWorldEntry,
  type Character,
  type Relation,
  type WorldCategory,
  type WorldEntry,
} from "@/lib/project/entities";
import { record } from "@/lib/project/normalize";
import {
  normalizeGlossary,
  normalizeNote,
  parseGlossary,
  parseNote,
  serializeGlossary,
  serializeNote,
  today,
  type GlossaryTerm,
  type Note,
} from "@/lib/project/notes";
import {
  CATEGORIES_PATH,
  CHRONOLOGY_PATH,
  GLOSSARY_PATH,
  MAPS_DIR,
  RELATIONS_PATH,
  RULES_PATH,
  characterPath,
  isCharacterPath,
  isNotePath,
  isSlug,
  mapPath,
  notePath,
  parsePdfTemplatePath,
  pdfTemplatePath,
  parseMapPath,
  parseWorldEntryPath,
  worldEntryPath,
} from "@/lib/project/paths";
import { shortId, slugify, uniqueSlug } from "@/lib/project/slug";
import {
  EMPTY_CHRONOLOGY,
  MAX_MAP_BYTES,
  normalizeChronology,
  normalizeMap,
  normalizeRules,
  parseChronology,
  parseMap,
  parseRules,
  serializeChronology,
  serializeMap,
  serializeRules,
  sniffImage,
  type Chronology,
  type WorldMap,
  type WorldRule,
} from "@/lib/project/world";
import { BUILTIN_PDF_TEMPLATES, normalizePdfTemplate, parsePdfTemplate, serializePdfTemplate, type PdfTemplate } from "@/lib/export/template";
import { ApiError } from "./errors";
import { deleteFile, listTree, readBlobs, readText, writeBytes, writeText, type GitHub } from "./github";

/**
 * Schede di progetto: personaggi, relazioni, mondo (categorie, voci, regole,
 * cronologia, mappe), appunti di progetto e glossario.
 * Si caricano tutte insieme (un albero Git + un blob per file): servono sia
 * alle pagine Personaggi e Mondo sia all'editor, per il riconoscimento nel testo.
 */

export interface Sheet<T> {
  path: string;
  sha: string;
  data: T;
}

export interface WorldSheet extends Sheet<WorldEntry> {
  categoria: string;
}

export interface SheetsData {
  personaggi: Sheet<Character>[];
  voci: WorldSheet[];
  relazioni: { sha: string | null; items: Relation[] };
  categorie: { sha: string | null; items: WorldCategory[] };
  regole: { sha: string | null; items: WorldRule[] };
  cronologia: { sha: string | null; data: Chronology };
  mappe: Sheet<WorldMap>[];
  appunti: Sheet<Note>[];
  glossario: { sha: string | null; items: GlossaryTerm[] };
  templatePdf: Sheet<PdfTemplate>[];
  /** File presenti ma illeggibili: li segnaliamo invece di bloccare tutto. */
  errori: { path: string; message: string }[];
}

/** Appunti dal più recente; a parità di data, per titolo. */
export const newestFirst = (a: { data: Note }, b: { data: Note }) =>
  b.data.creato.localeCompare(a.data.creato) || a.data.titolo.localeCompare(b.data.titolo, "it");

const byName = (a: { data: { nome: string } }, b: { data: { nome: string } }) => a.data.nome.localeCompare(b.data.nome, "it");

export async function loadSheets(gh: GitHub, owner: string, repo: string): Promise<SheetsData> {
  const tree = await listTree(gh, owner, repo);
  const singles = new Set([RELATIONS_PATH, CATEGORIES_PATH, RULES_PATH, CHRONOLOGY_PATH, GLOSSARY_PATH]);
  const wanted = tree.filter(
    (e) => singles.has(e.path) || isCharacterPath(e.path) || parseWorldEntryPath(e.path) || parseMapPath(e.path) || isNotePath(e.path) || parsePdfTemplatePath(e.path),
  );
  const texts = await readBlobs(gh, owner, repo, wanted);
  const out: SheetsData = {
    personaggi: [],
    voci: [],
    relazioni: { sha: null, items: [] },
    categorie: { sha: null, items: DEFAULT_CATEGORIES },
    regole: { sha: null, items: [] },
    cronologia: { sha: null, data: EMPTY_CHRONOLOGY },
    mappe: [],
    appunti: [],
    glossario: { sha: null, items: [] },
    templatePdf: [],
    errori: [],
  };
  wanted.forEach((e, i) => {
    try {
      if (e.path === RELATIONS_PATH) out.relazioni = { sha: e.sha, items: parseRelations(texts[i]) };
      else if (e.path === CATEGORIES_PATH) out.categorie = { sha: e.sha, items: parseCategories(texts[i]) };
      else if (e.path === RULES_PATH) out.regole = { sha: e.sha, items: parseRules(texts[i]) };
      else if (e.path === CHRONOLOGY_PATH) out.cronologia = { sha: e.sha, data: parseChronology(texts[i]) };
      else if (e.path === GLOSSARY_PATH) out.glossario = { sha: e.sha, items: parseGlossary(texts[i]) };
      else if (parseMapPath(e.path)) out.mappe.push({ path: e.path, sha: e.sha, data: parseMap(texts[i], e.path) });
      else if (parsePdfTemplatePath(e.path)) out.templatePdf.push({ path: e.path, sha: e.sha, data: parsePdfTemplate(texts[i], parsePdfTemplatePath(e.path)!) });
      else if (isNotePath(e.path)) out.appunti.push({ path: e.path, sha: e.sha, data: parseNote(texts[i], e.path) });
      else if (isCharacterPath(e.path)) out.personaggi.push({ path: e.path, sha: e.sha, data: parseCharacter(texts[i], e.path) });
      else {
        const loc = parseWorldEntryPath(e.path)!;
        out.voci.push({ path: e.path, sha: e.sha, categoria: loc.category, data: parseWorldEntry(texts[i], e.path) });
      }
    } catch (err) {
      out.errori.push({ path: e.path, message: (err as Error).message });
    }
  });
  out.personaggi.sort(byName);
  out.voci.sort(byName);
  out.mappe.sort((a, b) => a.data.nome.localeCompare(b.data.nome, "it"));
  out.appunti.sort(newestFirst);
  return out;
}

function withId(data: unknown, isNew: boolean): Record<string, unknown> {
  const obj = record(data, "scheda");
  return isNew ? { ...obj, id: shortId() } : obj;
}

async function takenSlugs(gh: GitHub, owner: string, repo: string, prefix: string): Promise<string[]> {
  return (await listTree(gh, owner, repo))
    .filter((e) => e.path.startsWith(prefix) && e.path.endsWith(".md") && !e.path.slice(prefix.length).includes("/"))
    .map((e) => e.path.slice(prefix.length, -3));
}

/** Crea (senza `path`) o aggiorna (con `path` e `sha`) una scheda personaggio. */
export async function saveCharacter(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; data: unknown },
): Promise<Sheet<Character>> {
  const isNew = !args.path;
  const data = normalizeCharacter(withId(args.data, isNew));
  let path = args.path;
  if (path) {
    if (!isCharacterPath(path) || !args.sha) throw new ApiError(400, "Scheda non valida.");
  } else {
    path = characterPath(uniqueSlug(slugify(data.nome), await takenSlugs(gh, owner, repo, "personaggi/")));
  }
  const sha = await writeText(gh, {
    owner,
    repo,
    path,
    text: serializeCharacter(data),
    message: isNew ? `Nuovo personaggio: ${data.nome}` : `Personaggio ${data.nome}: aggiorna la scheda`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { path, sha, data };
}

export async function saveWorldEntry(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; categoria?: string; data: unknown },
): Promise<WorldSheet> {
  const isNew = !args.path;
  const data = normalizeWorldEntry(withId(args.data, isNew));
  let path = args.path;
  let categoria: string;
  if (path) {
    const loc = parseWorldEntryPath(path);
    if (!loc || !args.sha) throw new ApiError(400, "Voce non valida.");
    categoria = loc.category;
  } else {
    if (!args.categoria || !isSlug(args.categoria)) throw new ApiError(400, "Categoria non valida.");
    categoria = args.categoria;
    path = worldEntryPath(categoria, uniqueSlug(slugify(data.nome), await takenSlugs(gh, owner, repo, `mondo/${categoria}/`)));
  }
  const sha = await writeText(gh, {
    owner,
    repo,
    path,
    text: serializeWorldEntry(data),
    message: isNew ? `Mondo: nuova voce «${data.nome}»` : `Mondo: aggiorna «${data.nome}»`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { path, sha, categoria, data };
}

export async function saveRelations(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { sha: string | null; items: unknown; message?: string },
): Promise<{ sha: string; items: Relation[] }> {
  const items = normalizeRelations(args.items);
  const sha = await writeText(gh, {
    owner,
    repo,
    path: RELATIONS_PATH,
    text: serializeRelations(items),
    message: args.message ?? "Aggiorna le relazioni tra personaggi",
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { sha, items };
}

export async function saveCategories(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { sha: string | null; items: unknown },
): Promise<{ sha: string; items: WorldCategory[] }> {
  const items = normalizeCategories(args.items);
  if (items.length === 0) throw new ApiError(400, "Serve almeno una categoria.");
  const sha = await writeText(gh, {
    owner,
    repo,
    path: CATEGORIES_PATH,
    text: serializeCategories(items),
    message: "Mondo: aggiorna categorie e campi",
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { sha, items };
}

/**
 * Elimina una scheda. Per un personaggio toglie anche le sue relazioni; gli
 * altri riferimenti (scene, collegamenti) restano e l'interfaccia li mostra
 * come «scheda eliminata», così nulla si perde in silenzio.
 */
export async function deleteSheet(gh: GitHub, owner: string, repo: string, args: { path: string; sha: string; id?: string }): Promise<void> {
  const isCharacter = isCharacterPath(args.path);
  const mapSlug = parseMapPath(args.path);
  if (!isCharacter && !parseWorldEntryPath(args.path) && !isNotePath(args.path) && !mapSlug && !parsePdfTemplatePath(args.path)) throw new ApiError(400, "Percorso non consentito.");
  // Per una mappa eliminiamo anche la sua immagine (dopo il file della mappa, che ha lo sha controllato).
  const image = mapSlug ? (await readText(gh, owner, repo, args.path).then((f) => (f ? parseMap(f.text, args.path).immagine : ""))) : "";
  await deleteFile(gh, { owner, repo, path: args.path, sha: args.sha, message: `Elimina ${args.path}` });
  if (image) {
    const entry = (await listTree(gh, owner, repo)).find((e) => e.path === image);
    if (entry) await deleteFile(gh, { owner, repo, path: image, sha: entry.sha, message: `Elimina l'immagine ${image}` });
  }
  if (isCharacter && args.id) {
    const file = await readText(gh, owner, repo, RELATIONS_PATH);
    if (!file) return;
    const items = parseRelations(file.text);
    const kept = items.filter((r) => r.da !== args.id && r.a !== args.id);
    if (kept.length !== items.length) {
      await saveRelations(gh, owner, repo, { sha: file.sha, items: kept, message: "Relazioni: toglie quelle del personaggio eliminato" });
    }
  }
}

/** File YAML unico (regole, cronologia, glossario): scrittura con sha, creazione se manca. */
async function saveSingle(gh: GitHub, owner: string, repo: string, path: string, textValue: string, sha: string | null, message: string) {
  return writeText(gh, { owner, repo, path, text: textValue, message, ...(sha ? { sha } : {}) });
}

export async function saveRules(gh: GitHub, owner: string, repo: string, args: { sha: string | null; items: unknown }) {
  const items = normalizeRules(args.items);
  const sha = await saveSingle(gh, owner, repo, RULES_PATH, serializeRules(items), args.sha, "Mondo: aggiorna le regole");
  return { sha, items };
}

export async function saveChronology(gh: GitHub, owner: string, repo: string, args: { sha: string | null; data: unknown }) {
  const data = normalizeChronology(args.data);
  const sha = await saveSingle(gh, owner, repo, CHRONOLOGY_PATH, serializeChronology(data), args.sha, "Mondo: aggiorna la storia del mondo");
  return { sha, data };
}

export async function saveGlossary(gh: GitHub, owner: string, repo: string, args: { sha: string | null; items: unknown }) {
  const items = normalizeGlossary(args.items);
  const sha = await saveSingle(gh, owner, repo, GLOSSARY_PATH, serializeGlossary(items), args.sha, "Aggiorna il glossario");
  return { sha, items };
}

/**
 * Crea o aggiorna una mappa. Con `immagine` (base64) carica anche l'immagine,
 * controllandone formato e dimensione: niente SVG o altri tipi eseguibili.
 */
export async function saveMap(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; data: unknown; immagine?: string },
): Promise<Sheet<WorldMap>> {
  let data = normalizeMap(args.data);
  const tree = await listTree(gh, owner, repo);
  let path = args.path;
  if (path) {
    if (!parseMapPath(path) || !args.sha) throw new ApiError(400, "Mappa non valida.");
  } else {
    const taken = tree.map((e) => parseMapPath(e.path)).filter((x): x is string => !!x);
    path = mapPath(uniqueSlug(slugify(data.nome), taken));
  }
  const slug = parseMapPath(path)!;
  if (args.immagine) {
    const bytes = Buffer.from(args.immagine, "base64");
    if (bytes.length > MAX_MAP_BYTES) throw new ApiError(413, "Immagine troppo grande (massimo 5 MB).");
    const ext = sniffImage(bytes);
    if (!ext) throw new ApiError(415, "Formato dell'immagine non supportato: usa PNG, JPEG o WebP.");
    const imagePath = `${MAPS_DIR}/${slug}.${ext}`;
    const existing = tree.find((e) => e.path === imagePath);
    await writeBytes(gh, {
      owner,
      repo,
      path: imagePath,
      base64: bytes.toString("base64"),
      message: `Mappa «${data.nome}»: immagine`,
      ...(existing ? { sha: existing.sha } : {}),
    });
    // Formato cambiato: la vecchia immagine non serve più.
    const old = data.immagine && data.immagine !== imagePath ? tree.find((e) => e.path === data.immagine) : undefined;
    if (old) await deleteFile(gh, { owner, repo, path: old.path, sha: old.sha, message: `Mappa «${data.nome}»: toglie la vecchia immagine` });
    data = { ...data, immagine: imagePath };
  }
  if (!data.immagine) throw new ApiError(400, "Carica l'immagine della mappa.");
  const sha = await writeText(gh, {
    owner,
    repo,
    path,
    text: serializeMap(data),
    message: args.path ? `Mappa «${data.nome}»: aggiorna i segnaposti` : `Mondo: nuova mappa «${data.nome}»`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { path, sha, data };
}

/** Appunto di progetto: crea (senza `path`) o aggiorna. */
export async function saveProjectNote(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; data: unknown },
): Promise<Sheet<Note>> {
  return saveNoteIn(gh, owner, repo, args, (n) => ({ ...n, progetti: [] }));
}

/** Salvataggio comune agli appunti di progetto e globali. */
export async function saveNoteIn(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; data: unknown },
  adjust: (n: Note) => Note = (n) => n,
): Promise<Sheet<Note>> {
  const isNew = !args.path;
  const raw = withId(args.data, isNew);
  const data = adjust(normalizeNote(isNew ? { creato: today(), ...raw } : raw));
  let path = args.path;
  if (path) {
    if (!isNotePath(path) || !args.sha) throw new ApiError(400, "Appunto non valido.");
  } else {
    path = notePath(uniqueSlug(slugify(data.titolo), await takenSlugs(gh, owner, repo, "appunti/")));
  }
  const sha = await writeText(gh, {
    owner,
    repo,
    path,
    text: serializeNote(data),
    message: isNew ? `Nuovo appunto: ${data.titolo}` : `Appunto «${data.titolo}»: aggiornamento`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { path, sha, data };
}

/** Template PDF del progetto: crea (senza `path`) o aggiorna. */
export async function savePdfTemplate(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path?: string; sha?: string; data: unknown },
): Promise<Sheet<PdfTemplate>> {
  const data = normalizePdfTemplate(args.data);
  let path = args.path;
  if (path) {
    if (!parsePdfTemplatePath(path) || !args.sha) throw new ApiError(400, "Template non valido.");
  } else {
    const taken = (await listTree(gh, owner, repo)).map((e) => parsePdfTemplatePath(e.path)).filter((x): x is string => !!x);
    path = pdfTemplatePath(uniqueSlug(slugify(data.nome), [...taken, ...BUILTIN_PDF_TEMPLATES.map((t) => t.id)]));
  }
  const id = parsePdfTemplatePath(path)!;
  const sheet = { ...data, id };
  const sha = await writeText(gh, {
    owner,
    repo,
    path,
    text: serializePdfTemplate(sheet),
    message: args.path ? `Template PDF «${data.nome}»: aggiornamento` : `Nuovo template PDF «${data.nome}»`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { path, sha, data: sheet };
}
