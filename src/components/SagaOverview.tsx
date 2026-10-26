"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { RomanzoSummary } from "@/lib/domain";

export function SagaOverview({ owner, repo }: { owner: string; repo: string }) {
  const [romanzi, setRomanzi] = useState<RomanzoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const base = `/api/sagas/${owner}/${repo}/romanzi`;

  useEffect(() => {
    apiFetch<{ romanzi: RomanzoSummary[] }>(base)
      .then((data) => setRomanzi(data.romanzi))
      .catch((err) => setError(err.message));
  }, [base]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<RomanzoSummary>(base, {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      setRomanzi((prev) => [...(prev ?? []), created]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6 flex justify-end">
        <a
          href={`/saga/${owner}/${repo}/personaggi`}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
        >
          Schede personaggio
        </a>
      </div>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Nuovo romanzo</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo del romanzo"
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creazione in corso…" : "Crea romanzo"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Romanzi</h2>
        {romanzi === null && <p className="text-sm text-zinc-500">Caricamento…</p>}
        {romanzi?.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nessun romanzo ancora. Creane uno qui sopra.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {romanzi?.map((romanzo) => (
            <li key={romanzo.slug}>
              <a
                href={`/saga/${owner}/${repo}/romanzo/${romanzo.slug}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
              >
                <div className="font-medium">{romanzo.title}</div>
                <div className="text-sm text-zinc-500">
                  {romanzo.status} {romanzo.description ? `— ${romanzo.description}` : ""}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
