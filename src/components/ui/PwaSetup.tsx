"use client";

import { useEffect, useSyncExternalStore } from "react";
import { clearOfflineData } from "@/lib/client/offline";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** True se il browser dice di avere la rete (sul server si presume di sì). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Registra il service worker (solo in produzione: in sviluppo ostacolerebbe il ricaricamento
 * a caldo) e avvisa quando manca la rete.
 */
export default function PwaSetup() {
  const online = useOnline();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // senza service worker l'app funziona come sempre, solo non si apre offline
    });
  }, []);
  if (online) return null;
  return (
    <div className="offline-bar" role="status">
      Senza connessione. Puoi scrivere nei capitoli scaricati: le modifiche restano su questo dispositivo e si salvano da sole su GitHub quando torna la rete. Schede, struttura e appunti si possono solo consultare.
    </div>
  );
}

/** «Esci» che prima toglie dal dispositivo le copie scaricate e le pagine in cache, poi chiude la sessione. */
export function SignOutButton({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return (
    <form
      action={async () => {
        await clearOfflineData();
        await signOutAction();
      }}
      className="row"
    >
      <button type="submit" className="btn btn-small">
        Esci
      </button>
    </form>
  );
}
