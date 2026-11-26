import { describe, expect, it } from "vitest";
import { countWords, formatCount, textStats } from "./stats";
import { shouldSkipWord, tokenizeForSpellcheck } from "./tokenize";

describe("statistiche del testo", () => {
  it("conta parole e battute con e senza spazi, esclusi gli a capo", () => {
    const s = textStats("Iris scese.\nDell'acqua, poi.");
    expect(s.parole).toBe(4);
    expect(s.battute).toBe("Iris scese.Dell'acqua, poi.".length);
    expect(s.battuteSenzaSpazi).toBe("Irisscese.Dell'acqua,poi.".length);
  });

  it("conta le lettere accentate come una battuta", () => {
    expect(textStats("perché è così").battute).toBe(13);
  });

  it("restituisce zero su testo vuoto", () => {
    expect(textStats("")).toEqual({ parole: 0, battute: 0, battuteSenzaSpazi: 0 });
    expect(countWords("  — … ")).toBe(0);
  });

  it("formatta i numeri all'italiana", () => {
    expect(formatCount(14026)).toBe("14.026");
  });
});

describe("tokenizzazione per l'ortografia", () => {
  it("tiene intere le elisioni e normalizza l'apostrofo tipografico", () => {
    const text = "Dell’acqua e un'altro po'";
    const tokens = tokenizeForSpellcheck(text);
    expect(tokens.map((t) => t.word)).toEqual(["Dell'acqua", "e", "un'altro", "po'"]);
    for (const t of tokens) expect(text.slice(t.start, t.end).replace(/’/g, "'")).toBe(t.word);
  });

  it("salta le sigle", () => {
    expect(shouldSkipWord("ONU")).toBe(true);
    expect(shouldSkipWord("XII")).toBe(true);
    expect(shouldSkipWord("Iris")).toBe(false);
    expect(shouldSkipWord("E")).toBe(false);
  });
});
