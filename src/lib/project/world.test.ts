import { describe, expect, it } from "vitest";
import { FormatError } from "./format";
import { parseWorldEntryPath, parseMapPath } from "./paths";
import {
  formatWorldDate,
  isMapImagePath,
  parseMap,
  serializeMap,
  normalizeChronology,
  parseChronology,
  parseRules,
  rulesFor,
  serializeChronology,
  serializeRules,
  sniffImage,
  type Chronology,
} from "./world";

describe("regole del mondo", () => {
  it("giro YAML e filtro per voci", () => {
    const rules = [
      { id: "r1", testo: "La magia del sale non funziona sull'acqua dolce", voci: ["sale"], note: "" },
      { id: "r2", testo: "Da Vael alla Torre servono 3 giorni di nave", voci: ["vael", "torre"], note: "Con mare calmo" },
    ];
    expect(parseRules(serializeRules(rules))).toEqual(rules);
    expect(rulesFor(rules, ["torre"]).map((r) => r.id)).toEqual(["r2"]);
    expect(rulesFor(rules, [])).toEqual([]);
  });
});

describe("storia del mondo", () => {
  const chrono: Chronology = {
    calendario: { ere: [{ id: "antica", nome: "Era Antica" }, { id: "sale", nome: "Era del Sale" }], mesi: ["Brina", "Disgelo", "Semina"] },
    eventi: [
      { id: "e3", titolo: "Fondazione di Vael", era: "sale", anno: 1, mese: 2, giorno: 12, descrizione: "", voci: ["vael"], personaggi: [] },
      { id: "e1", titolo: "Il grande naufragio", era: "antica", anno: 340, mese: null, giorno: null, descrizione: "", voci: [], personaggi: [] },
      { id: "e2", titolo: "La siccità", era: "antica", anno: 12, mese: 1, giorno: null, descrizione: "", voci: [], personaggi: [] },
    ],
  };

  it("ordina gli eventi per era, anno, mese, giorno", () => {
    const n = normalizeChronology(chrono);
    expect(n.eventi.map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
    expect(parseChronology(serializeChronology(n))).toEqual(n);
  });

  it("formatta le date col calendario inventato", () => {
    expect(formatWorldDate(chrono.eventi[0], chrono.calendario)).toBe("12 Disgelo anno 1, Era del Sale");
    expect(formatWorldDate({ era: null, anno: -40, mese: null, giorno: null }, chrono.calendario)).toBe("anno -40");
  });

  it("tollera ere e mesi tolti dal calendario, rifiuta anni non interi", () => {
    const n = normalizeChronology({ calendario: { ere: [], mesi: [] }, eventi: [{ id: "x", titolo: "X", era: "sparita", anno: 3, mese: 5 }] });
    expect(n.eventi[0]).toMatchObject({ era: null, mese: null });
    expect(() => normalizeChronology({ eventi: [{ id: "x", titolo: "X", anno: 2.5 }] })).toThrow(FormatError);
  });
});

describe("mappe", () => {
  it("giro YAML, coordinate in percentuale", () => {
    const m = { nome: "Costa del Sale", immagine: "mondo/mappe/costa.png", segnaposti: [{ id: "p1", voce: "vael", x: 12.5, y: 80 }] };
    expect(parseMap(serializeMap(m), "mondo/mappe/costa.yaml")).toEqual(m);
    expect(() => parseMap("nome: X\nsegnaposti:\n  - id: p\n    voce: v\n    x: 120\n    y: 3\n", "m")).toThrow(FormatError);
    expect(() => parseMap("nome: X\nimmagine: ../../segreto.png\n", "m")).toThrow(FormatError);
  });

  it("percorsi: le mappe non sono voci del mondo, e solo immagini sicure", () => {
    expect(parseMapPath("mondo/mappe/costa.yaml")).toBe("costa");
    expect(parseWorldEntryPath("mondo/mappe/costa.md")).toBeNull();
    expect(isMapImagePath("mondo/mappe/costa.webp")).toBe(true);
    expect(isMapImagePath("mondo/mappe/costa.svg")).toBe(false);
  });

  it("riconosce il formato dai primi byte", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
