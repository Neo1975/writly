import { del, get, keys, set } from "idb-keyval";

/**
 * Risposte delle API di sola lettura (schede, struttura, panoramica, commenti, appunti…)
 * copiate sul dispositivo da «Scarica per il viaggio». `api()` le usa quando la rete
 * manca, così queste pagine si consultano anche offline. Foglia: non importa `api`.
 *
 * - Una risposta si salva solo se è stata scaricata di proposito (`storeOfflineJson`).
 * - Ogni lettura online di un indirizzo già salvato aggiorna la copia (`rememberOnline`).
 * - Dopo un salvataggio andato a buon fine la copia degli stessi dati si rilegge da sola
 *   (`scheduleRefresh`), così non resta indietro rispetto a quel che hai appena cambiato.
 */

export const DATA_PREFIX = "writly:viaggio:dato:";
const key = (url: string) => `${DATA_PREFIX}${url}`;
const pathOf = (url: string) => url.split("?")[0];

export async function readOfflineJson<T>(url: string): Promise<T | undefined> {
  try {
    return (await get(key(url))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function storeOfflineJson(url: string, data: unknown): Promise<void> {
  await set(key(url), data);
}

export async function deleteOfflineJson(url: string): Promise<void> {
  try {
    await del(key(url));
  } catch {
    // niente da fare
  }
}

/** Dopo una lettura online riuscita: se questo indirizzo è nella copia scaricata, la tiene al passo. */
export async function rememberOnline(url: string, data: unknown): Promise<void> {
  try {
    if ((await get(key(url))) !== undefined) await set(key(url), data);
  } catch {
    // la copia resta quella di prima
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Dopo un salvataggio su `url`, rilegge le copie scaricate con lo stesso percorso
 * (anche con altri parametri, come i commenti di un capitolo). Raggruppa le richieste vicine.
 */
export function scheduleRefresh(url: string, delayMs = 2000): void {
  if (typeof window === "undefined") return;
  const path = pathOf(url);
  const pending = timers.get(path);
  if (pending) clearTimeout(pending);
  timers.set(
    path,
    setTimeout(() => {
      timers.delete(path);
      void refreshStored(path);
    }, delayMs),
  );
}

async function refreshStored(path: string): Promise<void> {
  try {
    for (const k of await keys()) {
      if (typeof k !== "string" || !k.startsWith(DATA_PREFIX)) continue;
      const url = k.slice(DATA_PREFIX.length);
      if (pathOf(url) !== path) continue;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) await set(k, await res.json());
    }
  } catch {
    // senza rete la copia resta com'è
  }
}
