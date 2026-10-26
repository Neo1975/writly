"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import type { CapitoloSummary } from "@/lib/domain";
import type { Scene, SceneStatus } from "@/lib/types";

const STATUSES: SceneStatus[] = ["bozza", "revisione", "finale"];

function emptyScene(order: number): Scene {
  return {
    id: crypto.randomUUID(),
    title: "",
    personaggi: [],
    order,
    status: "bozza",
  };
}

export function SceneBoard({
  owner,
  repo,
  slug,
}: {
  owner: string;
  repo: string;
  slug: string;
}) {
  const sceneBase = `/api/sagas/${owner}/${repo}/romanzi/${slug}/scene`;
  const capitoliBase = `/api/sagas/${owner}/${repo}/romanzi/${slug}/capitoli`;

  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [capitoli, setCapitoli] = useState<CapitoloSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  useEffect(() => {
    Promise.all([
      apiFetch<{ scenes: Scene[] }>(sceneBase),
      apiFetch<{ capitoli: CapitoloSummary[] }>(capitoliBase),
    ])
      .then(([sceneData, capitoloData]) => {
        setScenes(sceneData.scenes);
        setCapitoli(capitoloData.capitoli);
      })
      .catch((err) => setError(err.message));
  }, [sceneBase, capitoliBase]);

  function updateScene(id: string, patch: Partial<Scene>) {
    setScenes((prev) =>
      prev ? prev.map((s) => (s.id === id ? { ...s, ...patch } : s)) : prev
    );
  }

  function addScene() {
    setScenes((prev) => [...(prev ?? []), emptyScene((prev?.length ?? 0) + 1)]);
  }

  function removeScene(id: string) {
    setScenes((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  }

  async function handleSaveAll() {
    if (!scenes) return;
    const message = await promptMessage("Aggiorna architettura scene");
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch(sceneBase, {
        method: "PUT",
        body: JSON.stringify({ scenes, message }),
      });
      setStatus("Architettura delle scene salvata su GitHub.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  if (scenes === null) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={addScene}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
        >
          + Nuova scena
        </button>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva su GitHub"}
        </button>
        {status && <span className="text-sm text-green-700">{status}</span>}
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <input
                value={scene.title}
                onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                placeholder="Titolo scena"
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm font-medium"
              />
              <button
                onClick={() => removeScene(scene.id)}
                className="ml-2 shrink-0 text-xs text-red-600 hover:underline"
              >
                Rimuovi
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={scene.chapterFile ?? ""}
                onChange={(e) =>
                  updateScene(scene.id, { chapterFile: e.target.value || undefined })
                }
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                <option value="">— capitolo —</option>
                {capitoli.map((c) => (
                  <option key={c.file} value={c.file}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select
                value={scene.status}
                onChange={(e) =>
                  updateScene(scene.id, { status: e.target.value as SceneStatus })
                }
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                value={scene.pov ?? ""}
                onChange={(e) => updateScene(scene.id, { pov: e.target.value })}
                placeholder="POV"
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              />
              <input
                value={scene.luogo ?? ""}
                onChange={(e) => updateScene(scene.id, { luogo: e.target.value })}
                placeholder="Luogo"
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              />
              <input
                value={scene.tempo ?? ""}
                onChange={(e) => updateScene(scene.id, { tempo: e.target.value })}
                placeholder="Tempo"
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              />
              <input
                value={scene.personaggi.join(", ")}
                onChange={(e) =>
                  updateScene(scene.id, {
                    personaggi: e.target.value
                      .split(",")
                      .map((p) => p.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Personaggi (separati da virgola)"
                className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-xs"
              />
            </div>

            <textarea
              value={scene.obiettivo ?? ""}
              onChange={(e) => updateScene(scene.id, { obiettivo: e.target.value })}
              placeholder="Obiettivo"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={scene.conflitto ?? ""}
              onChange={(e) => updateScene(scene.id, { conflitto: e.target.value })}
              placeholder="Conflitto"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={scene.esito ?? ""}
              onChange={(e) => updateScene(scene.id, { esito: e.target.value })}
              placeholder="Esito"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
      {commitDialog}
    </div>
  );
}
