import { describe, expect, it } from "vitest";
import type { Arc, ChapterEntry } from "./format";
import { addDays, groupByArc, publicationStats, rangeStatus, todayIso, type PublicationChapter } from "./serial";

describe("date", () => {
  it("oggi come AAAA-MM-GG nel fuso locale e somma di giorni a cavallo di mese e anno", () => {
    expect(todayIso(new Date(2026, 10, 5, 23, 59))).toBe("2026-11-05");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("lunghezza del capitolo", () => {
  const range = { min: 1500, max: 3000 };
  it("sotto, dentro e sopra l'obiettivo", () => {
    expect(rangeStatus(900, range)).toBe("sotto");
    expect(rangeStatus(1500, range)).toBe("dentro");
    expect(rangeStatus(3000, range)).toBe("dentro");
    expect(rangeStatus(3001, range)).toBe("sopra");
  });
  it("niente giudizio senza obiettivo o su un capitolo vuoto", () => {
    expect(rangeStatus(900, undefined)).toBeNull();
    expect(rangeStatus(0, range)).toBeNull();
  });
});

describe("capitoli per arco", () => {
  const archi: Arc[] = [
    { id: "a1", titolo: "La partenza" },
    { id: "a2", titolo: "Il deserto", chiuso: true },
    { id: "a3", titolo: "Ancora da scrivere" },
  ];
  const cap = (file: string, arco?: string): ChapterEntry => ({ file, titolo: file, ...(arco ? { arco } : {}) });

  it("raggruppa nell'ordine degli archi, tiene l'ordine dell'opera e i numeri globali", () => {
    const groups = groupByArc([cap("c1.md", "a1"), cap("c2.md", "a1"), cap("c3.md", "a2"), cap("c4.md", "a1")], archi);
    expect(groups.map((g) => g.arco?.id)).toEqual(["a1", "a2", "a3"]);
    expect(groups[0].capitoli.map((c) => [c.entry.file, c.numero])).toEqual([["c1.md", 1], ["c2.md", 2], ["c4.md", 4]]);
    expect(groups[1].capitoli.map((c) => c.numero)).toEqual([3]);
    expect(groups[2].capitoli).toEqual([]);
  });

  it("i capitoli senza arco, o con un arco eliminato, vanno in fondo", () => {
    const groups = groupByArc([cap("c1.md"), cap("c2.md", "sparito"), cap("c3.md", "a1")], archi);
    const last = groups[groups.length - 1];
    expect(last.arco).toBeNull();
    expect(last.capitoli.map((c) => c.entry.file)).toEqual(["c1.md", "c2.md"]);
  });

  it("nessun gruppo «senza arco» se tutti i capitoli hanno un arco; senza archi è tutto in un gruppo", () => {
    expect(groupByArc([cap("c1.md", "a1")], archi).some((g) => g.arco === null)).toBe(false);
    const flat = groupByArc([cap("c1.md"), cap("c2.md")], []);
    expect(flat).toHaveLength(1);
    expect(flat[0].arco).toBeNull();
    expect(groupByArc([], [])).toEqual([]);
  });
});

describe("scorta e ritmo di uscita", () => {
  const today = "2026-11-28";
  const pub = (pubblicato: string | null): PublicationChapter => ({ stato: "pubblicato", pubblicato });
  const st = (stato: PublicationChapter["stato"]): PublicationChapter => ({ stato, pubblicato: null });

  it("conta usciti, programmati e pronti; la scorta è pronti più programmati", () => {
    const s = publicationStats([pub("2026-11-10"), pub("2026-11-20"), pub("2026-12-02"), st("scritto"), st("revisionato"), st("bozza"), st("in-stesura"), st("mancante")], today);
    expect(s.pubblicati).toBe(2);
    expect(s.programmati).toBe(1);
    expect(s.pronti).toBe(2);
    expect(s.scorta).toBe(3);
    expect(s.ultimaUscita).toBe("2026-11-20");
    expect(s.prossimaUscita).toBe("2026-12-02");
  });

  it("ritmo sugli ultimi 28 giorni e settimane di scorta", () => {
    // 4 uscite in 28 giorni = 1 a settimana; 3 capitoli di scorta = 3 settimane.
    const s = publicationStats([pub("2026-11-02"), pub("2026-11-09"), pub("2026-11-16"), pub("2026-11-23"), st("scritto"), st("scritto"), st("revisionato")], today);
    expect(s.ultimi28Giorni).toBe(4);
    expect(s.perSettimana).toBe(1);
    expect(s.settimaneDiScorta).toBe(3);
  });

  it("le uscite più vecchie di 28 giorni non fanno ritmo; senza ritmo non si stima la scorta", () => {
    const s = publicationStats([pub("2026-09-01"), pub("2026-10-15"), st("scritto")], today);
    expect(s.pubblicati).toBe(2);
    expect(s.ultimi28Giorni).toBe(0);
    expect(s.perSettimana).toBeNull();
    expect(s.settimaneDiScorta).toBeNull();
    expect(s.scorta).toBe(1);
  });

  it("il limite della finestra: il ventottesimo giorno conta, il ventinovesimo no", () => {
    expect(publicationStats([pub("2026-11-01")], today).ultimi28Giorni).toBe(1);
    expect(publicationStats([pub("2026-10-31")], today).ultimi28Giorni).toBe(0);
  });

  it("un capitolo «pubblicato» senza data conta come uscito ma non fa ritmo; oggi è già uscito", () => {
    const s = publicationStats([pub(null), pub(today)], today);
    expect(s.pubblicati).toBe(2);
    expect(s.programmati).toBe(0);
    expect(s.ultimi28Giorni).toBe(1);
  });

  it("senza capitoli tutto a zero", () => {
    const s = publicationStats([], today);
    expect(s).toMatchObject({ pubblicati: 0, programmati: 0, pronti: 0, scorta: 0, ultimaUscita: null, prossimaUscita: null, perSettimana: null, settimaneDiScorta: null });
  });
});
