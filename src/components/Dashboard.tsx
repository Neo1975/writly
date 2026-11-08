"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SagaSummary } from "@/lib/github";

export function Dashboard() {
  const router = useRouter();
  const [sagas, setSagas] = useState<SagaSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    apiFetch<{ sagas: SagaSummary[] }>("/api/sagas")
      .then((data) => setSagas(data.sagas))
      .catch((err) => setError(err.message));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<{ owner: string; repo: string }>(
        "/api/sagas",
        { method: "POST", body: JSON.stringify({ title, description }) }
      );
      router.push(`/saga/${created.owner}/${created.repo}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">
          Nuova saga
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo della saga"
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
            className="flex items-center gap-1.5 self-start rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Creazione in corso…" : "Crea saga e repository GitHub"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Le tue saghe</h2>
        {sagas === null && <p className="text-sm text-zinc-500">Caricamento…</p>}
        {sagas?.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nessuna saga ancora. Creane una qui sopra.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {sagas?.map((saga) => (
            <li key={`${saga.owner}/${saga.repo}`}>
              <a
                href={`/saga/${saga.owner}/${saga.repo}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
              >
                <div className="font-medium">{saga.name}</div>
                {saga.description && (
                  <div className="text-sm text-zinc-500">{saga.description}</div>
                )}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
