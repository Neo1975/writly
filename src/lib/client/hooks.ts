"use client";

import { useEffect, useState } from "react";
import { api, ClientApiError } from "./api";

/** Chiede conferma prima di chiudere la pagina se ci sono modifiche non salvate. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);
}

/** Carica un JSON dalle nostre API al cambio di `url` (null = non caricare). */
export function useApiData<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: ClientApiError | null }>({
    url: null,
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    api<T>(url)
      .then((data) => !cancelled && setState({ url, data, error: null }))
      .catch((error: ClientApiError) => !cancelled && setState({ url, data: null, error }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  const current = state.url === url;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!url && !current,
    /** Sostituisce i dati in memoria dopo un salvataggio, senza ricaricare. */
    set: (data: T) => setState({ url, data, error: null }),
  };
}
