"use client";

import { useCallback, useState } from "react";

interface PendingDialog {
  defaultMessage: string;
  resolve: (value: string | null) => void;
}

export function useCommitMessageDialog() {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [value, setValue] = useState("");

  const promptMessage = useCallback((defaultMessage: string) => {
    return new Promise<string | null>((resolve) => {
      setValue(defaultMessage);
      setPending({ defaultMessage, resolve });
    });
  }, []);

  function handleConfirm() {
    if (!pending) return;
    pending.resolve(value.trim() || pending.defaultMessage);
    setPending(null);
  }

  function handleCancel() {
    pending?.resolve(null);
    setPending(null);
  }

  const dialog = pending ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">
          Descrivi questo salvataggio
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Il testo diventerà il messaggio del commit su GitHub.
        </p>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="mb-4 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Salva su GitHub
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { promptMessage, dialog };
}
