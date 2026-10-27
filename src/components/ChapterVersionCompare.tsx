"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { diffWords } from "diff";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import { stripHighlights } from "@/lib/markdown";
import type { CommitSummary } from "@/lib/github";

const CURRENT = "current";

interface VersionCompareProps {
  owner: string;
  repo: string;
  romanzoSlug: string;
  file: string;
  currentContent: string;
  isDirty: boolean;
  refreshKey: number;
}

function formatCommitLabel(commit: CommitSummary): string {
  const date = commit.date ? new Date(commit.date).toLocaleString("it-IT") : "";
  const summary = commit.message.split("\n")[0];
  return `${date ? date + " — " : ""}${summary} (${commit.sha.slice(0, 7)})`;
}

export function ChapterVersionCompare({
  owner,
  repo,
  romanzoSlug,
  file,
  currentContent,
  isDirty,
  refreshKey,
}: VersionCompareProps) {
  const branch = useCurrentBranch(owner, repo);
  const commitsPath = `/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/capitoli/${encodeURIComponent(
    file
  )}/commits`;
  const base = withBranch(commitsPath, branch);

  const [commits, setCommits] = useState<CommitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftChoice, setLeftChoice] = useState<string>(CURRENT);
  const [rightChoice, setRightChoice] = useState<string>(CURRENT);
  const [initialized, setInitialized] = useState(false);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const inFlightShas = useRef<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<{ commits: CommitSummary[] }>(base)
      .then((data) => {
        setCommits(data.commits);
        if (!initialized) {
          if (data.commits.length > 0) {
            setLeftChoice(data.commits[0].sha);
          }
          setRightChoice(CURRENT);
          setInitialized(true);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, refreshKey]);

  useEffect(() => {
    const toFetch = [leftChoice, rightChoice].filter(
      (choice) =>
        choice !== CURRENT && !(choice in contentCache) && !inFlightShas.current.has(choice)
    );
    for (const choice of toFetch) {
      inFlightShas.current.add(choice);
      apiFetch<{ content: string }>(`${commitsPath}/${choice}`)
        .then((data) => {
          setContentCache((prev) => ({ ...prev, [choice]: data.content }));
        })
        .catch((err) => setError(err.message))
        .finally(() => {
          inFlightShas.current.delete(choice);
        });
    }
  }, [leftChoice, rightChoice, commitsPath, contentCache]);

  function resolveContent(choice: string): string | null {
    if (choice === CURRENT) return currentContent;
    return contentCache[choice] ?? null;
  }

  const leftContent = resolveContent(leftChoice);
  const rightContent = resolveContent(rightChoice);
  const pending = leftContent === null || rightContent === null;

  const diffParts = useMemo(() => {
    if (leftContent === null || rightContent === null) return null;
    return diffWords(stripHighlights(leftContent), stripHighlights(rightContent));
  }, [leftContent, rightContent]);
  const identical = diffParts?.every((p) => !p.added && !p.removed) ?? false;

  function renderOptions() {
    return (
      <>
        <option value={CURRENT}>
          Versione attuale nell&rsquo;editor{isDirty ? " (non salvata)" : ""}
        </option>
        {commits?.map((commit) => (
          <option key={commit.sha} value={commit.sha}>
            {formatCommitLabel(commit)}
          </option>
        ))}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
          Versione A
          <select
            value={leftChoice}
            onChange={(e) => setLeftChoice(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {renderOptions()}
          </select>
        </label>
        <span className="hidden text-zinc-400 sm:block">→</span>
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
          Versione B
          <select
            value={rightChoice}
            onChange={(e) => setRightChoice(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {renderOptions()}
          </select>
        </label>
      </div>

      {pending && <p className="text-sm text-zinc-500">Caricamento versione…</p>}

      {!pending && diffParts && !identical && (
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-100" />
            Rimosso
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-100" />
            Aggiunto
          </span>
        </div>
      )}

      {!pending && diffParts && identical && (
        <p className="text-sm text-zinc-500">
          Nessuna differenza tra le due versioni selezionate.
        </p>
      )}

      {!pending && diffParts && !identical && (
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed">
          {diffParts.map((part, i) => (
            <span
              key={i}
              className={
                part.added
                  ? "bg-green-100 text-green-900"
                  : part.removed
                    ? "bg-red-100 text-red-900 line-through"
                    : undefined
              }
            >
              {part.value}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}
