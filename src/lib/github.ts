import { Octokit } from "octokit";

const SAGA_TOPIC = "writly-saga";

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

export interface RepoFile {
  content: string;
  sha: string;
}

export async function getFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<RepoFile | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
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
  path: string
) {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
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
  sha?: string
) {
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    sha,
  });
  return data;
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
  perPage = 20
): Promise<CommitSummary[]> {
  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    path,
    per_page: perPage,
  });

  return data.map((entry) => ({
    sha: entry.sha,
    message: entry.commit.message,
    author: entry.commit.author?.name ?? entry.author?.login ?? "Sconosciuto",
    date: entry.commit.author?.date ?? null,
    htmlUrl: entry.html_url,
  }));
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 404
  );
}
