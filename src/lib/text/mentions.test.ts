import { describe, expect, it } from "vitest";
import { countMentions, createMentionMatcher, nameWords } from "./mentions";
import { markdownToPlain, textStats } from "./stats";

describe("riconoscimento dei nomi", () => {
  const matcher = createMentionMatcher([
    { id: "iris", names: ["Iris Calvi", "Iris"] },
    { id: "ilario", names: ["Mastro Ilario", "Ilario"] },
    { id: "rosa", names: ["Rosa"] },
    { id: "vael", names: ["Vael", "Città del Sale"] },
  ]);

  it("trova nomi e alias rispettando maiuscole e confini di parola", () => {
    const text = "Iris guardò Mastro Ilario; la rosa era per Rosa. Irisa no. A Vael, nella Città del Sale.";
    const found = matcher.find(text).map((m) => [m.id, m.name]);
    expect(found).toEqual([
      ["iris", "Iris"],
      ["ilario", "Mastro Ilario"],
      ["rosa", "Rosa"],
      ["vael", "Vael"],
      ["vael", "Città del Sale"],
    ]);
  });

  it("riconosce i nomi dopo un'elisione e con lettere accentate", () => {
    const m = createMentionMatcher([{ id: "e", names: ["Elèna"] }]);
    expect(m.find("Era d'Elèna, non di Elènara.").map((x) => x.start)).toEqual([6]);
    expect(countMentions(matcher, "Iris, Iris Calvi e Vael").get("iris")).toBe(2);
  });

  it("segnala i nomi condivisi da più schede", () => {
    const m = createMentionMatcher([{ id: "a", names: ["Leo"] }, { id: "b", names: ["Leo"] }]);
    expect(m.ambiguous).toEqual(["Leo"]);
    expect(m.find("Leo")[0].id).toBe("a");
  });

  it("estrae le parole dei nomi per il dizionario", () => {
    expect(nameWords(["Mastro Ilario", "d'Arcà", "Vael"]).sort()).toEqual(["Arcà", "Ilario", "Mastro", "Vael", "d"].sort());
  });
});

describe("Markdown in testo semplice", () => {
  it("toglie i marcatori prima di contare", () => {
    const md = "## Titolo\n\nIris *corse* al **molo**.\n\n---\n\n> «Aspetta» disse.\n";
    expect(markdownToPlain(md)).toBe("Titolo\nIris corse al molo.\n«Aspetta» disse.\n");
    expect(textStats(markdownToPlain(md)).parole).toBe(7);
  });
});
