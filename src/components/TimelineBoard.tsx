"use client";

import { useEffect, useState } from "react";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import type { RomanzoSummary } from "@/lib/domain";
import type { Character, Scene, TimelineEvent } from "@/lib/types";

function emptyEvent(order: number): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    title: "",
    order,
    personaggi: [],
  };
}

export function TimelineBoard({ owner, repo }: { owner: string; repo: string }) {
  const branch = useCurrentBranch(owner, repo);
  const base = withBranch(`/api/sagas/${owner}/${repo}/timeline`, branch);
  const charactersBase = withBranch(`/api/sagas/${owner}/${repo}/personaggi`, branch);
  const romanziBase = withBranch(`/api/sagas/${owner}/${repo}/romanzi`, branch);

  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [romanzi, setRomanzi] = useState<RomanzoSummary[]>([]);
  const [scenesByRomanzo, setScenesByRomanzo] = useState<Record<string, Scene[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  useEffect(() => {
    Promise.all([
      apiFetch<{ events: TimelineEvent[] }>(base),
      apiFetch<{ characters: Character[] }>(charactersBase),
      apiFetch<{ romanzi: RomanzoSummary[] }>(romanziBase),
    ])
      .then(([eventData, characterData, romanzoData]) => {
        setEvents([...eventData.events].sort((a, b) => a.order - b.order));
        setCharacters(characterData.characters);
        setRomanzi(romanzoData.romanzi);
      })
      .catch((err) => setError(err.message));
  }, [base, charactersBase, romanziBase]);

  function ensureScenesLoaded(romanzoSlug: string) {
    if (!romanzoSlug || scenesByRomanzo[romanzoSlug]) return;
    apiFetch<{ scenes: Scene[] }>(
      withBranch(`/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/scene`, branch)
    )
      .then((data) =>
        setScenesByRomanzo((prev) => ({ ...prev, [romanzoSlug]: data.scenes }))
      )
      .catch(() => {});
  }

  function updateEvent(id: string, patch: Partial<TimelineEvent>) {
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === id ? { ...e, ...patch } : e)) : prev
    );
  }

  function toggleCharacter(eventId: string, characterId: string) {
    setEvents((prev) =>
      prev
        ? prev.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  personaggi: e.personaggi.includes(characterId)
                    ? e.personaggi.filter((id) => id !== characterId)
                    : [...e.personaggi, characterId],
                }
              : e
          )
        : prev
    );
  }

  function addEvent() {
    setEvents((prev) => [...(prev ?? []), emptyEvent((prev?.length ?? 0) + 1)]);
  }

  function removeEvent(id: string) {
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
  }

  async function handleSaveAll() {
    if (!events) return;
    const message = await promptMessage("Aggiorna timeline degli eventi");
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch(base, {
        method: "PUT",
        body: JSON.stringify({ events, message }),
      });
      setStatus("Timeline salvata su GitHub.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  if (events === null) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  const sorted = [...events].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={addEvent}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
        >
          + Nuovo evento
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

      <div className="flex flex-col gap-4">
        {sorted.map((event, index) => (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-2">
              <div className="h-3 w-3 rounded-full bg-zinc-900" />
              {index < sorted.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-zinc-200" />
              )}
            </div>
            <div className="mb-2 flex flex-1 flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={event.title}
                  onChange={(e) => updateEvent(event.id, { title: e.target.value })}
                  placeholder="Titolo evento"
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm font-medium"
                />
                <input
                  type="number"
                  value={event.order}
                  onChange={(e) =>
                    updateEvent(event.id, { order: Number(e.target.value) })
                  }
                  className="w-16 shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs"
                />
                <button
                  onClick={() => removeEvent(event.id)}
                  className="shrink-0 text-xs text-red-600 hover:underline"
                >
                  Rimuovi
                </button>
              </div>

              <input
                value={event.tempo ?? ""}
                onChange={(e) => updateEvent(event.id, { tempo: e.target.value })}
                placeholder="Collocazione temporale (es. 'inverno, tre anni prima')"
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              />

              <textarea
                value={event.description ?? ""}
                onChange={(e) =>
                  updateEvent(event.id, { description: e.target.value })
                }
                placeholder="Descrizione"
                rows={2}
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={event.romanzoSlug ?? ""}
                  onChange={(e) => {
                    const romanzoSlug = e.target.value || undefined;
                    updateEvent(event.id, { romanzoSlug, sceneId: undefined });
                    if (romanzoSlug) ensureScenesLoaded(romanzoSlug);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs"
                >
                  <option value="">— romanzo (opzionale) —</option>
                  {romanzi.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <select
                  value={event.sceneId ?? ""}
                  disabled={!event.romanzoSlug}
                  onChange={(e) =>
                    updateEvent(event.id, { sceneId: e.target.value || undefined })
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="">— scena (opzionale) —</option>
                  {(scenesByRomanzo[event.romanzoSlug ?? ""] ?? []).map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1">
                {characters.map((character) => {
                  const active = event.personaggi.includes(character.id);
                  return (
                    <button
                      key={character.id}
                      onClick={() => toggleCharacter(event.id, character.id)}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        active
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {character.name || "(senza nome)"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      {commitDialog}
    </div>
  );
}
