import type { Octokit } from "octokit";
import { deleteFile, getFile, listDir, putFile } from "./github";
import type {
  ChapterComment,
  Character,
  CharacterRelationship,
  NoteMeta,
  PdfSettings,
  Romanzo,
  Scene,
  TimelineEvent,
} from "./types";

export interface RomanzoSummary extends Romanzo {
  slug: string;
}

export async function listRomanzi(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch?: string
): Promise<RomanzoSummary[]> {
  const entries = await listDir(octokit, owner, repo, "romanzi", branch);
  const dirs = entries.filter((e) => e.type === "dir");
  const romanzi = await Promise.all(
    dirs.map(async (dir) => {
      const file = await getFile(
        octokit,
        owner,
        repo,
        `romanzi/${dir.name}/romanzo.json`,
        branch
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

const SAFE_SLUG = /^[a-z0-9-]+$/;

export function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG.test(slug);
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
  romanzoSlug: string,
  branch?: string
): Promise<CapitoloSummary[]> {
  const dirPath = capitoliDirFor(romanzoSlug);
  const entries = await listDir(octokit, owner, repo, dirPath, branch);
  const mdFiles = entries.filter(
    (e) => e.type === "file" && e.name.endsWith(".md")
  );
  const capitoli = await Promise.all(
    mdFiles.map(async (entry) => {
      const file = await getFile(
        octokit,
        owner,
        repo,
        `${dirPath}/${entry.name}`,
        branch
      );
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
  mdPath: string,
  branch?: string
): Promise<{ comments: ChapterComment[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, commentsPathFor(mdPath), branch);
  if (!file) return { comments: [] };
  return { comments: JSON.parse(file.content) as ChapterComment[], sha: file.sha };
}

export async function appendComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  mdPath: string,
  comment: ChapterComment,
  branch?: string
): Promise<ChapterComment[]> {
  const { comments, sha } = await getComments(octokit, owner, repo, mdPath, branch);
  const updated = [...comments, comment];
  await putFile(
    octokit,
    owner,
    repo,
    commentsPathFor(mdPath),
    JSON.stringify(updated, null, 2) + "\n",
    `Aggiungi commento di ${comment.author}`,
    sha,
    branch
  );
  return updated;
}

export async function removeComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  mdPath: string,
  commentId: string,
  branch?: string
): Promise<ChapterComment[]> {
  const { comments, sha } = await getComments(octokit, owner, repo, mdPath, branch);
  const updated = comments.filter((c) => c.id !== commentId);
  await putFile(
    octokit,
    owner,
    repo,
    commentsPathFor(mdPath),
    JSON.stringify(updated, null, 2) + "\n",
    "Rimuovi commento",
    sha,
    branch
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
  romanzoSlug: string,
  branch?: string
): Promise<{ scenes: Scene[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, scenePathFor(romanzoSlug), branch);
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
  message: string,
  branch?: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    scenePathFor(romanzoSlug),
    JSON.stringify(scenes, null, 2) + "\n",
    message,
    sha,
    branch
  );
}

export async function getChapterContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string,
  files: string[],
  branch?: string
): Promise<{ file: string; content: string }[]> {
  const dirPath = capitoliDirFor(romanzoSlug);
  const results = await Promise.all(
    files.map(async (name) => {
      const file = await getFile(octokit, owner, repo, `${dirPath}/${name}`, branch);
      return { file: name, content: file?.content ?? "" };
    })
  );
  return results;
}

export function pdfSettingsPathFor(romanzoSlug: string): string {
  return `romanzi/${romanzoSlug}/pdf-settings.json`;
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  templateId: "classico",
  pageSize: "A5",
  includeCoverPage: true,
  includeToc: true,
};

export async function getPdfSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string,
  branch?: string
): Promise<{ settings: PdfSettings; sha?: string }> {
  const file = await getFile(
    octokit,
    owner,
    repo,
    pdfSettingsPathFor(romanzoSlug),
    branch
  );
  if (!file) return { settings: DEFAULT_PDF_SETTINGS };
  return {
    settings: { ...DEFAULT_PDF_SETTINGS, ...(JSON.parse(file.content) as PdfSettings) },
    sha: file.sha,
  };
}

export async function savePdfSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
  romanzoSlug: string,
  settings: PdfSettings,
  sha: string | undefined,
  message: string,
  branch?: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    pdfSettingsPathFor(romanzoSlug),
    JSON.stringify(settings, null, 2) + "\n",
    message,
    sha,
    branch
  );
}

export const CHARACTERS_PATH = "personaggi/personaggi.json";

function normalizeRelationships(
  relationships: unknown
): CharacterRelationship[] | undefined {
  if (relationships === undefined || relationships === null) return undefined;
  if (typeof relationships === "string") {
    return relationships.trim() === ""
      ? []
      : [{ personaggioId: "", relazione: relationships }];
  }
  return relationships as CharacterRelationship[];
}

export async function getCharacters(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch?: string
): Promise<{ characters: Character[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, CHARACTERS_PATH, branch);
  if (!file) return { characters: [] };
  const characters = JSON.parse(file.content) as Character[];
  return {
    characters: characters.map((c) => ({
      ...c,
      relationships: normalizeRelationships(c.relationships),
    })),
    sha: file.sha,
  };
}

export async function saveCharacters(
  octokit: Octokit,
  owner: string,
  repo: string,
  characters: Character[],
  sha: string | undefined,
  message: string,
  branch?: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    CHARACTERS_PATH,
    JSON.stringify(characters, null, 2) + "\n",
    message,
    sha,
    branch
  );
}

export const TIMELINE_PATH = "timeline/timeline.json";

export async function getTimelineEvents(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch?: string
): Promise<{ events: TimelineEvent[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, TIMELINE_PATH, branch);
  if (!file) return { events: [] };
  return { events: JSON.parse(file.content) as TimelineEvent[], sha: file.sha };
}

export async function saveTimelineEvents(
  octokit: Octokit,
  owner: string,
  repo: string,
  events: TimelineEvent[],
  sha: string | undefined,
  message: string,
  branch?: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    TIMELINE_PATH,
    JSON.stringify(events, null, 2) + "\n",
    message,
    sha,
    branch
  );
}

export const NOTE_INDEX_PATH = "note/index.json";

export function notePathFor(slug: string): string {
  return `note/${slug}.md`;
}

export async function getNoteIndex(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ notes: NoteMeta[]; sha?: string }> {
  const file = await getFile(octokit, owner, repo, NOTE_INDEX_PATH);
  if (!file) return { notes: [] };
  return { notes: JSON.parse(file.content) as NoteMeta[], sha: file.sha };
}

export async function saveNoteIndex(
  octokit: Octokit,
  owner: string,
  repo: string,
  notes: NoteMeta[],
  sha: string | undefined,
  message: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    NOTE_INDEX_PATH,
    JSON.stringify(notes, null, 2) + "\n",
    message,
    sha
  );
}

export async function getNoteContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string
): Promise<{ content: string; sha: string } | null> {
  const file = await getFile(octokit, owner, repo, notePathFor(slug));
  if (!file) return null;
  return { content: file.content, sha: file.sha };
}

export async function saveNoteContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
  content: string,
  sha: string | undefined,
  message: string
) {
  await putFile(
    octokit,
    owner,
    repo,
    notePathFor(slug),
    content,
    message,
    sha
  );
}

export async function deleteNote(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
  sha: string,
  message: string
) {
  await deleteFile(octokit, owner, repo, notePathFor(slug), message, sha);
}
