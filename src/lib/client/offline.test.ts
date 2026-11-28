import { describe, expect, it } from "vitest";
import type { ProjectData } from "@/lib/server/projects";
import { dataToCache, extractAssetUrls, pagesToCache } from "./offline";

describe("file di build citati da una pagina", () => {
  it("li trova nei tag e nei dati RSC, una volta sola, sempre come /_next/static/…", () => {
    const html = `
      <link rel="stylesheet" href="/_next/static/css/abc123.css" data-precedence="next"/>
      <script src="/_next/static/chunks/main-aa11.js" async></script>
      <script src="/_next/static/chunks/main-aa11.js" async></script>
      <script>self.__next_f.push([1,"3:I[\\"x\\",[\\"static/chunks/app/page-b2.js\\",\\"static/chunks/0f_dyn.js\\"],\\"default\\"]"])</script>
      <img src="/_next/static/media/logo.3f.woff2">
      <a href="/progetto/a/b">non è un file di build</a>`;
    expect(extractAssetUrls(html).sort()).toEqual(
      [
        "/_next/static/chunks/0f_dyn.js",
        "/_next/static/chunks/app/page-b2.js",
        "/_next/static/chunks/main-aa11.js",
        "/_next/static/css/abc123.css",
        "/_next/static/media/logo.3f.woff2",
      ].sort(),
    );
  });

  it("non inventa nulla se la pagina non ne cita", () => {
    expect(extractAssetUrls("<html><body>ciao</body></html>")).toEqual([]);
  });
});

describe("pagine e dati da tenere pronti", () => {
  it("libreria, sezioni del progetto, struttura per opera e una pagina per capitolo (senza .md)", () => {
    const project = {
      opere: [
        { slug: "romanzo", capitoli: [{ file: "01-inizio.md" }, { file: "02-fine.md" }] },
        { slug: "racconto", capitoli: [{ file: "a.md" }] },
      ],
    } as unknown as ProjectData;
    expect(pagesToCache("neo", "libro", project)).toEqual([
      "/",
      "/appunti",
      "/strutture",
      "/progetto/neo/libro",
      "/progetto/neo/libro/personaggi",
      "/progetto/neo/libro/mondo",
      "/progetto/neo/libro/appunti",
      "/progetto/neo/libro/panoramica",
      "/progetto/neo/libro/struttura/romanzo",
      "/progetto/neo/libro/struttura/racconto",
      "/progetto/neo/libro/romanzo/01-inizio",
      "/progetto/neo/libro/romanzo/02-fine",
      "/progetto/neo/libro/racconto/a",
    ]);
  });

  it("risposte delle API di lettura: progetto, schede, panoramica, appunti, struttura, statistiche e commenti di ogni capitolo", () => {
    const project = { opere: [{ slug: "romanzo", capitoli: [{ file: "01-inizio.md" }] }] } as unknown as ProjectData;
    expect(dataToCache("neo", "libro", project)).toEqual([
      "/api/progetti/neo/libro",
      "/api/progetti/neo/libro/schede",
      "/api/progetti/neo/libro/panoramica",
      "/api/appunti",
      "/api/strutture",
      "/api/progetti/neo/libro/opere/romanzo/struttura",
      "/api/progetti/neo/libro/opere/romanzo/statistiche",
      "/api/progetti/neo/libro/commenti?opera=romanzo&file=01-inizio.md",
    ]);
  });
});
