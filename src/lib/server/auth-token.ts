import { getToken } from "next-auth/jwt";

/**
 * La richiesta è arrivata in HTTPS? Lo stabilisce come Auth.js quando crea il
 * cookie (trustHost): l'intestazione x-forwarded-proto messa dal server o dalla
 * piattaforma, altrimenti l'indirizzo configurato, altrimenti Vercel.
 */
function isSecureRequest(headers: Headers): boolean {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  if (proto) return proto === "https";
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (url) return url.startsWith("https://");
  return !!process.env.VERCEL;
}

/**
 * Legge il token GitHub dal JWT di sessione, solo lato server.
 *
 * Il token non viene mai copiato nell'oggetto `session` (vedi src/auth.ts):
 * così non è raggiungibile dal browser tramite /api/auth/session.
 *
 * In HTTPS si legge solo il cookie «sicuro» (`__Secure-…`), che il browser
 * accetta solo da connessioni cifrate; in HTTP solo quello normale (sviluppo
 * locale e test). Provare anche l'altro nome permetterebbe a chi controlla la
 * rete o un sottodominio di piantare un cookie di sessione suo e far lavorare
 * la vittima, a sua insaputa, con l'account dell'aggressore.
 */
export async function getAccessToken(headers: Headers): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non configurato");
  const token = await getToken({ req: { headers }, secret, secureCookie: isSecureRequest(headers) });
  const accessToken = token?.accessToken;
  return typeof accessToken === "string" && accessToken ? accessToken : null;
}
