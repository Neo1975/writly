import { NextResponse } from "next/server";
import { RequestError } from "octokit";
import { FormatError } from "@/lib/project/format";
import { isValidRepoRef } from "@/lib/project/paths";
import { getAccessToken } from "./auth-token";
import { ApiError } from "./errors";
import { githubClient, type GitHub } from "./github";

export { ApiError };

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Traduce gli errori (nostri, di formato, di GitHub) in risposte JSON leggibili dall'autore. */
export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) return jsonError(err.status, err.message);
  if (err instanceof FormatError) return jsonError(422, err.message);
  if (err instanceof RequestError) {
    switch (err.status) {
      case 401:
        return jsonError(401, "La sessione GitHub non è più valida: accedi di nuovo.");
      case 403:
        return jsonError(403, "GitHub ha negato l'operazione (permessi insufficienti o limite di richieste).");
      case 404:
        return jsonError(404, "Non trovato su GitHub.");
      case 409:
        return jsonError(409, "Il file è stato modificato altrove dopo l'ultima lettura: ricarica per vedere la versione più recente.");
      case 422:
        return jsonError(422, "GitHub ha rifiutato la richiesta. Se il problema persiste, ricarica la pagina.");
      default:
        console.error("Errore GitHub", err.status, err.message);
        return jsonError(502, "GitHub non ha risposto correttamente. Riprova tra poco.");
    }
  }
  console.error(err);
  return jsonError(500, "Errore imprevisto.");
}

/**
 * Le richieste che modificano dati devono arrivare dalla nostra stessa origine.
 * Il cookie di sessione è SameSite=Lax, questo è un secondo controllo esplicito.
 */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Esegue l'handler con un client GitHub autenticato, o risponde 401. */
export async function withGitHub(req: Request, handler: (gh: GitHub) => Promise<Response>): Promise<Response> {
  try {
    if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
      return jsonError(403, "Origine della richiesta non consentita.");
    }
    const token = await getAccessToken(req.headers);
    if (!token) return jsonError(401, "Accedi con GitHub per continuare.");
    return await handler(githubClient(token));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export function assertRepoRef(owner: string, repo: string) {
  if (!isValidRepoRef(owner, repo)) throw new ApiError(400, "Repository non valido.");
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, "Corpo della richiesta non valido.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ApiError(400, "Corpo della richiesta non valido.");
  }
  return data as Record<string, unknown>;
}

export function requireText(body: Record<string, unknown>, key: string, label: string, max = 200): string {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") throw new ApiError(400, `${label}: campo obbligatorio.`);
  if (v.length > max) throw new ApiError(400, `${label}: massimo ${max} caratteri.`);
  return v.trim();
}

export function optionalText(body: Record<string, unknown>, key: string, max = 200): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.length > max) throw new ApiError(400, `Campo «${key}» non valido.`);
  return v.trim();
}
