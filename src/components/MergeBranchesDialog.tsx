"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Modal } from "@/components/Modal";
import type { BranchSummary } from "@/lib/github";

export function MergeBranchesDialog({
  owner,
  repo,
  branches,
  defaultBase,
  defaultHead,
  onClose,
}: {
  owner: string;
  repo: string;
  branches: BranchSummary[];
  defaultBase: string;
  defaultHead: string;
  onClose: () => void;
}) {
  const [base, setBase] = useState(defaultBase);
  const [head, setHead] = useState(defaultHead);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const invalid = !base || !head || base === head;

  async function handleMerge() {
    if (invalid) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/sagas/${owner}/${repo}/merge`, {
        method: "POST",
        body: JSON.stringify({ base, head, message: message.trim() || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-md">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Unisci branch</h2>

      {done ? (
        <>
          <p className="mt-3 text-sm text-green-700">
            Merge completato su GitHub. Ricarica la pagina per vedere le modifiche
            più recenti.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            >
              Ricarica
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-500">
            Porta le modifiche di un branch dentro un altro, creando un commit di
            merge su GitHub.
          </p>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Da (branch con le modifiche)
              <select
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="min-w-0 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              A (branch di destinazione)
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="min-w-0 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Messaggio di commit (opzionale)
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Merge ${head} in ${base}`}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {base === head && (
            <p className="mt-3 text-sm text-amber-700">
              Scegli due branch diversi.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
            >
              Annulla
            </button>
            <button
              onClick={handleMerge}
              disabled={invalid || submitting}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Merge in corso…" : "Esegui merge"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
