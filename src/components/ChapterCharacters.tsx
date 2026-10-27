"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, withBranch } from "@/lib/api-client";
import { useCurrentBranch } from "@/contexts/BranchContext";
import { CharacterQuickView } from "@/components/CharacterQuickView";
import type { Character, Scene } from "@/lib/types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function characterAliases(name: string): string[] {
  const trimmed = name.trim();
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  return firstWord && firstWord !== trimmed ? [trimmed, firstWord] : [trimmed];
}

function mentionsCharacter(content: string, name: string): boolean {
  return characterAliases(name).some((alias) => {
    if (!alias) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "iu");
    return pattern.test(content);
  });
}

export function ChapterCharacters({
  owner,
  repo,
  romanzoSlug,
  file,
  content,
}: {
  owner: string;
  repo: string;
  romanzoSlug: string;
  file: string;
  content: string;
}) {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [allCharacters, setAllCharacters] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  const branch = useCurrentBranch(owner, repo);

  useEffect(() => {
    Promise.all([
      apiFetch<{ scenes: Scene[] }>(
        withBranch(`/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/scene`, branch)
      ),
      apiFetch<{ characters: Character[] }>(
        withBranch(`/api/sagas/${owner}/${repo}/personaggi`, branch)
      ),
    ])
      .then(([sceneData, characterData]) => {
        setScenes(sceneData.scenes);
        setAllCharacters(characterData.characters);
      })
      .catch((err) => setError(err.message));
  }, [owner, repo, romanzoSlug, branch]);

  const chapterScenes = useMemo(
    () => (scenes ?? []).filter((scene) => scene.chapterFile === file),
    [scenes, file]
  );

  function scenesForCharacter(character: Character): Scene[] {
    const name = character.name.trim().toLowerCase();
    return chapterScenes.filter((scene) =>
      scene.personaggi.some((p) => p.trim().toLowerCase() === name)
    );
  }

  const characters = useMemo(() => {
    if (!scenes || !allCharacters) return null;
    const linkedViaScene = new Set(
      chapterScenes
        .flatMap((scene) => scene.personaggi)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    );
    return allCharacters.filter(
      (character) =>
        linkedViaScene.has(character.name.trim().toLowerCase()) ||
        mentionsCharacter(content, character.name)
    );
  }, [scenes, allCharacters, chapterScenes, content]);

  return (
    <div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {characters === null && !error && (
        <p className="text-sm text-zinc-500">Caricamento…</p>
      )}
      {characters?.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nessun personaggio trovato. Vengono rilevati automaticamente quando
          il loro nome compare nel testo, oppure collegando una scena
          dell&apos;architettura delle scene a questo capitolo.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {characters?.map((character) => {
          const linkedScenes = scenesForCharacter(character);
          return (
            <li
              key={character.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCharacter(character)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCharacter(character);
                }
              }}
              title="Apri scheda completa"
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-sm hover:border-zinc-400"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{character.name}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase text-zinc-600">
                  {character.role}
                </span>
                {linkedScenes.length > 0 && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                    In scena
                  </span>
                )}
              </div>
              {character.description && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                  {character.description}
                </p>
              )}
              {character.goal && (
                <p className="mt-1 line-clamp-1 text-xs text-zinc-400">
                  <span className="font-medium">Obiettivo: </span>
                  {character.goal}
                </p>
              )}
              {linkedScenes.length > 0 && (
                <p className="mt-1 line-clamp-1 text-xs text-indigo-600">
                  {linkedScenes.map((s) => s.title).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {selectedCharacter && (
        <CharacterQuickView
          character={selectedCharacter}
          scenes={scenesForCharacter(selectedCharacter)}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </div>
  );
}
