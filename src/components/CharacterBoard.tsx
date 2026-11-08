"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import { useCommitMessageDialog } from "@/hooks/useCommitMessageDialog";
import type { Character, CharacterRelationship, CharacterRole } from "@/lib/types";
import { CharacterGraph } from "@/components/CharacterGraph";

const ROLES: CharacterRole[] = ["protagonista", "antagonista", "comprimario", "altro"];

function emptyCharacter(order: number): Character {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "comprimario",
    order,
  };
}

export function CharacterBoard({ owner, repo }: { owner: string; repo: string }) {
  const branch = useCurrentBranch(owner, repo);
  const base = withBranch(`/api/sagas/${owner}/${repo}/personaggi`, branch);

  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { promptMessage, dialog: commitDialog } = useCommitMessageDialog();

  useEffect(() => {
    apiFetch<{ characters: Character[] }>(base)
      .then((data) => setCharacters(data.characters))
      .catch((err) => setError(err.message));
  }, [base]);

  function updateCharacter(id: string, patch: Partial<Character>) {
    setCharacters((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev
    );
  }

  function updateRelationship(
    characterId: string,
    index: number,
    patch: Partial<CharacterRelationship>
  ) {
    setCharacters((prev) =>
      prev
        ? prev.map((c) => {
            if (c.id !== characterId) return c;
            const relationships = [...(c.relationships ?? [])];
            relationships[index] = { ...relationships[index], ...patch };
            return { ...c, relationships };
          })
        : prev
    );
  }

  function addRelationship(characterId: string) {
    setCharacters((prev) =>
      prev
        ? prev.map((c) =>
            c.id === characterId
              ? {
                  ...c,
                  relationships: [
                    ...(c.relationships ?? []),
                    { personaggioId: "", relazione: "" },
                  ],
                }
              : c
          )
        : prev
    );
  }

  function removeRelationship(characterId: string, index: number) {
    setCharacters((prev) =>
      prev
        ? prev.map((c) =>
            c.id === characterId
              ? {
                  ...c,
                  relationships: (c.relationships ?? []).filter((_, i) => i !== index),
                }
              : c
          )
        : prev
    );
  }

  function addCharacter() {
    setCharacters((prev) => [...(prev ?? []), emptyCharacter((prev?.length ?? 0) + 1)]);
  }

  function removeCharacter(id: string) {
    setCharacters((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  async function handleSaveAll() {
    if (!characters) return;
    const message = await promptMessage("Aggiorna schede personaggi");
    if (message === null) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await apiFetch(base, {
        method: "PUT",
        body: JSON.stringify({ characters, message }),
      });
      setStatus("Schede personaggio salvate su GitHub.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inatteso");
    } finally {
      setSaving(false);
    }
  }

  if (characters === null) {
    return <p className="px-6 py-10 text-sm text-zinc-500">Caricamento…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={addCharacter}
          className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
        >
          <Plus className="h-4 w-4" />
          Nuovo personaggio
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

      {characters.length > 0 && <CharacterGraph characters={characters} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {characters.map((character) => (
          <div
            key={character.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <input
                value={character.name}
                onChange={(e) => updateCharacter(character.id, { name: e.target.value })}
                placeholder="Nome del personaggio"
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm font-medium"
              />
              <button
                onClick={() => removeCharacter(character.id)}
                className="ml-2 shrink-0 text-xs text-red-600 hover:underline"
              >
                Rimuovi
              </button>
            </div>

            <select
              value={character.role}
              onChange={(e) =>
                updateCharacter(character.id, { role: e.target.value as CharacterRole })
              }
              className="w-fit rounded border border-zinc-300 px-2 py-1 text-xs"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <textarea
              value={character.description ?? ""}
              onChange={(e) =>
                updateCharacter(character.id, { description: e.target.value })
              }
              placeholder="Descrizione fisica"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={character.personality ?? ""}
              onChange={(e) =>
                updateCharacter(character.id, { personality: e.target.value })
              }
              placeholder="Personalità"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={character.backstory ?? ""}
              onChange={(e) =>
                updateCharacter(character.id, { backstory: e.target.value })
              }
              placeholder="Background"
              rows={2}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={character.goal ?? ""}
              onChange={(e) => updateCharacter(character.id, { goal: e.target.value })}
              placeholder="Obiettivo / motivazione"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <textarea
              value={character.arc ?? ""}
              onChange={(e) => updateCharacter(character.id, { arc: e.target.value })}
              placeholder="Arco narrativo"
              rows={1}
              className="rounded border border-zinc-300 px-2 py-1 text-xs"
            />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-zinc-500">
                Relazioni con altri personaggi
              </span>
              {(character.relationships ?? []).map((rel, index) => (
                <div key={index} className="flex items-center gap-1">
                  <select
                    value={rel.personaggioId}
                    onChange={(e) =>
                      updateRelationship(character.id, index, {
                        personaggioId: e.target.value,
                      })
                    }
                    className="min-w-0 flex-1 rounded border border-zinc-300 px-1.5 py-1 text-xs"
                  >
                    <option value="">— personaggio —</option>
                    {characters
                      .filter((c) => c.id !== character.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || "(senza nome)"}
                        </option>
                      ))}
                  </select>
                  <input
                    value={rel.relazione}
                    onChange={(e) =>
                      updateRelationship(character.id, index, {
                        relazione: e.target.value,
                      })
                    }
                    placeholder="es. fratello di"
                    className="min-w-0 flex-1 rounded border border-zinc-300 px-1.5 py-1 text-xs"
                  />
                  <button
                    onClick={() => removeRelationship(character.id, index)}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => addRelationship(character.id)}
                className="self-start text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                + Aggiungi relazione
              </button>
            </div>
          </div>
        ))}
      </div>
      {commitDialog}
    </div>
  );
}
