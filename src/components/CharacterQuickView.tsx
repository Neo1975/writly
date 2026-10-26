"use client";

import type { Character, Scene } from "@/lib/types";

const ROLE_LABELS: Record<Character["role"], string> = {
  protagonista: "Protagonista",
  antagonista: "Antagonista",
  comprimario: "Comprimario",
  altro: "Altro",
};

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-zinc-400">{label}</h3>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-700">{value}</p>
    </div>
  );
}

export function CharacterQuickView({
  character,
  scenes,
  onClose,
}: {
  character: Character;
  scenes: Scene[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{character.name}</h2>
            <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">
              {ROLE_LABELS[character.role]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-zinc-400 hover:text-zinc-700"
            title="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Descrizione fisica" value={character.description} />
          <Field label="Personalità" value={character.personality} />
          <Field label="Background" value={character.backstory} />
          <Field label="Obiettivo / motivazione" value={character.goal} />
          <Field label="Arco narrativo" value={character.arc} />
          <Field label="Relazioni" value={character.relationships} />

          {scenes.length === 0 &&
            !character.description &&
            !character.personality &&
            !character.backstory &&
            !character.goal &&
            !character.arc &&
            !character.relationships && (
              <p className="text-sm text-zinc-500">
                Nessun dettaglio ancora compilato per questo personaggio.
              </p>
            )}

          {scenes.length > 0 && (
            <div className="border-t border-zinc-200 pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-400">
                In questo capitolo
              </h3>
              <div className="flex flex-col gap-3">
                {scenes.map((scene) => (
                  <div key={scene.id} className="rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-medium text-zinc-800">{scene.title}</p>
                    <dl className="mt-1 grid grid-cols-2 gap-1 text-xs text-zinc-500">
                      {scene.pov && (
                        <div>
                          <dt className="inline font-medium">POV: </dt>
                          <dd className="inline">{scene.pov}</dd>
                        </div>
                      )}
                      {scene.luogo && (
                        <div>
                          <dt className="inline font-medium">Luogo: </dt>
                          <dd className="inline">{scene.luogo}</dd>
                        </div>
                      )}
                      {scene.tempo && (
                        <div>
                          <dt className="inline font-medium">Tempo: </dt>
                          <dd className="inline">{scene.tempo}</dd>
                        </div>
                      )}
                    </dl>
                    {scene.obiettivo && (
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium">Obiettivo: </span>
                        {scene.obiettivo}
                      </p>
                    )}
                    {scene.conflitto && (
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium">Conflitto: </span>
                        {scene.conflitto}
                      </p>
                    )}
                    {scene.esito && (
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium">Esito: </span>
                        {scene.esito}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
