import {
  FORMAT_VERSION,
  parseDictionary,
  parseProjectManifest,
  parseWorkManifest,
  serializeChapter,
  serializeDictionary,
  serializeProjectManifest,
  serializeWorkManifest,
  type ProjectManifest,
  type ProjectType,
  type WorkManifest,
} from "@/lib/project/format";
import {
  DICTIONARY_PATH,
  MANIFEST_PATH,
  PROJECT_TOPIC,
  RESERVED_WORK_SLUGS,
  chapterPath,
  isChapterFile,
  isSlug,
  workManifestPath,
} from "@/lib/project/paths";
import { shortId, slugify, uniqueSlug } from "@/lib/project/slug";
import { MENTOR_SKILL_PATH, MENTOR_SKILL_VERSION, installedMentorVersion, mentorSkillFiles } from "@/lib/project/mentor-skill";
import { ApiError } from "./errors";
import { addTopic, commitFiles, createRepo, readText, writeText, type GitHub } from "./github";

export interface WorkSummary extends WorkManifest {
  slug: string;
}

export interface ProjectData {
  owner: string;
  repo: string;
  manifest: ProjectManifest;
  opere: WorkSummary[];
  dizionario: string[];
  /** Skill «writly-mentore» per Claude Code: versione nel repository (0 = assente) e versione attuale. */
  mentore: { installata: number; attuale: number };
}

async function readManifest(gh: GitHub, owner: string, repo: string) {
  const file = await readText(gh, owner, repo, MANIFEST_PATH);
  if (!file) throw new ApiError(404, "Questo repository non è un progetto Writly (manca writly.yaml).");
  return { manifest: parseProjectManifest(file.text), sha: file.sha };
}

async function readWork(gh: GitHub, owner: string, repo: string, slug: string) {
  if (!isSlug(slug)) throw new ApiError(400, "Opera non valida.");
  const file = await readText(gh, owner, repo, workManifestPath(slug));
  if (!file) throw new ApiError(404, `Opera «${slug}» non trovata.`);
  return { work: parseWorkManifest(file.text, slug), sha: file.sha };
}

export async function loadProject(gh: GitHub, owner: string, repo: string): Promise<ProjectData> {
  const { manifest } = await readManifest(gh, owner, repo);
  const [opere, dict, skill] = await Promise.all([
    Promise.all(manifest.opere.map(async (slug) => ({ slug, ...(await readWork(gh, owner, repo, slug)).work }))),
    readText(gh, owner, repo, DICTIONARY_PATH),
    readText(gh, owner, repo, MENTOR_SKILL_PATH),
  ]);
  return {
    owner,
    repo,
    manifest,
    opere,
    dizionario: dict ? parseDictionary(dict.text) : [],
    mentore: { installata: installedMentorVersion(skill?.text ?? null), attuale: MENTOR_SKILL_VERSION },
  };
}

function initialFiles(titolo: string, tipo: ProjectType, titoloOpera: string) {
  const work = uniqueSlug(slugify(titoloOpera), RESERVED_WORK_SLUGS);
  const firstChapter: WorkManifest["capitoli"][number] = { file: "capitolo-1.md", titolo: "Capitolo 1" };
  const manifest: ProjectManifest = { writly: FORMAT_VERSION, titolo, tipo, lingua: "it", opere: [work] };
  return [
    { path: MANIFEST_PATH, text: serializeProjectManifest(manifest) },
    { path: workManifestPath(work), text: serializeWorkManifest({ titolo: titoloOpera, capitoli: [firstChapter] }) },
    { path: chapterPath(work, firstChapter.file), text: serializeChapter({ meta: { id: shortId(), stato: "bozza" }, body: "" }) },
    { path: DICTIONARY_PATH, text: serializeDictionary([]) },
    ...mentorSkillFiles(),
  ];
}

export async function createProject(
  gh: GitHub,
  args: { titolo: string; tipo: ProjectType; nomeRepo: string; privato: boolean; titoloOpera?: string },
): Promise<{ owner: string; repo: string }> {
  const name = slugify(args.nomeRepo, 90);
  const { owner, repo } = await createRepo(gh, {
    name,
    description: `${args.titolo} — progetto Writly (${args.tipo})`,
    private: args.privato,
  });
  const files = [
    ...initialFiles(args.titolo, args.tipo, args.titoloOpera || args.titolo),
    {
      path: "README.md",
      text: `# ${args.titolo}\n\nProgetto di scrittura gestito con Writly. I capitoli sono in \`opere/<opera>/capitoli/\`, in Markdown.\n`,
    },
  ];
  await commitFiles(gh, owner, repo, `Crea il progetto «${args.titolo}»`, files);
  await addTopic(gh, owner, repo, PROJECT_TOPIC);
  return { owner, repo };
}

