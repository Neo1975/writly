import { Octokit, RequestError } from "octokit";
import { PROJECT_TOPIC } from "@/lib/project/paths";
import { ApiError } from "./errors";

export type GitHub = Octokit;

export function githubClient(token: string): GitHub {
  // GITHUB_API_URL: opzionale, per GitHub Enterprise o per un server finto nei test end-to-end.
  const baseUrl = process.env.GITHUB_API_URL;
  return new Octokit({ auth: token, userAgent: "writly", ...(baseUrl ? { baseUrl } : {}) });
}

export interface RepoSummary {
  owner: string;
  repo: string;
  description: string | null;
  private: boolean;
  updatedAt: string | null;
  isProject: boolean;
  canWrite: boolean;
}

export async function listRepos(gh: GitHub): Promise<RepoSummary[]> {
  const repos = await gh.paginate(gh.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    affiliation: "owner,collaborator",
    sort: "updated",
  });
  return repos.map((r) => ({
    owner: r.owner.login,
    repo: r.name,
    description: r.description,
    private: r.private,
    updatedAt: r.pushed_at ?? r.updated_at ?? null,
    isProject: (r.topics ?? []).includes(PROJECT_TOPIC),
    canWrite: Boolean(r.permissions?.push),
  }));
}

export interface TextFile {
  text: string;
  sha: string;
}

function isStatus(err: unknown, status: number): boolean {
  return err instanceof RequestError && err.status === status;
}

/** Legge un file di testo; `null` se non esiste. */
export async function readText(gh: GitHub, owner: string, repo: string, path: string, ref?: string): Promise<TextFile | null> {
  try {
    const { data } = await gh.rest.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
    if (Array.isArray(data) || data.type !== "file") return null;
    // Oltre 1 MB la Contents API non include il contenuto: lo leggiamo come blob.
    if (data.encoding === "base64" && data.content) {
      return { text: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
    }
    const blob = await gh.rest.git.getBlob({ owner, repo, file_sha: data.sha });
    return { text: Buffer.from(blob.data.content, "base64").toString("utf8"), sha: data.sha };
  } catch (err) {
    if (isStatus(err, 404)) return null;
    throw err;
  }
}

/**
 * Scrive un file con la Contents API. Con `sha` GitHub rifiuta (409) se il file
 * è cambiato nel frattempo: è il nostro controllo di concorrenza ottimistico.
 */
export async function writeText(
  gh: GitHub,
  args: { owner: string; repo: string; path: string; text: string; message: string; sha?: string },
): Promise<string> {
  const { data } = await gh.rest.repos.createOrUpdateFileContents({
    owner: args.owner,
    repo: args.repo,
    path: args.path,
    message: args.message,
    content: Buffer.from(args.text, "utf8").toString("base64"),
    ...(args.sha ? { sha: args.sha } : {}),
  });
  return data.content?.sha ?? "";
}

/** Un unico commit con più file (Git Data API), sul branch predefinito. */
export async function commitFiles(
  gh: GitHub,
  owner: string,
  repo: string,
  message: string,
  files: { path: string; text: string }[],
): Promise<void> {
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  const branch = info.default_branch;

  let parentSha: string;
  try {
    const { data: ref } = await gh.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    parentSha = ref.object.sha;
  } catch (err) {
    // Repository vuoto (nessun commit): il primo file passa dalla Contents API.
    if (!isStatus(err, 409) && !isStatus(err, 404)) throw err;
    const [first, ...rest] = files;
    await writeText(gh, { owner, repo, path: first.path, text: first.text, message });
    if (rest.length) await commitFiles(gh, owner, repo, message, rest);
    return;
  }

  const { data: parent } = await gh.rest.git.getCommit({ owner, repo, commit_sha: parentSha });
  const { data: tree } = await gh.rest.git.createTree({
    owner,
    repo,
    base_tree: parent.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: "100644" as const, type: "blob" as const, content: f.text })),
  });
  const { data: commit } = await gh.rest.git.createCommit({ owner, repo, message, tree: tree.sha, parents: [parentSha] });
  // Senza force: se il branch è avanzato nel frattempo GitHub rifiuta e l'autore riprova.
  await gh.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });
}

export interface CommitSummary {
  sha: string;
  message: string;
  date: string | null;
  author: string | null;
}

export async function listFileCommits(gh: GitHub, owner: string, repo: string, path: string): Promise<CommitSummary[]> {
  const { data } = await gh.rest.repos.listCommits({ owner, repo, path, per_page: 50 });
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author?.date ?? c.commit.committer?.date ?? null,
    author: c.author?.login ?? c.commit.author?.name ?? null,
  }));
}

export async function createRepo(
  gh: GitHub,
  args: { name: string; description: string; private: boolean },
): Promise<{ owner: string; repo: string }> {
  try {
    const { data } = await gh.rest.repos.createForAuthenticatedUser({
      name: args.name,
      description: args.description,
      private: args.private,
      auto_init: true,
    });
    return { owner: data.owner.login, repo: data.name };
  } catch (err) {
    if (isStatus(err, 422)) {
      throw new ApiError(409, `Esiste già un repository chiamato «${args.name}»: scegli un altro nome.`);
    }
    throw err;
  }
}

export async function addTopic(gh: GitHub, owner: string, repo: string, topic: string): Promise<void> {
  const { data } = await gh.rest.repos.getAllTopics({ owner, repo });
  if (data.names.includes(topic)) return;
  await gh.rest.repos.replaceAllTopics({ owner, repo, names: [...data.names, topic] });
}

export interface TreeEntry {
  path: string;
  sha: string;
}

/** Tutti i file del branch predefinito (un'unica richiesta); vuoto se il repository non ha commit. */
export async function listTree(gh: GitHub, owner: string, repo: string): Promise<TreeEntry[]> {
  const { data: info } = await gh.rest.repos.get({ owner, repo });
  try {
    const { data } = await gh.rest.git.getTree({ owner, repo, tree_sha: info.default_branch, recursive: "1" });
    if (data.truncated) console.warn(`Albero di ${owner}/${repo} troncato da GitHub`);
    return data.tree.filter((e) => e.type === "blob" && e.path && e.sha).map((e) => ({ path: e.path!, sha: e.sha! }));
  } catch (err) {
    if (isStatus(err, 409) || isStatus(err, 404)) return [];
    throw err;
  }
}

export async function readBlob(gh: GitHub, owner: string, repo: string, sha: string): Promise<string> {
  const { data } = await gh.rest.git.getBlob({ owner, repo, file_sha: sha });
  return Buffer.from(data.content, "base64").toString("utf8");
}

/** Legge più blob in parallelo, al massimo `limit` richieste alla volta. */
export async function readBlobs(gh: GitHub, owner: string, repo: string, entries: TreeEntry[], limit = 8): Promise<string[]> {
  const out: string[] = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      out[i] = await readBlob(gh, owner, repo, entries[i].sha);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, worker));
  return out;
}

/** Elimina un file; con `sha` GitHub rifiuta (409) se è cambiato nel frattempo. */
export async function deleteFile(
  gh: GitHub,
  args: { owner: string; repo: string; path: string; sha: string; message: string },
): Promise<void> {
  await gh.rest.repos.deleteFile(args);
}

export async function getLogin(gh: GitHub): Promise<string> {
  const { data } = await gh.rest.users.getAuthenticated();
  return data.login;
}

export async function repoExists(gh: GitHub, owner: string, repo: string): Promise<boolean> {
  try {
    await gh.rest.repos.get({ owner, repo });
    return true;
  } catch (err) {
    if (isStatus(err, 404)) return false;
    throw err;
  }
}
