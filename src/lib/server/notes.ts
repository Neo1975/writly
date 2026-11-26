import { parseNote, serializeNote, type Note } from "@/lib/project/notes";
import { LIBRARY_REPO, isNotePath, notePath } from "@/lib/project/paths";
import { slugify, uniqueSlug } from "@/lib/project/slug";
import { ApiError } from "./errors";
import { deleteFile, getLogin, listTree, readBlobs, readText, repoExists, writeText, type GitHub } from "./github";
import { newestFirst, saveNoteIn, type Sheet } from "./sheets";
import { ensureLibraryRepo } from "./structures";

/**
 * Appunti globali (repository writly-libreria) e spostamenti tra libreria e
 * progetti. Uno spostamento scrive prima la copia nella destinazione e solo
 * dopo elimina l'originale: se qualcosa va storto, al massimo resta un doppione.
 */

export interface LibraryNotes {
  owner: string;
  repo: string;
  exists: boolean;
  appunti: Sheet<Note>[];
  errori: { path: string; message: string }[];
}

export async function loadLibraryNotes(gh: GitHub): Promise<LibraryNotes> {
  const owner = await getLogin(gh);
  const base = { owner, repo: LIBRARY_REPO };
  if (!(await repoExists(gh, owner, LIBRARY_REPO))) return { ...base, exists: false, appunti: [], errori: [] };
  const entries = (await listTree(gh, owner, LIBRARY_REPO)).filter((e) => isNotePath(e.path));
  const texts = await readBlobs(gh, owner, LIBRARY_REPO, entries);
  const appunti: Sheet<Note>[] = [];
  const errori: LibraryNotes["errori"] = [];
  entries.forEach((e, i) => {
    try {
      appunti.push({ path: e.path, sha: e.sha, data: parseNote(texts[i], e.path) });
    } catch (err) {
      errori.push({ path: e.path, message: (err as Error).message });
    }
  });
  appunti.sort(newestFirst);
  return { ...base, exists: true, appunti, errori };
}

export async function saveLibraryNote(gh: GitHub, args: { path?: string; sha?: string; data: unknown }): Promise<Sheet<Note>> {
  const owner = await getLogin(gh);
  if (!args.path) await ensureLibraryRepo(gh, owner);
  // Gli id di personaggi e scene hanno senso solo dentro un progetto.
  return saveNoteIn(gh, owner, LIBRARY_REPO, args, (n) => ({ ...n, collegamenti: [] }));
}

export async function deleteLibraryNote(gh: GitHub, args: { path: string; sha: string }): Promise<void> {
  if (!isNotePath(args.path)) throw new ApiError(400, "Appunto non valido.");
  const owner = await getLogin(gh);
  await deleteFile(gh, { owner, repo: LIBRARY_REPO, path: args.path, sha: args.sha, message: `Elimina ${args.path}` });
}

async function readNote(gh: GitHub, owner: string, repo: string, path: string, sha: string): Promise<Note> {
  if (!isNotePath(path)) throw new ApiError(400, "Appunto non valido.");
  const file = await readText(gh, owner, repo, path);
  if (!file) throw new ApiError(404, "Appunto non trovato.");
  if (file.sha !== sha) throw new ApiError(409, "L'appunto è cambiato nel frattempo: ricarica la pagina.");
  return parseNote(file.text, path);
}

async function writeCopy(gh: GitHub, owner: string, repo: string, note: Note, message: string): Promise<Sheet<Note>> {
  const taken = (await listTree(gh, owner, repo))
    .filter((e) => isNotePath(e.path))
    .map((e) => e.path.slice("appunti/".length, -3));
  const path = notePath(uniqueSlug(slugify(note.titolo), taken));
  const sha = await writeText(gh, { owner, repo, path, text: serializeNote(note), message });
  return { path, sha, data: note };
}

/** Sposta un appunto globale in un progetto. */
export async function moveNoteToProject(
  gh: GitHub,
  args: { path: string; sha: string; owner: string; repo: string },
): Promise<Sheet<Note>> {
  const login = await getLogin(gh);
  const note = await readNote(gh, login, LIBRARY_REPO, args.path, args.sha);
  const copy = await writeCopy(gh, args.owner, args.repo, { ...note, progetti: [], collegamenti: [] }, `Appunto «${note.titolo}» spostato dalla libreria`);
  await deleteFile(gh, { owner: login, repo: LIBRARY_REPO, path: args.path, sha: args.sha, message: `Appunto «${note.titolo}» spostato in ${args.owner}/${args.repo}` });
  return copy;
}

/** Sposta un appunto di progetto tra gli appunti globali, ricordando da quale progetto viene. */
export async function moveNoteToLibrary(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { path: string; sha: string },
): Promise<Sheet<Note>> {
  const note = await readNote(gh, owner, repo, args.path, args.sha);
  const login = await getLogin(gh);
  await ensureLibraryRepo(gh, login);
  const copy = await writeCopy(gh, login, LIBRARY_REPO, { ...note, collegamenti: [], progetti: [`${owner}/${repo}`] }, `Appunto «${note.titolo}» da ${owner}/${repo}`);
  await deleteFile(gh, { owner, repo, path: args.path, sha: args.sha, message: `Appunto «${note.titolo}» spostato negli appunti globali` });
  return copy;
}