/** Collega un repository esistente: se ha già writly.yaml lo valida, altrimenti lo inizializza. */
export async function connectProject(
  gh: GitHub,
  owner: string,
  repo: string,
  args: { titolo: string; tipo: ProjectType },
): Promise<void> {
  const existing = await readText(gh, owner, repo, MANIFEST_PATH);
  if (existing) {
    parseProjectManifest(existing.text);
  } else {
    await commitFiles(gh, owner, repo, `Inizializza il progetto Writly «${args.titolo}»`, initialFiles(args.titolo, args.tipo, args.titolo));
  }
  await addTopic(gh, owner, repo, PROJECT_TOPIC);
}

export async function addWork(gh: GitHub, owner: string, repo: string, titolo: string): Promise<string> {
  const { manifest } = await readManifest(gh, owner, repo);
  const slug = uniqueSlug(slugify(titolo), [...manifest.opere, ...RESERVED_WORK_SLUGS]);
  const next = { ...manifest, opere: [...manifest.opere, slug] };
  const first = { file: "capitolo-1.md", titolo: "Capitolo 1" };
  await commitFiles(gh, owner, repo, `Aggiunge l'opera «${titolo}»`, [
    { path: MANIFEST_PATH, text: serializeProjectManifest(next) },
    { path: workManifestPath(slug), text: serializeWorkManifest({ titolo, capitoli: [first] }) },
    { path: chapterPath(slug, first.file), text: serializeChapter({ meta: { id: shortId(), stato: "bozza" }, body: "" }) },
  ]);
  return slug;
}

/** Installa o aggiorna la skill del mentore AI per Claude Code (un solo commit). */
export async function installMentor(gh: GitHub, owner: string, repo: string): Promise<number> {
  await readManifest(gh, owner, repo); // solo nei progetti Writly
  const current = await readText(gh, owner, repo, MENTOR_SKILL_PATH);
  const verb = current ? "Aggiorna" : "Installa";
  await commitFiles(gh, owner, repo, `${verb} il mentore AI per Claude Code (v${MENTOR_SKILL_VERSION})`, mentorSkillFiles());
  return MENTOR_SKILL_VERSION;
}

export async function addChapter(gh: GitHub, owner: string, repo: string, work: string, titolo: string): Promise<string> {
  const { work: manifest } = await readWork(gh, owner, repo, work);
  const base = slugify(titolo, 70);
  const taken = manifest.capitoli.map((c) => c.file.replace(/\.md$/, ""));
  const file = `${uniqueSlug(base, taken)}.md`;
  const next: WorkManifest = { ...manifest, capitoli: [...manifest.capitoli, { file, titolo }] };
  await commitFiles(gh, owner, repo, `Nuovo capitolo «${titolo}»`, [
    { path: workManifestPath(work), text: serializeWorkManifest(next) },
    { path: chapterPath(work, file), text: serializeChapter({ meta: { id: shortId(), stato: "bozza" }, body: "" }) },
  ]);
  return file;
}

export async function renameChapter(gh: GitHub, owner: string, repo: string, work: string, file: string, titolo: string) {
  if (!isChapterFile(file)) throw new ApiError(400, "Capitolo non valido.");
  const { work: manifest, sha } = await readWork(gh, owner, repo, work);
  const entry = manifest.capitoli.find((c) => c.file === file);
  if (!entry) throw new ApiError(404, "Capitolo non trovato nell'opera.");
  if (entry.titolo === titolo) return;
  const next: WorkManifest = {
    ...manifest,
    capitoli: manifest.capitoli.map((c) => (c.file === file ? { ...c, titolo } : c)),
  };
  await writeText(gh, {
    owner,
    repo,
    path: workManifestPath(work),
    text: serializeWorkManifest(next),
    sha,
    message: `Rinomina il capitolo «${entry.titolo}» in «${titolo}»`,
  });
}

/** Aggiunge una parola al dizionario del progetto; riprova una volta se il file è cambiato nel frattempo. */
export async function addDictionaryWord(gh: GitHub, owner: string, repo: string, word: string): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    const file = await readText(gh, owner, repo, DICTIONARY_PATH);
    const words = file ? parseDictionary(file.text) : [];
    if (words.includes(word)) return words;
    const next = [...words, word];
    try {
      await writeText(gh, {
        owner,
        repo,
        path: DICTIONARY_PATH,
        text: serializeDictionary(next),
        message: `Dizionario: aggiunge «${word}»`,
        ...(file ? { sha: file.sha } : {}),
      });
      return parseDictionary(serializeDictionary(next));
    } catch (err) {
      if (attempt === 0 && (err as { status?: number }).status === 409) continue;
      throw err;
    }
  }
}
