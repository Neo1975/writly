/**
 * Percorsi dei file Writly nel repository e loro validazione.
 *
 * Le API accettano percorsi dal client solo se corrispondono a questi
 * schemi: nessuna scrittura arbitraria nel repository dell'autore.
 */

export const MANIFEST_PATH = "writly.yaml";
export const DICTIONARY_PATH = "dizionario.txt";
export const PROJECT_TOPIC = "writly-progetto";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAPTER_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
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

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidRepoRef(owner: string, repo: string): boolean {
  return OWNER.test(owner) && REPO.test(repo) && repo !== "." && repo !== "..";
}
