import { parseChapter, parseWorkManifest } from "@/lib/project/format";
import {
  LIBRARY_REPO,
  chapterPath,
  isSlug,
  libraryStructurePath,
  parseLibraryStructurePath,
  workManifestPath,
  workStructurePath,
} from "@/lib/project/paths";
import { slugify, uniqueSlug } from "@/lib/project/slug";
import {
  normalizeTemplate,
  normalizeWorkStructure,
  parseTemplate,
  parseWorkStructure,
  serializeTemplate,
  serializeWorkStructure,
  type StructureTemplate,
  type WorkStructure,
} from "@/lib/project/structure";
import { BUILTIN_TEMPLATES } from "@/lib/project/templates";
import { markdownToPlain, textStats, type TextStats } from "@/lib/text/stats";
import { ApiError } from "./errors";
import { createRepo, deleteFile, getLogin, listTree, readBlobs, readText, repoExists, writeText, type GitHub } from "./github";

function assertWork(work: string) {
  if (!isSlug(work)) throw new ApiError(400, "Opera non valida.");
}

// ——— Struttura e scene di un'opera ———

export async function loadWorkStructure(gh: GitHub, owner: string, repo: string, work: string) {
  assertWork(work);
  const file = await readText(gh, owner, repo, workStructurePath(work));
  return file
    ? { sha: file.sha, struttura: parseWorkStructure(file.text, work) as WorkStructure | null }
    : { sha: null, struttura: null };
}

export async function saveWorkStructure(
  gh: GitHub,
  owner: string,
  repo: string,
  work: string,
  args: { sha: string | null; data: unknown; message: string },
): Promise<{ sha: string; struttura: WorkStructure }> {
  assertWork(work);
  const struttura = normalizeWorkStructure(args.data);
  const sha = await writeText(gh, {
    owner,
    repo,
    path: workStructurePath(work),
    text: serializeWorkStructure(struttura),
    message: args.message,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { sha, struttura };
}

export interface ChapterStats extends TextStats {
  file: string;
  stato: string;
}

/** Parole e battute di ogni capitolo dell'opera (un albero + un blob per capitolo). */
export async function workStats(gh: GitHub, owner: string, repo: string, work: string): Promise<ChapterStats[]> {
  assertWork(work);
  const tree = await listTree(gh, owner, repo);
  const byPath = new Map(tree.map((e) => [e.path, e]));
  const manifestEntry = byPath.get(workManifestPath(work));
  if (!manifestEntry) throw new ApiError(404, `Opera «${work}» non trovata.`);
  const [manifestText] = await readBlobs(gh, owner, repo, [manifestEntry]);
  const manifest = parseWorkManifest(manifestText, work);
  const present = manifest.capitoli
    .map((c) => byPath.get(chapterPath(work, c.file)))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const texts = await readBlobs(gh, owner, repo, present);
  const textByPath = new Map(present.map((e, i) => [e.path, texts[i]]));
  return manifest.capitoli.map((c) => {
    const text = textByPath.get(chapterPath(work, c.file));
    if (text === undefined) return { file: c.file, stato: "mancante", parole: 0, battute: 0, battuteSenzaSpazi: 0 };
    const doc = parseChapter(text);
    return { file: c.file, stato: doc.meta.stato, ...textStats(markdownToPlain(doc.body)) };
  });
}

// ——— Strutture personali (repository writly-libreria dell'autore) ———

export interface LibraryStructure {
  sha: string;
  struttura: StructureTemplate;
}

export interface LibraryData {
  owner: string;
  repo: string;
  exists: boolean;
  predefinite: readonly StructureTemplate[];
  personali: LibraryStructure[];
  errori: { path: string; message: string }[];
}

export async function loadLibrary(gh: GitHub): Promise<LibraryData> {
  const owner = await getLogin(gh);
  const base = { owner, repo: LIBRARY_REPO, predefinite: BUILTIN_TEMPLATES };
  if (!(await repoExists(gh, owner, LIBRARY_REPO))) return { ...base, exists: false, personali: [], errori: [] };
  const entries = (await listTree(gh, owner, LIBRARY_REPO)).filter((e) => parseLibraryStructurePath(e.path));
  const texts = await readBlobs(gh, owner, LIBRARY_REPO, entries);
  const personali: LibraryStructure[] = [];
  const errori: LibraryData["errori"] = [];
  entries.forEach((e, i) => {
    try {
      personali.push({ sha: e.sha, struttura: parseTemplate(texts[i], parseLibraryStructurePath(e.path)!) });
    } catch (err) {
      errori.push({ path: e.path, message: (err as Error).message });
    }
  });
  personali.sort((a, b) => a.struttura.nome.localeCompare(b.struttura.nome, "it"));
  return { ...base, exists: true, personali, errori };
}

/** Crea (senza `id`) o aggiorna (con `id` e `sha`) una struttura personale. */
export async function saveLibraryStructure(
  gh: GitHub,
  args: { id?: string; sha?: string; data: unknown },
): Promise<LibraryStructure> {
  const owner = await getLogin(gh);
  const template = normalizeTemplate(args.data);
  let id = args.id;
  if (id) {
    if (!isSlug(id) || !args.sha) throw new ApiError(400, "Struttura non valida.");
  } else {
    if (!(await repoExists(gh, owner, LIBRARY_REPO))) {
      await createRepo(gh, { name: LIBRARY_REPO, description: "Strutture narrative personali di Writly", private: true });
    }
    const taken = (await listTree(gh, owner, LIBRARY_REPO))
      .map((e) => parseLibraryStructurePath(e.path))
      .filter((x): x is string => !!x);
    id = uniqueSlug(slugify(template.nome), [...taken, ...BUILTIN_TEMPLATES.map((t) => t.id)]);
  }
  const struttura = { ...template, id };
  const sha = await writeText(gh, {
    owner,
    repo: LIBRARY_REPO,
    path: libraryStructurePath(id),
    text: serializeTemplate(struttura),
    message: args.id ? `Struttura «${struttura.nome}»: aggiornamento` : `Nuova struttura «${struttura.nome}»`,
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return { sha, struttura };
}

export async function deleteLibraryStructure(gh: GitHub, id: string, sha: string): Promise<void> {
  if (!isSlug(id) || !/^[0-9a-f]{40}$/.test(sha)) throw new ApiError(400, "Struttura non valida.");
  const owner = await getLogin(gh);
  await deleteFile(gh, { owner, repo: LIBRARY_REPO, path: libraryStructurePath(id), sha, message: `Elimina la struttura «${id}»` });
}
