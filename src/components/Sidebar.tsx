"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { apiFetch, withBranch } from "@/lib/api-client";
import { signOutAction } from "@/lib/actions";
import { useBranchSelection } from "@/contexts/BranchContext";
import { MergeBranchesDialog } from "@/components/MergeBranchesDialog";
import type { SagaSummary, BranchSummary } from "@/lib/github";
import type { RomanzoSummary, CapitoloSummary } from "@/lib/domain";

interface Context {
  owner: string;
  repo: string;
  slug?: string;
}

function parseContext(pathname: string): Context | null {
  const match = pathname.match(/^\/saga\/([^/]+)\/([^/]+)(?:\/romanzo\/([^/]+))?/);
  if (!match) return null;
  const [, owner, repo, slug] = match;
  return { owner, repo, slug };
}

function navLinkClass(active: boolean): string {
  return `block truncate rounded px-2 py-1 text-sm ${
    active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
  }`;
}

export function Sidebar({
  user,
}: {
  user: { name: string | null; image: string | null; login: string | null };
}) {
  const pathname = usePathname();
  const ctx = useMemo(() => parseContext(pathname), [pathname]);
  const activeFile = useMemo(() => {
    const match = pathname.match(/\/capitolo\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const [sagas, setSagas] = useState<SagaSummary[] | null>(null);
  const [romanziByKey, setRomanziByKey] = useState<{
    key: string;
    data: RomanzoSummary[];
  } | null>(null);
  const [capitoliByKey, setCapitoliByKey] = useState<{
    key: string;
    data: CapitoloSummary[];
  } | null>(null);
  const [branchInfoByKey, setBranchInfoByKey] = useState<{
    key: string;
    branches: BranchSummary[];
    defaultBranch: string;
  } | null>(null);

  const { getBranch, setBranch } = useBranchSelection();
  const branch = ctx ? getBranch(ctx.owner, ctx.repo) : undefined;
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ sagas: SagaSummary[] }>("/api/sagas")
      .then((data) => setSagas(data.sagas))
      .catch(() => setSagas([]));
  }, []);

  useEffect(() => {
    if (!ctx) return;
    const key = `${ctx.owner}/${ctx.repo}`;
    apiFetch<{ branches: BranchSummary[]; defaultBranch: string }>(
      `/api/sagas/${ctx.owner}/${ctx.repo}/branches`
    )
      .then((data) =>
        setBranchInfoByKey({
          key,
          branches: data.branches,
          defaultBranch: data.defaultBranch,
        })
      )
      .catch(() => {});
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;
    const key = `${ctx.owner}/${ctx.repo}`;
    apiFetch<{ romanzi: RomanzoSummary[] }>(
      withBranch(`/api/sagas/${ctx.owner}/${ctx.repo}/romanzi`, branch)
    )
      .then((data) => setRomanziByKey({ key, data: data.romanzi }))
      .catch(() => setRomanziByKey({ key, data: [] }));
  }, [ctx, branch]);

  useEffect(() => {
    if (!ctx?.slug) return;
    const key = `${ctx.owner}/${ctx.repo}/${ctx.slug}`;
    apiFetch<{ capitoli: CapitoloSummary[] }>(
      withBranch(
        `/api/sagas/${ctx.owner}/${ctx.repo}/romanzi/${ctx.slug}/capitoli`,
        branch
      )
    )
      .then((data) => setCapitoliByKey({ key, data: data.capitoli }))
      .catch(() => setCapitoliByKey({ key, data: [] }));
  }, [ctx, branch]);

  const branchInfo =
    ctx && branchInfoByKey?.key === `${ctx.owner}/${ctx.repo}` ? branchInfoByKey : null;

  const [staleBranchNotice, setStaleBranchNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !branchInfo || !branch) return;
    const stillExists = branchInfo.branches.some((b) => b.name === branch);
    if (stillExists) return;
    queueMicrotask(() => {
      setStaleBranchNotice(
        `Il branch "${branch}" non esiste più su GitHub: tornato su "${branchInfo.defaultBranch}".`
      );
      setBranch(ctx.owner, ctx.repo, undefined);
    });
  }, [ctx, branchInfo, branch, setBranch]);

  const romanzi =
    ctx && romanziByKey?.key === `${ctx.owner}/${ctx.repo}` ? romanziByKey.data : null;
  const capitoli =
    ctx?.slug && capitoliByKey?.key === `${ctx.owner}/${ctx.repo}/${ctx.slug}`
      ? capitoliByKey.data
      : null;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <Link
        href="/dashboard"
        className="flex items-center border-b border-zinc-200 px-4 py-4 text-base font-semibold"
      >
        Writly
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Le tue saghe
        </div>
        {sagas === null && (
          <p className="px-2 text-xs text-zinc-400">Caricamento…</p>
        )}
        {sagas?.length === 0 && (
          <p className="px-2 text-xs text-zinc-400">Nessuna saga ancora.</p>
        )}
        <div className="flex flex-col gap-0.5">
          {sagas?.map((saga) => {
            const isActiveSaga = ctx?.owner === saga.owner && ctx?.repo === saga.repo;
            const sagaHref = `/saga/${saga.owner}/${saga.repo}`;

            return (
              <div key={`${saga.owner}/${saga.repo}`}>
                <Link
                  href={sagaHref}
                  className={navLinkClass(isActiveSaga && !ctx?.slug && pathname === sagaHref)}
                >
                  {saga.name}
                </Link>

                {isActiveSaga && (
                  <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-zinc-200 pl-3">
                    {branchInfo && (
                      <label className="mb-1 flex flex-col gap-0.5 px-2 text-[11px] text-zinc-400">
                        Branch
                        <select
                          value={branch ?? branchInfo.defaultBranch}
                          onChange={(e) => {
                            const value = e.target.value;
                            setStaleBranchNotice(null);
                            setBranch(
                              ctx.owner,
                              ctx.repo,
                              value === branchInfo.defaultBranch ? undefined : value
                            );
                          }}
                          className="min-w-0 rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-700"
                        >
                          {branchInfo.branches.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                              {b.name === branchInfo.defaultBranch ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {staleBranchNotice && (
                      <p className="mb-1 px-2 text-[11px] text-amber-600">
                        {staleBranchNotice}
                      </p>
                    )}
                    {branchInfo && branchInfo.branches.length > 1 && (
                      <button
                        onClick={() => setMergeOpen(true)}
                        className="mb-1 px-2 text-left text-[11px] text-zinc-400 hover:text-zinc-700 hover:underline"
                      >
                        Unisci branch…
                      </button>
                    )}
                    <Link
                      href={`${sagaHref}/personaggi`}
                      className={navLinkClass(pathname === `${sagaHref}/personaggi`)}
                    >
                      Schede personaggio
                    </Link>

                    <div className="mt-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      Romanzi
                    </div>
                    {romanzi === null && (
                      <p className="px-2 text-xs text-zinc-400">Caricamento…</p>
                    )}
                    {romanzi?.length === 0 && (
                      <p className="px-2 text-xs text-zinc-400">Nessun romanzo.</p>
                    )}
                    {romanzi?.map((romanzo) => {
                      const isActiveRomanzo = ctx?.slug === romanzo.slug;
                      const romanzoHref = `${sagaHref}/romanzo/${romanzo.slug}`;

                      return (
                        <div key={romanzo.slug}>
                          <Link
                            href={romanzoHref}
                            className={navLinkClass(pathname === romanzoHref)}
                          >
                            {romanzo.title}
                          </Link>

                          {isActiveRomanzo && (
                            <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-zinc-200 pl-3">
                              <Link
                                href={`${romanzoHref}/scene`}
                                className={navLinkClass(pathname === `${romanzoHref}/scene`)}
                              >
                                Architettura delle scene
                              </Link>
                              <Link
                                href={`${romanzoHref}/pdf`}
                                className={navLinkClass(pathname === `${romanzoHref}/pdf`)}
                              >
                                Esporta PDF
                              </Link>
                              {capitoli?.map((capitolo) => (
                                <Link
                                  key={capitolo.file}
                                  href={`${romanzoHref}/capitolo/${encodeURIComponent(capitolo.file)}`}
                                  className={navLinkClass(activeFile === capitolo.file)}
                                >
                                  <span className="text-zinc-400">
                                    {String(capitolo.order).padStart(2, "0")}
                                  </span>{" "}
                                  {capitolo.title}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-2">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">
              {user.name ?? user.login ?? "Account"}
            </p>
            {user.login && (
              <a
                href={`https://github.com/${user.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-xs text-zinc-400 hover:text-zinc-700"
              >
                @{user.login} ↗
              </a>
            )}
          </div>
        </div>
        <form action={signOutAction} className="mt-2">
          <button
            type="submit"
            className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
          >
            Esci
          </button>
        </form>
      </div>

      {mergeOpen && ctx && branchInfo && (
        <MergeBranchesDialog
          owner={ctx.owner}
          repo={ctx.repo}
          branches={branchInfo.branches}
          defaultHead={branch ?? branchInfo.defaultBranch}
          defaultBase={branchInfo.defaultBranch}
          onClose={() => setMergeOpen(false)}
        />
      )}
    </aside>
  );
}
