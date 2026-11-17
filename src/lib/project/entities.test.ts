import { describe, expect, it } from "vitest";
import {
  ancestors,
  emptyCharacter,
  parseCategories,
  parseCharacter,
  parseRelations,
  parseWorldEntry,
  serializeCategories,
  serializeCharacter,
  serializeRelations,
  serializeWorldEntry,
  DEFAULT_CATEGORIES,
  type WorldEntry,
} from "./entities";
import { FormatError } from "./format";
import { isCharacterPath, parseWorldEntryPath } from "./paths";

describe("personaggi", () => {
  it("serializza la scheda nel front-matter e la biografia nel testo", () => {
    const c = {
      ...emptyCharacter("iris01", "Iris Calvi"),
      alias: ["Iris", "la Rossa"],
      ruolo: "Protagonista",
      fisico: { aspetto: "Alta, capelli rossi", tratti: "Cicatrice sul mento", abbigliamento: "" },
      morale: { valori: "", paure: "Il mare aperto", desideri: "", difetto: "Orgoglio", segreto: "" },
      biografia: "Nata a Vael.\n\nFiglia del guardiano del faro.",
    };
    const text = serializeCharacter(c);
    expect(text).toMatch(/^---\nid: iris01\nnome: Iris Calvi\n/);
    expect(text).not.toContain("abbigliamento");
    expect(text.endsWith("Figlia del guardiano del faro.\n")).toBe(true);
    expect(parseCharacter(text, "personaggi/iris.md")).toEqual(c);
  });

  it("rifiuta schede senza id o nome", () => {
    expect(() => parseCharacter("---\nnome: X\n---\n", "p")).toThrow(FormatError);
    expect(() => parseCharacter("---\nid: x\n---\n", "p")).toThrow(FormatError);
    expect(() => parseCharacter("solo testo", "p")).toThrow(FormatError);
  });

  it("legge le relazioni", () => {
    const items = [{ id: "r1", da: "iris01", a: "tomas", tipo: "rivale di", nota: "", libri: ["libro-2"] }];
    expect(parseRelations(serializeRelations(items))).toEqual(items);
    expect(() => parseRelations("relazioni:\n  - id: r1\n    da: a\n    tipo: ama\n")).toThrow(FormatError);
  });
});

describe("mondo", () => {
  it("categorie predefinite al giro YAML", () => {
    expect(parseCategories(serializeCategories(DEFAULT_CATEGORIES))).toEqual(DEFAULT_CATEGORIES);
  });

  it("voce con campi, genitore e collegamenti", () => {
    const e: WorldEntry = {
      id: "vael",
      nome: "Vael",
      alias: ["la città del sale"],
      genitore: "regno",
      campi: { clima: "Umido", popolazione: "12.000" },
      collegamenti: [{ id: "iris01", nota: "nata qui" }],
      descrizione: "Porto sul mare grigio.",
    };
    expect(parseWorldEntry(serializeWorldEntry(e), "mondo/luoghi/vael.md")).toEqual(e);
  });

  it("ignora i collegamenti a sé stessa e il genitore uguale a sé", () => {
    const e = parseWorldEntry("---\nid: a\nnome: A\ngenitore: a\ncollegamenti:\n  - id: a\n  - id: b\n  - id: b\n---\n", "x");
    expect(e.genitore).toBeNull();
    expect(e.collegamenti).toEqual([{ id: "b", nota: "" }]);
  });

  it("risale gli antenati fermandosi sui cicli", () => {
    const mk = (id: string, genitore: string | null): WorldEntry => ({ id, nome: id, alias: [], genitore, campi: {}, collegamenti: [], descrizione: "" });
    const map = new Map([mk("locanda", "quartiere"), mk("quartiere", "citta"), mk("citta", "locanda")].map((e) => [e.id, e]));
    expect(ancestors(map, "locanda").map((e) => e.id)).toEqual(["quartiere", "citta"]);
  });

  it("valida i percorsi", () => {
    expect(isCharacterPath("personaggi/iris.md")).toBe(true);
    expect(isCharacterPath("personaggi/../x.md")).toBe(false);
    expect(parseWorldEntryPath("mondo/luoghi/vael.md")).toEqual({ category: "luoghi", slug: "vael" });
    expect(parseWorldEntryPath("mondo/categorie.yaml")).toBeNull();
  });
});
