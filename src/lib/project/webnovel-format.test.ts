import { describe, expect, it } from "vitest";
import { FormatError, isIsoDate, parseChapter, parseProjectManifest, parseWorkManifest, serializeChapter, serializeWorkManifest } from "./format";

describe("data di uscita del capitolo", () => {
  it("riconosce solo date vere AAAA-MM-GG", () => {
    expect(isIsoDate("2026-11-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28/11/2026")).toBe(false);
    expect(isIsoDate(20261128)).toBe(false);
  });

  it("si scrive e si rilegge con lo stato «pubblicato»", () => {
    const text = serializeChapter({ meta: { id: "abc", stato: "pubblicato", pubblicato: "2026-11-28" }, body: "Testo.\n" });
    expect(text).toContain("pubblicato: 2026-11-28");
    expect(parseChapter(text).meta).toEqual({ id: "abc", stato: "pubblicato", pubblicato: "2026-11-28" });
  });

  it("la data c'è solo se il capitolo è pubblicato: tornando a «scritto» sparisce", () => {
    const text = serializeChapter({ meta: { id: "abc", stato: "scritto", pubblicato: "2026-11-28" }, body: "Testo.\n" });
    expect(text).not.toContain("pubblicato:");
    expect(parseChapter("---\nid: abc\nstato: scritto\npubblicato: 2026-11-28\n---\n\nTesto.\n").meta).toEqual({ id: "abc", stato: "scritto" });
  });

  it("una data sbagliata scritta a mano non rompe il capitolo", () => {
    const doc = parseChapter("---\nid: abc\nstato: pubblicato\npubblicato: ieri\n---\n\nTesto.\n");
    expect(doc.meta).toEqual({ id: "abc", stato: "pubblicato" });
  });

  it("i capitoli senza la nuova riga restano invariati nel formato", () => {
    const text = serializeChapter({ meta: { id: "abc", stato: "bozza" }, body: "Testo.\n" });
    expect(text).toBe("---\nid: abc\nstato: bozza\n---\n\nTesto.\n");
  });
});

describe("opera di una web novel", () => {
  const yaml = `titolo: Il ladro di soglie
paroleCapitolo:
  min: 1500
  max: 3000
notaIniziale: |
  Grazie di leggere!
notaFinale: Si esce il martedì e il venerdì.
archi:
  - id: arco-1
    titolo: La partenza
    chiuso: true
    sintesi: Un ladro, una porta, un debito.
  - id: arco-2
    titolo: Il deserto
capitoli:
  - file: uno.md
    titolo: Uno
    arco: arco-1
  - file: due.md
    titolo: Due
`;

  it("legge archi, lunghezza voluta, note e arco di ogni capitolo", () => {
    const w = parseWorkManifest(yaml, "ladro");
    expect(w.paroleCapitolo).toEqual({ min: 1500, max: 3000 });
    expect(w.notaIniziale).toBe("Grazie di leggere!");
    expect(w.notaFinale).toBe("Si esce il martedì e il venerdì.");
    expect(w.archi).toEqual([
      { id: "arco-1", titolo: "La partenza", chiuso: true, sintesi: "Un ladro, una porta, un debito." },
      { id: "arco-2", titolo: "Il deserto" },
    ]);
    expect(w.capitoli).toEqual([
      { file: "uno.md", titolo: "Uno", arco: "arco-1" },
      { file: "due.md", titolo: "Due" },
    ]);
  });

  it("scrivere e rileggere non perde niente", () => {
    const w = parseWorkManifest(yaml, "ladro");
    expect(parseWorkManifest(serializeWorkManifest(w), "ladro")).toEqual(w);
  });

  it("un'opera senza i nuovi campi si scrive come prima", () => {
    const text = serializeWorkManifest({ titolo: "Racconto", capitoli: [{ file: "a.md", titolo: "A" }] });
    expect(text).toBe("titolo: Racconto\ncapitoli:\n  - file: a.md\n    titolo: A\n");
  });

  it("rifiuta archi con lo stesso id o senza titolo, e un intervallo di parole senza senso", () => {
    expect(() => parseWorkManifest("titolo: X\narchi:\n  - {id: a, titolo: Uno}\n  - {id: a, titolo: Due}\n", "x")).toThrow(FormatError);
    expect(() => parseWorkManifest("titolo: X\narchi:\n  - {id: a}\n", "x")).toThrow(FormatError);
    expect(() => parseWorkManifest("titolo: X\nparoleCapitolo: {min: 3000, max: 1500}\n", "x")).toThrow(FormatError);
    expect(() => parseWorkManifest("titolo: X\nparoleCapitolo: {min: 0, max: 100}\n", "x")).toThrow(FormatError);
  });
});

describe("tipo di progetto", () => {
  it("accetta «webnovel» accanto a racconto, romanzo e saga", () => {
    const m = parseProjectManifest("writly: 1\ntitolo: Serie\ntipo: webnovel\nopere: [serie]\n");
    expect(m.tipo).toBe("webnovel");
    expect(() => parseProjectManifest("writly: 1\ntitolo: Serie\ntipo: fumetto\n")).toThrow(FormatError);
  });
});
