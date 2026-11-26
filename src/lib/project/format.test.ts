import { describe, expect, it } from "vitest";
import {
  FormatError,
  parseChapter,
  parseDictionary,
  parseProjectManifest,
  parseWorkManifest,
  serializeChapter,
  serializeDictionary,
  serializeProjectManifest,
  serializeWorkManifest,
} from "./format";
import { chapterPath, isReadablePath, isValidRepoRef, isWritableTextPath, parseChapterPath } from "./paths";
import { slugify, uniqueSlug } from "./slug";

describe("manifest di progetto", () => {
  it("fa il giro serializza → legge senza perdite", () => {
    const m = { writly: 1, titolo: "Le cronache di Vael", tipo: "saga" as const, lingua: "it", opere: ["il-porto", "la-torre"] };
    expect(parseProjectManifest(serializeProjectManifest(m))).toEqual(m);
  });

  it("rifiuta un tipo sconosciuto e una versione futura", () => {
    expect(() => parseProjectManifest("writly: 1\ntitolo: X\ntipo: poesia\n")).toThrow(FormatError);
    expect(() => parseProjectManifest("writly: 99\ntitolo: X\ntipo: romanzo\n")).toThrow(/più recente/);
  });

  it("rifiuta YAML non valido con un messaggio leggibile", () => {
    expect(() => parseProjectManifest("writly: [1\n")).toThrow(/YAML non valido/);
  });
});

describe("manifest di opera", () => {
  it("conserva ordine e titoli dei capitoli", () => {
    const w = { titolo: "Il porto delle nebbie", capitoli: [{ file: "a.md", titolo: "Uno" }, { file: "b.md", titolo: "Due: «il molo»" }] };
    expect(parseWorkManifest(serializeWorkManifest(w), "il-porto")).toEqual(w);
  });

  it("conserva tema e premessa; vuoti o assenti non compaiono", () => {
    const w = { titolo: "Il faro", tema: "Il prezzo della verità", premessa: "Una guardiana del faro scopre che il naufragio non fu un incidente.\nSe parla, perde la casa.", capitoli: [{ file: "a.md", titolo: "Uno" }] };
    expect(parseWorkManifest(serializeWorkManifest(w), "il-faro")).toEqual(w);
    expect(serializeWorkManifest({ ...w, tema: "", premessa: undefined })).not.toMatch(/tema|premessa/);
    expect(parseWorkManifest("titolo: X\ntema: '   '\ncapitoli: []\n", "x")).toEqual({ titolo: "X", capitoli: [] });
    expect(() => parseWorkManifest("titolo: X\ntema: [1, 2]\n", "x")).toThrow(/«tema»/);
  });

  it("segnala il capitolo senza file", () => {
    expect(() => parseWorkManifest("titolo: X\ncapitoli:\n  - titolo: Senza file\n", "x")).toThrow(/«file»/);
  });
});

describe("capitolo", () => {
  it("separa front-matter e testo e li ricompone", () => {
    const doc = { meta: { id: "abc123", stato: "in-stesura" as const }, body: "Iris scese al molo.\n\n***\n\nFine.\n" };
    const text = serializeChapter(doc);
    expect(text.startsWith("---\nid: abc123\nstato: in-stesura\n---\n\n")).toBe(true);
    expect(parseChapter(text)).toEqual(doc);
  });

  it("accetta un file senza front-matter come testo puro", () => {
    expect(parseChapter("Solo testo.\n")).toEqual({ meta: { id: "", stato: "bozza" }, body: "Solo testo.\n" });
  });

  it("riporta a «bozza» uno stato sconosciuto", () => {
    expect(parseChapter("---\nid: x\nstato: boh\n---\nTesto").meta.stato).toBe("bozza");
  });
});

describe("dizionario", () => {
  it("ignora commenti e righe vuote, ordina ed elimina doppioni", () => {
    expect(parseDictionary("# commento\nVael\n\nsalmastro\n")).toEqual(["Vael", "salmastro"]);
    expect(parseDictionary(serializeDictionary(["Vael", "salmastro", "Vael"]))).toEqual(["salmastro", "Vael"]);
  });
});

describe("percorsi", () => {
  it("riconosce solo percorsi di capitolo ben formati", () => {
    expect(parseChapterPath(chapterPath("il-porto", "le-lanterne.md"))).toEqual({ work: "il-porto", file: "le-lanterne.md" });
    for (const bad of ["opere/../capitoli/x.md", "opere/a/capitoli/../../x.md", "opere/A/capitoli/x.md", "opere/a/capitoli/x.txt", ".github/workflows/x.yml"]) {
      expect(parseChapterPath(bad)).toBeNull();
      expect(isWritableTextPath(bad)).toBe(false);
    }
  });

  it("permette di leggere manifest, opere e dizionario ma non altro", () => {
    expect(isReadablePath("writly.yaml")).toBe(true);
    expect(isReadablePath("dizionario.txt")).toBe(true);
    expect(isReadablePath("opere/il-porto/opera.yaml")).toBe(true);
    expect(isReadablePath(".env")).toBe(false);
    expect(isReadablePath("opere/../opera.yaml")).toBe(false);
  });

  it("valida owner e repository", () => {
    expect(isValidRepoRef("autore", "cronache-di-vael")).toBe(true);
    expect(isValidRepoRef("-autore", "x")).toBe(false);
    expect(isValidRepoRef("autore", "..")).toBe(false);
    expect(isValidRepoRef("autore", "a/b")).toBe(false);
  });
});

describe("slug", () => {
  it("toglie accenti, apostrofi e punteggiatura", () => {
    expect(slugify("Le lanterne del molo")).toBe("le-lanterne-del-molo");
    expect(slugify("Neve d'agosto — Perché?")).toBe("neve-d-agosto-perche");
    expect(slugify("!!!")).toBe("senza-titolo");
  });

  it("rende unico uno slug già usato", () => {
    expect(uniqueSlug("capitolo", ["capitolo", "capitolo-2"])).toBe("capitolo-3");
    expect(uniqueSlug("nuovo", ["altro"])).toBe("nuovo");
  });
});
