import type { Octokit } from "octokit";
import { getFile, listDir, putFile } from "./github";
import type { ChapterComment, Character, Romanzo, Scene } from "./types";

export interface RomanzoSummary extends Romanzo {
  slug: string;
}

export async function listRomanzi(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RomanzoSummary[]> {
  const entries = await listDir(octokit, owner, repo, "romanzi");
  const dirs = entries.filter((e) => e.type === "dir");
  const romanzi = await Promise.all(
    dirs.map(async (dir) => {
      const file = await getFile(
        octokit,
        owner,
        repo,
        `romanzi/${dir.name}/romanzo.json`
      );
      if (!file) return null;
      const data = JSON.parse(file.content) as Romanzo;
      return { ...data, slug: dir.name };
    })
  );
  return romanzi
    .filter((r): r is RomanzoSummary => r !== null)
    .sort((a, b) => a.order - b.order);
}

export interface CapitoloSummary {
  file: string;
  title: string;
  order: number;
}

export function commentsPathFor(mdPath: string): string {
  return mdPath.replace(/\.md$/, ".comments.json");
}

export function capitoliDirFor(romanzoSlug: string): string {
  return `romanzi/${romanzoSlug}/capitoli`;
}

export async function listCapitoli(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string
): Promise<CapitoloSummary[]> {
  const dirPath = capitoliDirFor(romanzoSlug);
  const entries = await listDir(octokit, owner, repo, dirPath);
  const mdFiles = entries.filter(
    (e) => e.type === "file" && e.name.endsWith(".md")
  );
  const capitoli = await Promise.all(
    mdFiles.map(async (entry) => {
      const file = await getFile(octokit, owner, repo, `${dirPath}/${entry.name}`);
      const heading = file?.content.match(/^#\s+(.+)$/m);
      const orderMatch = entry.name.match(/^(\d+)-/);
      return {
        file: entry.name,
        title: heading?.[1]?.trim() ?? entry.name,
        order: orderMatch ? Number(orderMatch[1]) : 0,
      };
    })
  );
  return capitoli.sort((a, b) => a.order - b.order);
}

export async function getComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  mdPath: string
): Promise<{ comments: ChapterComment[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, commentsPathFor(mdPath));
  if (!file) return { comments: [] };
  return { comments: JSON.parse(file.content) as ChapterComment[], sha: file.sha };
}

export async function appendComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  mdPath: string,
  comment: ChapterComment
): Promise<ChapterComment[]> {
  const { comments, sha } = await getComments(octokit, owner, repo, mdPath);
  const updated = [...comments, comment];
  await putFile(
    octokit,
    owner,
    repo,
    commentsPathFor(mdPath),
    JSON.stringify(updated, null, 2) + "\n",
    `Aggiungi commento di ${comment.author}`,
    sha
  );
  return updated;
}

export function scenePathFor(romanzoSlug: string): string {
  return `romanzi/${romanzoSlug}/scene/scene.json`;
}

export async function getScenes(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string
): Promise<{ scenes: Scene[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, scenePathFor(romanzoSlug));
  if (!file) return { scenes: [] };
  return { scenes: JSON.parse(file.content) as Scene[], sha: file.sha };
}

export async function saveScenes(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string,
  scenes: Scene[],
  sha: string | undefined,
  message: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    scenePathFor(romanzoSlug),
    JSON.stringify(scenes, null, 2) + "\n",
    message,
    sha
  );
}

export const CHARACTERS_PATH = "personaggi/personaggi.json";

export async function getCharacters(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ characters: Character[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, CHARACTERS_PATH);
  if (!file) return { characters: [] };
  return { characters: JSON.parse(file.content) as Character[], sha: file.sha };
}

export async function saveCharacters(
  octokit: Octokit,
  owner: string,
  repo: string,
  characters: Character[],
  sha: string | undefined,
  message: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    CHARACTERS_PATH,
    JSON.stringify(characters, null, 2) + "\n",
    message,
    sha
  );
}
