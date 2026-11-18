import { describe, expect, it } from "vitest";
import {
  alignParagraphs,
  applyChoices,
  diffStats,
  diffWords,
  paragraphChunks,
  paragraphHistory,
  restoreParagraph,
  sides,
  splitParagraphs,
} from "./diff";

describe("confronto a parole", () => {
  it("segna solo le parole cambiate", () => {
    const ops = diffWords("Iris scese al molo di notte.", "Iris corse al vecchio molo di notte.");
    expect(ops.filter((o) => o.type !== "equal")).toEqual([
      { type: "delete", text: "scese" },
      { type: "insert", text: "corse" },
      { type: "insert", text: " vecchio" },
    ]);
    expect(diffStats(ops)).toEqual({ aggiunte: 2, rimosse: 1 });
  });

  it("ricostruisce sempre entrambi i testi", () => {
    const pairs = [
      ["", "Tutto nuovo."],
      ["Tutto vecchio.", ""],
      ["a b c d e f", "f e d c b a"],
      ["Perché l'aria, d'un tratto, era più fredda?", "Perché l'acqua era più fredda!"],
      ["uno due tre", "uno due tre"],
    ];
    for (const [a, b] of pairs) expect(sides(diffWords(a, b))).toEqual({ a, b });
  });

  it("regge un capitolo intero", () => {
    const base = Array.from({ length: 3000 }, (_, i) => `parola${i % 97}`).join(" ");
    const changed = base.replace("parola5 ", "parolacambiata ").replace("parola90 parola91", "parola91");
    const ops = diffWords(base, changed);
    expect(sides(ops)).toEqual({ a: base, b: changed });
    expect(diffStats(ops).aggiunte).toBe(1);
  });
});

describe("paragrafi", () => {
  const v1 = ["Iris scese al molo.", "Le lanterne erano accese.", "Tomas la guardava dal ponte."];
  const v2 = ["Iris scese al vecchio molo.", "Il vento portava sale.", "Tomas la guardava dal ponte."];

  it("allinea paragrafi uguali e riscritti, segnala nuovi e tolti", () => {
    expect(alignParagraphs(v1, v2)).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: null },
      { a: null, b: 1 },
      { a: 2, b: 2 },
    ]);
  });

  it("ripristina un solo paragrafo, sostituendolo o reinserendolo", () => {
    expect(restoreParagraph(v2, v1, 0)).toEqual(["Iris scese al molo.", "Il vento portava sale.", "Tomas la guardava dal ponte."]);
    expect(restoreParagraph(v2, v1, 1)).toEqual(["Iris scese al vecchio molo.", "Le lanterne erano accese.", "Il vento portava sale.", "Tomas la guardava dal ponte."]);
  });

  it("segue l'evoluzione di un paragrafo nelle versioni", () => {
    const v3 = ["Prologo.", "Iris scese al vecchio molo, di corsa.", "Tomas la guardava dal ponte."];
    expect(paragraphHistory([v1, v2, v3], 1)).toEqual(["Iris scese al molo.", "Iris scese al vecchio molo.", "Iris scese al vecchio molo, di corsa."]);
    expect(paragraphHistory([v1, v2, v3], 0)).toEqual([null, null, "Prologo."]);
  });

  it("unisce scegliendo blocco per blocco", () => {
    const chunks = paragraphChunks(v1, v2);
    expect(chunks.map((c) => c.kind)).toEqual(["diff", "same"]);
    expect(applyChoices(chunks, ["theirs"])).toEqual(v2);
    expect(applyChoices(chunks, ["mine"])).toEqual(v1);
    expect(applyChoices(chunks, ["both"])).toHaveLength(5);
  });

  it("divide il Markdown in paragrafi", () => {
    expect(splitParagraphs("Uno\nriga due\n\n\n> citazione\r\n\r\nTre")).toEqual(["Uno\nriga due", "> citazione", "Tre"]);
  });
});
