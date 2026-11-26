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

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError(0, "Connessione assente: le modifiche restano salvate in questo browser.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ClientApiError(res.status, (data as { error?: string }).error ?? `Errore ${res.status}`);
  }
  return data as T;
}

export function projectApi(owner: string, repo: string) {
  return `/api/progetti/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
