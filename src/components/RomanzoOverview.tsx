"use client";

import { useEffect, useState } from "react";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import type { CapitoloSummary } from "@/lib/domain";

export function RomanzoOverview({
  owner,
  repo,
  slug,
  title,
}: {
  owner: string;
  repo: string;
  slug: string;
  title: string;
}) {
  const [capitoli, setCapitoli] = useState<CapitoloSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const branch = useCurrentBranch(owner, repo);
  const base = withBranch(
    `/api/sagas/${owner}/${repo}/romanzi/${slug}/capitoli`,
    branch
  );

  useEffect(() => {
    apiFetch<{ capitoli: CapitoloSummary[] }>(base)
      .then((data) => setCapitoli(data.capitoli))
      .catch((err) => setError(err.message));
  }, [base]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<CapitoloSummary>(base, {
        method: "POST",
        body: JSON.stringify({ title: newTitle }),
      });
      setCapitoli((prev) => [...(prev ?? []), created]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex gap-2">
          <a
            href={`/saga/${owner}/${repo}/romanzo/${slug}/scene`}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Architettura delle scene
          </a>
          <a
            href={`/saga/${owner}/${repo}/romanzo/${slug}/pdf`}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Esporta PDF
          </a>
        </div>
      </div>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Nuovo capitolo</h2>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titolo del capitolo"
            className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creazione…" : "Crea capitolo"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Capitoli</h2>
        {capitoli === null && <p className="text-sm text-zinc-500">Caricamento…</p>}
        {capitoli?.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nessun capitolo ancora. Creane uno qui sopra.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {capitoli?.map((capitolo) => (
            <li key={capitolo.file}>
              <a
                href={`/saga/${owner}/${repo}/romanzo/${slug}/capitolo/${encodeURIComponent(
                  capitolo.file
                )}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
              >
                <span className="text-sm text-zinc-400">
                  {String(capitolo.order).padStart(2, "0")}
                </span>
                <span className="font-medium">{capitolo.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
