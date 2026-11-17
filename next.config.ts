import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP: 'unsafe-inline' per script e stili serve agli script di idratazione di
 * Next e agli attributi style di React; 'wasm-unsafe-eval' a Hunspell (WebAssembly)
 * per il controllo ortografico. Nessuna risorsa esterna oltre agli avatar GitHub
 * (connect-src 'data:' non apre connessioni verso l'esterno).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self'",
  // data: serve a Hunspell, che carica il proprio WebAssembly incorporato come URL data:.
  "connect-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
