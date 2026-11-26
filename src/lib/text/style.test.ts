import { describe, expect, it } from "vitest";
import { continuityWarnings, findAttributes, sheetAttributes } from "./continuity";
import { createMentionMatcher } from "./mentions";
import { analyzeStyle, overusedWords, sentences, stem, words } from "./style";

const ALL = { ripetizioni: true, frasiLunghe: true, avverbi: true };

describe("controlli di stile", () => {
  it("segnala le ripetizioni ravvicinate, anche al plurale, ma non le parole funzionali", () => {
    const text = "La porta era chiusa. Dietro la porta, altre porte. Come sempre, come prima.";
    const rip = analyzeStyle(text, { ...ALL, frasiLunghe: false, avverbi: false });
    expect(rip.map((r) => text.slice(r.start, r.end))).toEqual(["porta", "porta", "porte"]);
  });

  it("non segnala le ripetizioni lontane né le parole ignorate", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `parola${i}`).join(" ");
    expect(analyzeStyle(`mare ${filler} mare`, { ...ALL, frasiLunghe: false })).toEqual([]);
    expect(analyzeStyle("Iris guardò Iris allo specchio.", { ...ALL, ignora: ["Iris"] })).toEqual([]);
  });

  it("tiene la parola dopo l'elisione", () => {
    expect(words("dell'acqua e l'acqua").map((w) => w.word)).toEqual(["acqua", "e", "acqua"]);
    const issues = analyzeStyle("dell'acqua e l'acqua", ALL);
    expect(issues).toHaveLength(2);
    expect(issues[0].start).toBe(5);
  });

  it("segnala gli avverbi in -mente ma non «mente» o «veemente»", () => {
    const text = "Lentamente aprì. La mente vagava, veemente, e improvvisamente tacque.";
    const adv = analyzeStyle(text, { ripetizioni: false, frasiLunghe: false, avverbi: true });
    expect(adv.map((a) => text.slice(a.start, a.end))).toEqual(["Lentamente", "improvvisamente"]);
  });

  it("divide le frasi e segnala quelle troppo lunghe", () => {
    const long = Array.from({ length: 12 }, () => "uno due tre").join(" ") + " fine.";
    const text = `Breve. ${long} «Davvero?» disse.\nUn altro blocco senza punto`;
    expect(sentences(text).map((s) => s.words)).toEqual([1, 37, 1, 1, 5]);
    const issues = analyzeStyle(text, { ripetizioni: false, avverbi: false, frasiLunghe: true, maxParole: 30 });
    expect(issues).toHaveLength(1);
    expect(text.slice(issues[0].start, issues[0].end)).toBe(long);
  });

  it("elenca le parole più usate, raggruppate per radice", () => {
    const text = "Il mare. Il mare calmo. Mari lontani, mare nostro. Il mare. Vento.";
    expect(stem("mari")).toBe("mari");
    expect(overusedWords(text, { min: 3 })).toEqual([{ word: "mare", count: 4, perMille: 333.3 }]);
  });
});

describe("continuità", () => {
  const matcher = createMentionMatcher([
    { id: "iris", names: ["Iris"] },
    { id: "tomas", names: ["Tomas"] },
  ]);
  const characters = [
    { id: "iris", nome: "Iris", attributi: sheetAttributes("Alta, occhi verdi, capelli neri e ricci.") },
    { id: "tomas", nome: "Tomas", attributi: sheetAttributes("Barba grigia.") },
  ];

  it("legge gli attributi dalla scheda", () => {
    expect(findAttributes("occhi di un verde intenso").map((a) => `${a.parte}:${a.valore}`)).toEqual(["occhi:verde"]);
    const iris = characters[0].attributi;
    expect([...iris.get("occhi")!]).toEqual(["verde"]);
    expect([...iris.get("capelli")!].sort()).toEqual(["nero", "riccio"]);
  });

  it("segnala un colore diverso da quello della scheda nella frase che nomina il personaggio", () => {
    const text = "Iris alzò gli occhi azzurri verso il cielo. Tomas aveva occhi azzurri.";
    const w = continuityWarnings(text, characters, matcher);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: "iris", parte: "occhi", trovato: "azzurro", atteso: ["verde"], testo: "occhi azzurri" });
    expect(text.slice(w[0].start, w[0].end)).toBe("occhi azzurri");
  });

  it("non confonde dimensioni diverse né valori coerenti", () => {
    const text = "Iris si legò i capelli lunghi. Iris aveva gli occhi verdi e i capelli neri.";
    expect(continuityWarnings(text, characters, matcher)).toEqual([]);
  });

  it("attribuisce l'aggettivo al personaggio nominato più vicino", () => {
    const text = "Iris guardò Tomas, la barba bianca sporca di sale.";
    const w = continuityWarnings(text, characters, matcher);
    expect(w.map((x) => `${x.nome}:${x.trovato}`)).toEqual(["Tomas:bianco"]);
  });
});
