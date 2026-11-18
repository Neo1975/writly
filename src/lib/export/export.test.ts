import { describe, expect, it } from "vitest";
import { FormatError } from "@/lib/project/format";
import { impose } from "./imposition";
import { markdownBlocks, parseInline } from "./markdown";
import { chapterContent, chapterDoc, frontDoc, geometry } from "./pdf";
import { BUILTIN_PDF_TEMPLATES, MM, builtinPdfTemplate, normalizePdfTemplate, parsePdfTemplate, serializePdfTemplate } from "./template";

describe("Markdown → blocchi", () => {
  it("grassetto, corsivo, escape e link", () => {
    expect(parseInline("Iris *corse* al **molo**, 3\\*4 [qui](http://x) nome_file")).toEqual([
      { text: "Iris " },
      { text: "corse", italic: true },
      { text: " al " },
      { text: "molo", bold: true },
      { text: ", 3*4 qui nome_file" },
    ]);
    expect(parseInline("***entrambi***")).toEqual([{ text: "entrambi", bold: true, italic: true }]);
  });

  it("riconosce titoli, citazioni, cambi di scena, elenchi e a capo", () => {
    const md = "## Primo\n\nRiga uno\nriga due  \nterza\n\n> Disse lei\n> piano.\n\n---\n\n- uno\n2. due\n";
    expect(markdownBlocks(md)).toEqual([
      { type: "h", level: 2, runs: [{ text: "Primo" }] },
      { type: "p", runs: [{ text: "Riga uno riga due\nterza" }] },
      { type: "quote", runs: [{ text: "Disse lei piano." }] },
      { type: "sep" },
      { type: "li", marker: "•", runs: [{ text: "uno" }] },
      { type: "li", marker: "2.", runs: [{ text: "due" }] },
    ]);
  });
});

describe("template PDF", () => {
  it("predefiniti validi e giro YAML", () => {
    for (const t of BUILTIN_PDF_TEMPLATES) expect(parsePdfTemplate(serializePdfTemplate(t), t.id)).toEqual(t);
    const custom = normalizePdfTemplate({ nome: "Quadrato", pagina: { formato: "personalizzato", larghezza: 200, altezza: 200 } });
    expect(parsePdfTemplate(serializePdfTemplate({ ...custom, id: "q" }), "q").pagina).toEqual({ formato: "personalizzato", larghezza: 200, altezza: 200 });
  });

  it("rifiuta margini impossibili e valori fuori scala", () => {
    expect(() => normalizePdfTemplate({ nome: "X", pagina: { formato: "A5" }, margini: { interno: 70, esterno: 70 } })).toThrow(FormatError);
    expect(() => normalizePdfTemplate({ nome: "X", testo: { corpo: 100 } })).toThrow(FormatError);
  });

  it("margini specchiati: media ai lati, spostamento di metà differenza", () => {
    const g = geometry(builtinPdfTemplate("romanzo-14x21")!);
    expect(g.margins[0]).toBeCloseTo(17.5 * MM);
    expect(g.mirrorShift).toBeCloseTo(2.5 * MM);
    expect(g.pageSize.width).toBeCloseTo(140 * MM);
  });
});

describe("pagine del libro", () => {
  const t = builtinPdfTemplate("romanzo-14x21")!;
  const book = { titolo: "Il faro di Vael", sottotitolo: "", autore: "A. Autore" };
  const ch = { titolo: "La lettera", numero: 2, blocks: markdownBlocks("Primo.\n\nSecondo.\n\n---\n\nTerzo.") };

  it("niente rientro dopo titolo e cambio di scena", () => {
    const content = chapterContent(t, ch) as { leadingIndent?: number; text?: unknown }[];
    const paras = content.filter((c) => c.leadingIndent !== undefined).map((c) => c.leadingIndent);
    expect(paras).toEqual([0, 5 * MM, 0]);
    expect(content[0].text).toBe("Capitolo 2");
  });

  it("numeri di pagina globali, all'esterno; intestazioni alternate", () => {
    const doc = chapterDoc(t, book, ch, 7);
    const footer = doc.footer as (p: number) => { text: string; alignment: string };
    expect(footer(1)).toMatchObject({ text: "7", alignment: "right" });
    expect(footer(2)).toMatchObject({ text: "8", alignment: "left" });
    const header = doc.header as (p: number) => { text: string } | null;
    expect(header(1)).toBeNull();
    expect(header(2)?.text).toBe("Il faro di Vael");
    expect(header(3)?.text).toBe("La lettera");
  });

  it("frontespizio e indice", () => {
    const doc = frontDoc(t, book, [{ titolo: "La lettera", pagina: 7 }])!;
    expect(JSON.stringify(doc.content)).toContain("Indice");
    expect(frontDoc({ ...t, frontespizio: false, indice: false }, book, [])).toBeNull();
  });
});

describe("imposizione a opuscolo", () => {
  it("8 pagine: due fogli piegati insieme", () => {
    const r = impose(8);
    expect(r.blanks).toBe(0);
    expect(r.sheets.map((s) => [s.front.left, s.front.right, s.back.left, s.back.right])).toEqual([
      [8, 1, 2, 7],
      [6, 3, 4, 5],
    ]);
  });

  it("aggiunge pagine bianche fino a un multiplo di 4", () => {
    const r = impose(5);
    expect(r.totalPages).toBe(8);
    expect(r.sheets[0].front).toEqual({ left: null, right: 1 });
    expect(r.sheets[1].back).toEqual({ left: 4, right: 5 });
  });

  it("segnature: fascicoli consecutivi, l'ultimo più corto, profondità per il creep", () => {
    const r = impose(20, 2); // fascicoli da 8 pagine: 8 + 8 + 4
    expect(r.sheets.map((s) => s.signature)).toEqual([1, 1, 2, 2, 3]);
    expect(r.sheets[2].front).toEqual({ left: 16, right: 9 });
    expect(r.sheets[4].front).toEqual({ left: 20, right: 17 });
    expect(r.sheets.map((s) => s.depth)).toEqual([0, 1, 0, 1, 0]);
    // Ogni pagina compare una volta sola.
    const all = r.sheets.flatMap((s) => [s.front.left, s.front.right, s.back.left, s.back.right]).filter(Boolean).sort((a, b) => a! - b!);
    expect(all).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
