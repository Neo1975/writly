import { encode } from "next-auth/jwt";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getAccessToken } from "./auth-token";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const SECURE = "__Secure-authjs.session-token";
const PLAIN = "authjs.session-token";

/** Un cookie di sessione valido, firmato col nostro segreto, con il nome indicato. */
async function cookie(name: string, accessToken = "gho_token_di_prova") {
  const jwt = await encode({ token: { accessToken, sub: "1" }, secret: SECRET, salt: name });
  return `${name}=${jwt}`;
}

const request = (cookieHeader: string, proto?: string) => new Headers({ cookie: cookieHeader, ...(proto ? { "x-forwarded-proto": proto } : {}) });

describe("lettura del token dalla sessione", () => {
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...saved, AUTH_SECRET: SECRET };
  });

  it("in HTTPS accetta solo il cookie sicuro", async () => {
    expect(await getAccessToken(request(await cookie(SECURE), "https"))).toBe("gho_token_di_prova");
    // Un cookie «normale» piantato da un sottodominio o da chi controlla la rete non vale.
    expect(await getAccessToken(request(await cookie(PLAIN, "gho_dell_aggressore"), "https"))).toBeNull();
  });

  it("in HTTP (sviluppo e test) accetta solo il cookie normale", async () => {
    expect(await getAccessToken(request(await cookie(PLAIN), "http"))).toBe("gho_token_di_prova");
    expect(await getAccessToken(request(await cookie(PLAIN)))).toBe("gho_token_di_prova");
    expect(await getAccessToken(request(await cookie(SECURE), "http"))).toBeNull();
  });

  it("dietro più proxy conta il primo protocollo; senza intestazione guarda l'indirizzo configurato", async () => {
    expect(await getAccessToken(request(await cookie(SECURE), "https, http"))).toBe("gho_token_di_prova");
    process.env.AUTH_URL = "https://writly.example";
    expect(await getAccessToken(request(await cookie(SECURE)))).toBe("gho_token_di_prova");
    expect(await getAccessToken(request(await cookie(PLAIN)))).toBeNull();
  });

  it("rifiuta cookie firmati con un altro segreto, senza cookie o senza token GitHub", async () => {
    const forged = await encode({ token: { accessToken: "gho_falso" }, secret: "un-altro-segreto-0123456789abcdef0123456789", salt: PLAIN });
    expect(await getAccessToken(request(`${PLAIN}=${forged}`, "http"))).toBeNull();
    expect(await getAccessToken(new Headers())).toBeNull();
    expect(await getAccessToken(request(await cookie(PLAIN, ""), "http"))).toBeNull();
  });
});
