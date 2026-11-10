import { Octokit } from "octokit";

const SAGA_TOPIC = "writly-saga";
const PERSONAL_TOPIC = "writly-personal";
const PERSONAL_REPO_NAME = "writly-agendina";

export function getOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export async function getAuthenticatedUsername(octokit: Octokit) {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

export interface SagaSummary {
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
  htmlUrl: string;
}

export async function listSagas(
  octokit: Octokit,
  username: string
): Promise<SagaSummary[]> {
  const { data } = await octokit.rest.search.repos({
    q: `topic:${SAGA_TOPIC} user:${username}`,
    sort: "updated",
  });

  return data.items.map((repo) => ({
    owner: repo.owner?.login ?? username,
    repo: repo.name,
    name: repo.name,
    description: repo.description,
    updatedAt: repo.updated_at ?? null,
    htmlUrl: repo.html_url,
  }));
}

export async function createSagaRepo(
  octokit: Octokit,
  params: { name: string; description?: string }
) {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: params.name,
    description: params.description,
    private: true,
    auto_init: true,
  });

  await octokit.rest.repos.replaceAllTopics({
    owner: data.owner.login,
    repo: data.name,
    names: [SAGA_TOPIC],
  });

  return { owner: data.owner.login, repo: data.name, htmlUrl: data.html_url };
}

export interface PersonalRepoSummary {
  owner: string;
  repo: string;
  htmlUrl: string;
}

export async function findPersonalRepo(
  octokit: Octokit,
  username: string
): Promise<PersonalRepoSummary | null> {
  const { data } = await octokit.rest.search.repos({
    q: `topic:${PERSONAL_TOPIC} user:${username}`,
  });
  const repo = data.items[0];
  if (!repo) return null;
  return {
    owner: repo.owner?.login ?? username,
    repo: repo.name,
    htmlUrl: repo.html_url,
  };
}

export async function createPersonalRepo(
  octokit: Octokit
): Promise<PersonalRepoSummary> {
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: PERSONAL_REPO_NAME,
    description: "Agendina personale Writly",
    private: true,
    auto_init: true,
  });

  await octokit.rest.repos.replaceAllTopics({
    owner: data.owner.login,
    repo: data.name,
    names: [PERSONAL_TOPIC],
  });

  return { owner: data.owner.login, repo: data.name, htmlUrl: data.html_url };
}

export interface RepoFile {
  content: string;
  sha: string;
}

export async function getFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<RepoFile | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }
    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function listDir(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string
) {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (!Array.isArray(data)) return [];
    return data;
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
}

export async function putFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string
) {
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    sha,
    branch,
  });
  return data;
}

export async function deleteFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  message: string,
  sha: string,
  branch?: string
) {
  await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    sha,
    branch,
  });
}

export interface BranchSummary {
  name: string;
  protected: boolean;
}

export async function listBranches(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<BranchSummary[]> {
  const { data } = await octokit.rest.repos.listBranches({
    owner,
    repo,
    per_page: 100,
  });
  return data.map((branch) => ({ name: branch.name, protected: branch.protected }));
}

export async function getDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  date: string | null;
  htmlUrl: string;
}

export async function listFileCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  options: { perPage?: number; branch?: string } = {}
): Promise<CommitSummary[]> {
  const { perPage = 20, branch } = options;
  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    path,
    per_page: perPage,
    sha: branch,
  });

  return data.map((entry) => ({
    sha: entry.sha,
    message: entry.commit.message,
    author: entry.commit.author?.name ?? entry.author?.login ?? "Sconosciuto",
    date: entry.commit.author?.date ?? null,
    htmlUrl: entry.html_url,
  }));
}

export async function getFileAtRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      return null;
    }
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export interface MergeResult {
  status: "merged" | "up-to-date" | "conflict";
  sha?: string;
}

export async function mergeBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
  commitMessage?: string
): Promise<MergeResult> {
  try {
    const response = await octokit.rest.repos.merge({
      owner,
      repo,
      base,
      head,
      commit_message: commitMessage,
    });
    const status: number = response.status;
    if (status === 204) {
      return { status: "up-to-date" };
    }
    return { status: "merged", sha: response.data.sha };
  } catch (error) {
    if (isConflictError(error)) {
      return { status: "conflict" };
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 404
  );
}

function isConflictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 409
  );
}

export function isUnauthorizedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 401
  );
}
