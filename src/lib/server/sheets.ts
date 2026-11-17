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
  CATEGORIES_PATH,
  RELATIONS_PATH,
  characterPath,
  isCharacterPath,
  isSlug,
  parseWorldEntryPath,
  worldEntryPath,
} from "@/lib/project/paths";
import { shortId, slugify, uniqueSlug } from "@/lib/project/slug";
import { ApiError } from "./errors";
import { deleteFile, listTree, readBlobs, readText, writeText, type GitHub } from "./github";

/**
 * Schede di progetto: personaggi, relazioni, categorie e voci del mondo.
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
  /** File presenti ma illeggibili: li segnaliamo invece di bloccare tutto. */
  errori: { path: string; message: string }[];
}

const byName = (a: { data: { nome: string } }, b: { data: { nome: string } }) => a.data.nome.localeCompare(b.data.nome, "it");

export async function loadSheets(gh: GitHub, owner: string, repo: string): Promise<SheetsData> {
  const tree = await listTree(gh, owner, repo);
  const wanted = tree.filter(
    (e) => isCharacterPath(e.path) || parseWorldEntryPath(e.path) || e.path === RELATIONS_PATH || e.path === CATEGORIES_PATH,
  );
  const texts = await readBlobs(gh, owner, repo, wanted);
  const out: SheetsData = {
    personaggi: [],
    voci: [],
    relazioni: { sha: null, items: [] },
    categorie: { sha: null, items: DEFAULT_CATEGORIES },
    errori: [],
  };
  wanted.forEach((e, i) => {
    try {
      if (e.path === RELATIONS_PATH) out.relazioni = { sha: e.sha, items: parseRelations(texts[i]) };
      else if (e.path === CATEGORIES_PATH) out.categorie = { sha: e.sha, items: parseCategories(texts[i]) };
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
  if (!isCharacter && !parseWorldEntryPath(args.path)) throw new ApiError(400, "Percorso non consentito.");
  await deleteFile(gh, { owner, repo, path: args.path, sha: args.sha, message: `Elimina ${args.path}` });
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
