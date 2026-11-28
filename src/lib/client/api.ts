import { readOfflineJson, rememberOnline, scheduleRefresh } from "./offline-data";

/** Errore di una chiamata alle nostre API, con il messaggio già pronto per l'autore. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

/**
 * Chiamata alle nostre API. Le letture (GET) tengono al passo la copia scaricata «per il
 * viaggio» e, senza rete, rispondono con quella copia se c'è; le scritture non si fanno
 * mai senza rete e, riuscite, fanno rileggere la copia degli stessi dati.
 */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const isRead = (rest.method ?? "GET").toUpperCase() === "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    if (isRead) {
      const copy = await readOfflineJson<T>(url);
      if (copy !== undefined) return copy;
    }
    throw new ClientApiError(0, "Connessione assente: le modifiche restano salvate in questo browser.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClientApiError(res.status, (data as { error?: string }).error ?? `Errore ${res.status}`);
  }
  if (isRead) void rememberOnline(url, data);
  else scheduleRefresh(url);
  return data as T;
}

export function projectApi(owner: string, repo: string) {
  return `/api/progetti/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
