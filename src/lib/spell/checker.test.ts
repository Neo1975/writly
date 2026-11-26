import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createSpellChecker, type SpellChecker } from "./checker";

// Test di integrazione con il vero Hunspell e il dizionario italiano in public/.
let checker: SpellChecker;

beforeAll(async () => {
  const { loadModule } = await import("hunspell-asm");
  const factory = await loadModule();
  const dir = join(process.cwd(), "public", "dictionaries");
  const aff = factory.mountBuffer(new Uint8Array(readFileSync(join(dir, "it.aff"))), "it.aff");
  const dic = factory.mountBuffer(new Uint8Array(readFileSync(join(dir, "it.dic"))), "it.dic");
  checker = createSpellChecker(factory.create(aff, dic));
});

describe("controllo ortografico italiano", () => {
  it("accetta parole corrette, elisioni e maiuscole a inizio frase", () => {
    for (const w of ["soprattutto", "dell'acqua", "c'è", "perché", "Città", "po'"]) {
      expect(checker.isCorrect(w), w).toBe(true);
    }
  });

  it("segnala errori comuni, compreso un'altro", () => {
    for (const w of ["tolgiere", "un'altro", "dell'acqa"]) {
      expect(checker.isCorrect(w), w).toBe(false);
    }
  });

  it("propone correzioni", () => {
    expect(checker.suggest("tolgiere")).toContain("togliere");
  });

  it("accetta le parole del dizionario di progetto", () => {
    expect(checker.isCorrect("Vael")).toBe(false);
    checker.accept(["Vael"]);
    expect(checker.isCorrect("Vael")).toBe(true);
  });
});
