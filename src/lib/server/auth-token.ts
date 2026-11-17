import { getToken } from "next-auth/jwt";

/**
 * Legge il token GitHub dal JWT di sessione, solo lato server.
 *
 * Il token non viene mai copiato nell'oggetto `session` (vedi src/auth.ts):
 * così non è raggiungibile dal browser tramite /api/auth/session.
 * Il nome del cookie cambia tra http e https, quindi proviamo entrambi.
 */
export async function getAccessToken(headers: Headers): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non configurato");
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req: { headers }, secret, secureCookie });
    const accessToken = token?.accessToken;
    if (typeof accessToken === "string" && accessToken) return accessToken;
  }
  return null;
}
