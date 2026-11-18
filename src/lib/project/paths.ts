/**
 * Percorsi dei file Writly nel repository e loro validazione.
 *
 * Le API accettano percorsi dal client solo se corrispondono a questi
 * schemi: nessuna scrittura arbitraria nel repository dell'autore.
 */

export const MANIFEST_PATH = "writly.yaml";
export const DICTIONARY_PATH = "dizionario.txt";
export const PROJECT_TOPIC = "writly-progetto";
export const RELATIONS_PATH = "relazioni.yaml";
export const CATEGORIES_PATH = "mondo/categorie.yaml";
export const RULES_PATH = "mondo/regole.yaml";
export const CHRONOLOGY_PATH = "mondo/cronologia.yaml";
export const GLOSSARY_PATH = "glossario.yaml";
/** Cartella delle mappe: non può essere una categoria del mondo. */
export const MAPS_DIR = "mondo/mappe";
/** Repository personale dell'autore per ciò che vale in tutta la libreria (strutture personali). */
export const LIBRARY_REPO = "writly-libreria";

/** Slug che non possono essere usati per le opere: sono segmenti delle pagine del progetto. */
export const RESERVED_WORK_SLUGS = ["personaggi", "mondo", "struttura", "appunti", "esporta", "varianti"];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAPTER_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const CHARACTER_PATH = /^personaggi\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const WORLD_PATH = /^mondo\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const NOTE_PATH = /^appunti\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const PDF_TEMPLATE_PATH = /^template-pdf\/([a-z0-9]+(?:-[a-z0-9]+)*)\.yaml$/;
const MAP_PATH = /^mondo\/mappe\/([a-z0-9]+(?:-[a-z0-9]+)*)\.yaml$/;
const LIBRARY_STRUCTURE_PATH = /^strutture\/([a-z0-9]+(?:-[a-z0-9]+)*)\.yaml$/;
const CHAPTER_PATH = /^opere\/([a-z0-9]+(?:-[a-z0-9]+)*)\/capitoli\/([a-z0-9]+(?:-[a-z0-9]+)*\.md)$/;

export function isSlug(value: string): boolean {
  return value.length > 0 && value.length <= 80 && SLUG.test(value);
}

export function isChapterFile(value: string): boolean {
  return value.length <= 90 && CHAPTER_FILE.test(value);
}

export function workDir(work: string): string {
  return `opere/${work}`;
}

export function workManifestPath(work: string): string {
  return `${workDir(work)}/opera.yaml`;
}

export function chapterPath(work: string, file: string): string {
  return `${workDir(work)}/capitoli/${file}`;
}

export function workStructurePath(work: string): string {
  return `${workDir(work)}/struttura.yaml`;
}

export function characterPath(slug: string): string {
  return `personaggi/${slug}.md`;
}

export function worldEntryPath(category: string, slug: string): string {
  return `mondo/${category}/${slug}.md`;
}

export function notePath(slug: string): string {
  return `appunti/${slug}.md`;
}

export function isNotePath(path: string): boolean {
  const m = NOTE_PATH.exec(path);
  return !!m && isSlug(m[1]);
}

export function mapPath(slug: string): string {
  return `${MAPS_DIR}/${slug}.yaml`;
}

/** Slug della mappa se il percorso è quello di un file di mappa. */
export function parseMapPath(path: string): string | null {
  const m = MAP_PATH.exec(path);
  return m && isSlug(m[1]) ? m[1] : null;
}

export function pdfTemplatePath(id: string): string {
  return `template-pdf/${id}.yaml`;
}

/** Id del template se il percorso è quello di un template PDF. */
export function parsePdfTemplatePath(path: string): string | null {
  const m = PDF_TEMPLATE_PATH.exec(path);
  return m && isSlug(m[1]) ? m[1] : null;
}

export function libraryStructurePath(id: string): string {
  return `strutture/${id}.yaml`;
}

export function isCharacterPath(path: string): boolean {
  const m = CHARACTER_PATH.exec(path);
  return !!m && isSlug(m[1]);
}

/** Categoria e slug se il percorso è quello di una voce del mondo. */
export function parseWorldEntryPath(path: string): { category: string; slug: string } | null {
  const m = WORLD_PATH.exec(path);
  if (!m || !isSlug(m[1]) || !isSlug(m[2]) || m[1] === "mappe") return null;
  return { category: m[1], slug: m[2] };
}

export function parseLibraryStructurePath(path: string): string | null {
  const m = LIBRARY_STRUCTURE_PATH.exec(path);
  return m && isSlug(m[1]) ? m[1] : null;
}

/** Restituisce opera e file se il percorso è quello di un capitolo valido. */
export function parseChapterPath(path: string): { work: string; file: string } | null {
  const m = CHAPTER_PATH.exec(path);
  if (!m || !isSlug(m[1]) || !isChapterFile(m[2])) return null;
  return { work: m[1], file: m[2] };
}

/** Percorsi che il client può leggere (e, per capitoli e dizionario, scrivere). */
export function isReadablePath(path: string): boolean {
  if (path === MANIFEST_PATH || path === DICTIONARY_PATH) return true;
  if (parseChapterPath(path)) return true;
  const m = /^opere\/([^/]+)\/opera\.yaml$/.exec(path);
  return !!m && isSlug(m[1]);
}

export function isWritableTextPath(path: string): boolean {
  return parseChapterPath(path) !== null;
}

export const VARIANT_PREFIX = "variante/";
const VARIANT_REF = /^variante\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Ramo Git di una variante («variante/finale-alternativo»). */
export function isVariantRef(value: string): boolean {
  return value.length <= 90 && VARIANT_REF.test(value);
}

/** Nome leggibile di una variante dal suo ramo («Finale alternativo»). */
export function variantName(ref: string): string {
  const s = ref.slice(VARIANT_PREFIX.length).replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidRepoRef(owner: string, repo: string): boolean {
  return OWNER.test(owner) && REPO.test(repo) && repo !== "." && repo !== "..";
}
