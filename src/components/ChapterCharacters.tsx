"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
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

  useEffect(() => {
    Promise.all([
      apiFetch<{ scenes: Scene[] }>(
        `/api/sagas/${owner}/${repo}/romanzi/${romanzoSlug}/scene`
      ),
      apiFetch<{ characters: Character[] }>(`/api/sagas/${owner}/${repo}/personaggi`),
    ])
      .then(([sceneData, characterData]) => {
        setScenes(sceneData.scenes);
        setAllCharacters(characterData.characters);
      })
      .catch((err) => setError(err.message));
  }, [owner, repo, romanzoSlug]);

  const characters = useMemo(() => {
    if (!scenes || !allCharacters) return null;
    const linkedViaScene = new Set(
      scenes
        .filter((scene) => scene.chapterFile === file)
        .flatMap((scene) => scene.personaggi)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    );
    return allCharacters.filter(
      (character) =>
        linkedViaScene.has(character.name.trim().toLowerCase()) ||
        mentionsCharacter(content, character.name)
    );
  }, [scenes, allCharacters, file, content]);

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
        {characters?.map((character) => (
          <li
            key={character.id}
            className="rounded-lg border border-zinc-200 bg-white p-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{character.name}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase text-zinc-600">
                {character.role}
              </span>
            </div>
            {character.description && (
              <p className="mt-1 text-xs text-zinc-500">{character.description}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
