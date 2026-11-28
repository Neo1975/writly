import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy con nonce: Next.js la chiama prima di ogni pagina,
 * genera un codice casuale per quella richiesta e lo mette nell'intestazione.
 * Gli script e gli stili generati dal server lo portano e il browser li esegue;
 * un script iniettato da un aggressore non lo ha e viene bloccato.
 *
 * - 'strict-dynamic': gli script caricati da quelli fidati sono fidati a loro volta.
 * - 'wasm-unsafe-eval': Hunspell compila il proprio WebAssembly (controllo ortografico).
 * - Gli attributi style (style={{…}} di React, molto usati) restano ammessi da
 *   style-src-attr: non possono eseguire codice. I tag <style> richiedono il nonce.
 * - Nessuna risorsa esterna oltre agli avatar GitHub; connect-src 'data:' serve
 *   a Hunspell, che carica il WebAssembly incorporato come URL data:.
 * - frame-src blob: per l'anteprima del PDF generato nel browser.
 * - worker-src 'self': il service worker (/sw.js) per l'uso senza rete. Senza questa riga
 *   i worker ricadrebbero su script-src, dove con 'strict-dynamic' gli indirizzi sono ignorati.
 *
 * Le API non passano da qui (vedi `matcher`): rispondono JSON, o immagini con
 * una loro politica restrittiva (route immagine) o la pagina di accesso di Auth.js
 * (next.config.ts).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    "connect-src 'self' data:",
    "frame-src blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
    "frame-ancestors 'none'",
  ].join("; ");

  // Next.js legge il nonce dall'intestazione della richiesta e lo applica ai propri script e stili.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Niente API, file statici, font e dizionari: non sono pagine e non servono il nonce.
      source: "/((?!api|_next/static|_next/image|favicon.ico|fonts|dictionaries|icons|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
