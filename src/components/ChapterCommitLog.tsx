"use client";

import { useEffect, useState } from "react";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import type { CommitSummary } from "@/lib/github";

export function ChapterCommitLog({
  owner,
  repo,
  romanzoSlug,
  file,
  refreshKey,
}: {
  owner: string;
  repo: string;
  romanzoSlug: string;
  file: string;
  refreshKey: number;
}) {
  const [commits, setCommits] = useState<CommitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const branch = useCurrentBranch(owner, repo);

  useEffect(() => {
    apiFetch<{ commits: CommitSummary[] }>(
      withBranch(
        `/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/capitoli/${encodeURIComponent(
          file
        )}/commits`,
        branch
      )
    )
      .then((data) => setCommits(data.commits))
      .catch((err) => setError(err.message));
  }, [owner, repo, romanzoSlug, file, refreshKey, branch]);

  return (
    <div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {commits === null && !error && (
        <p className="text-sm text-zinc-500">Caricamento…</p>
      )}
      {commits?.length === 0 && (
        <p className="text-sm text-zinc-500">Nessun commit ancora.</p>
      )}
      <ul className="flex flex-col gap-2">
        {commits?.map((commit) => (
          <li
            key={commit.sha}
            className="rounded-lg border border-zinc-200 bg-white p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <a
                href={commit.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-zinc-400 hover:text-zinc-700"
              >
                {commit.sha.slice(0, 7)}
              </a>
              {commit.date && (
                <span className="text-xs text-zinc-400">
                  {new Date(commit.date).toLocaleString("it-IT")}
                </span>
              )}
            </div>
            <p className="mt-1 text-zinc-700">{commit.message.split("\n")[0]}</p>
            <p className="mt-1 text-xs text-zinc-500">{commit.author}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
