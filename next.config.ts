import type { NextConfig } from "next";

/**
 * La Content Security Policy delle pagine è in src/proxy.ts (con un nonce per
 * richiesta). Qui restano le intestazioni uguali per tutti e la politica della
 * pagina di accesso di Auth.js (/api/auth/*), che usa solo stili in linea e non
 * può portare un nonce: nessuno script, nessuna risorsa esterna.
 */
const authPageCsp = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "form-action 'self' https://github.com",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Content-Security-Policy", value: authPageCsp }],
      },
    ];
  },
};

export default nextConfig;
