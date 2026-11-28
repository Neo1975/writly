import type { MetadataRoute } from "next";

/** Rende Writly installabile (iPad: Condividi → «Aggiungi alla schermata Home») e a tutto schermo, senza barra del browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Writly",
    short_name: "Writly",
    description: "Scrittura di racconti, romanzi e saghe, con le versioni su GitHub.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
