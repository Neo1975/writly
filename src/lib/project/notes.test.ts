import { describe, expect, it } from "vitest";
import { FormatError } from "./format";
import {
  backlinks,
  findByTitle,
  parseGlossary,
  parseNote,
  searchNotes,
  serializeGlossary,
  serializeNote,
  wikiLinks,
  type Note,
} from "./notes";
import { isNotePath } from "./paths";

const note = (titolo: string, testo = "", extra: Partial<Note> = {}): Note => ({
  id: titolo.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, "") || "x",
  titolo,
  tipo: "idea",
  tag: [],
  inbox: false,
  creato: "2026-11-18",
  progetti: [],
  collegamenti: [],
  testo,
  ...extra,
});

describe("appunti", () => {
  it("giro Markdown con front-matter", () => {
    const n = note("Il sale che canta", "Una magia legata al [[Mare grigio]].\n\n- primo\n- secondo", {
      tipo: "spunto",
      tag: ["magia", "sale"],
      inbox: true,
      progetti: ["autore/il-faro-di-vael"],
      collegamenti: ["vael"],
    });
    const text = serializeNote(n);
    expect(text).toContain("inbox: true");
    expect(parseNote(text, "appunti/il-sale.md")).toEqual(n);
    expect(serializeNote({ ...n, inbox: false })).not.toContain("inbox");
  });

  it("toglie il # dai tag e rifiuta progetti non validi", () => {
    expect(parseNote("---\nid: a\ntitolo: A\ntag: ['#mare']\n---\n", "p").tag).toEqual(["mare"]);
    expect(() => parseNote("---\nid: a\ntitolo: A\nprogetti: ['../x']\n---\n", "p")).toThrow(FormatError);
  });

  it("collegamenti [[Titolo]], ritrovati senza badare a maiuscole e accenti", () => {
    expect(wikiLinks("Vedi [[Città del Sale]] e [[Mare grigio|il mare]], ancora [[Città del Sale]].")).toEqual(["Città del Sale", "Mare grigio"]);
    const a = note("Città del Sale");
    const b = note("Leggende", "Nella [[citta del sale]] si racconta…");
    expect(findByTitle([a, b], "CITTÀ DEL SALE")).toBe(a);
    expect(backlinks([a, b], a)).toEqual([b]);
  });

  it("ricerca full-text su titolo, testo e tag", () => {
    const list = [note("Faro", "luce verde", { tag: ["luoghi"] }), note("Tomas", "il rivale"), note("Mare", "perché è verde")];
    expect(searchNotes(list, "verde").map((n) => n.titolo)).toEqual(["Faro", "Mare"]);
    expect(searchNotes(list, "perche VERDE").map((n) => n.titolo)).toEqual(["Mare"]);
    expect(searchNotes(list, "#luoghi").map((n) => n.titolo)).toEqual(["Faro"]);
    expect(searchNotes(list, "  ")).toHaveLength(3);
  });

  it("valida i percorsi", () => {
    expect(isNotePath("appunti/il-sale.md")).toBe(true);
    expect(isNotePath("appunti/../writly.yaml")).toBe(false);
  });
});

describe("glossario", () => {
  it("giro YAML in ordine alfabetico", () => {
    const items = [
      { id: "t2", termine: "vaelith", definizione: "Lingua di Vael", categoria: "lingua inventata", note: "" },
      { id: "t1", termine: "Ancoraggio", definizione: "", categoria: "", note: "" },
    ];
    expect(parseGlossary(serializeGlossary(items)).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(() => parseGlossary("termini:\n  - id: a\n")).toThrow(FormatError);
  });
});
