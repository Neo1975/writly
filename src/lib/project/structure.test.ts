import { describe, expect, it } from "vitest";
import { FormatError } from "./format";
import {
  applyTemplate,
  changeMeasure,
  chapterScenes,
  sceneAmounts,
  scaleBattute,
  sectionTargets,
  totalBattute,
  moveScene,
  normalizeWorkStructure,
  parseTemplate,
  parseWorkStructure,
  rebalance,
  removeSection,
  scenesIn,
  serializeTemplate,
  serializeWorkStructure,
  totalWeight,
  wordTargets,
  type Scene,
  type WorkStructure,
} from "./structure";
import { BUILTIN_TEMPLATES, builtinTemplate } from "./templates";
import { splitScenes } from "../text/stats";

const scene = (id: string, sezione: string | null, extra: Partial<Scene> = {}): Scene => ({
  id,
  titolo: `Scena ${id}`,
  sezione,
  capitolo: null,
  stato: "idea",
  sinossi: "",
  obiettivo: "",
  conflitto: "",
  esito: "",
  pov: null,
  luogo: null,
  quando: "",
  personaggi: [],
  ...extra,
});

describe("strutture predefinite", () => {
  it("hanno pesi che sommano a 100 e id unici", () => {
    for (const t of BUILTIN_TEMPLATES.filter((t) => t.id !== "libero")) {
      expect(totalWeight(t.atti), t.nome).toBe(100);
      const ids = t.atti.flatMap((a) => [a.id, ...a.sezioni.map((s) => s.id)]);
      expect(new Set(ids).size, t.nome).toBe(ids.length);
    }
    expect(builtinTemplate("viaggio-eroe")!.atti.flatMap((a) => a.sezioni)).toHaveLength(12);
    expect(builtinTemplate("save-the-cat")!.atti.flatMap((a) => a.sezioni)).toHaveLength(15);
  });

  it("sopravvivono al giro YAML", () => {
    const t = { ...builtinTemplate("save-the-cat")!, id: "mia", origine: "Save the Cat! (romanzo)" };
    expect(parseTemplate(serializeTemplate(t), "mia")).toEqual(t);
  });
});

describe("struttura di un'opera", () => {
  const base = (): WorkStructure => ({
    ...applyTemplate(null, builtinTemplate("viaggio-eroe")!),
    scene: [scene("a1", "chiamata"), scene("a2", "chiamata"), scene("b1", "mentore"), scene("x1", null)],
  });

  it("serializza e rilegge le scene con tutti i campi", () => {
    const s = base();
    s.scene[0] = { ...s.scene[0], capitolo: "capitolo-1.md", stato: "scritta", pov: "iris", personaggi: ["iris", "tomas"], sinossi: "Arriva la lettera." };
    expect(parseWorkStructure(serializeWorkStructure(s), "opera")).toEqual(s);
  });

  it("manda in «Non assegnate» le scene di sezioni che non esistono", () => {
    const s = normalizeWorkStructure({ modello: { id: "x", nome: "X" }, atti: [], scene: [{ id: "a", titolo: "A", sezione: "sparita" }] });
    expect(s.scene[0].sezione).toBeNull();
  });

  it("rifiuta id ripetuti e capitoli non validi", () => {
    expect(() => normalizeWorkStructure({ scene: [{ id: "a", titolo: "A" }, { id: "a", titolo: "B" }] })).toThrow(FormatError);
    expect(() => normalizeWorkStructure({ scene: [{ id: "a", titolo: "A", capitolo: "../x.md" }] })).toThrow(FormatError);
  });

  it("eliminare una sezione non perde le scene", () => {
    const s = removeSection(base(), "chiamata");
    expect(s.scene.map((x) => x.id)).toEqual(["a1", "a2", "b1", "x1"]);
    expect(scenesIn(s.scene, null).map((x) => x.id)).toEqual(["a1", "a2", "x1"]);
  });

  it("cambiare modello conserva le scene compatibili", () => {
    const s = applyTemplate(base(), builtinTemplate("save-the-cat")!);
    expect(s.modello.id).toBe("save-the-cat");
    expect(s.scene.every((x) => x.sezione === null)).toBe(true);
    expect(s.scene).toHaveLength(4);
  });
});

describe("spostamento delle scene", () => {
  const scenes = [scene("a1", "s1"), scene("a2", "s1"), scene("b1", "s2"), scene("x", null)];

  it("riordina dentro la stessa sezione", () => {
    expect(scenesIn(moveScene(scenes, "a2", "s1", 0), "s1").map((s) => s.id)).toEqual(["a2", "a1"]);
  });

  it("sposta tra sezioni nella posizione indicata o in coda", () => {
    const m = moveScene(scenes, "b1", "s1", 1);
    expect(scenesIn(m, "s1").map((s) => s.id)).toEqual(["a1", "b1", "a2"]);
    expect(scenesIn(m, "s2")).toHaveLength(0);
    expect(scenesIn(moveScene(scenes, "x", "s2", 99), "s2").map((s) => s.id)).toEqual(["b1", "x"]);
    expect(scenesIn(moveScene(scenes, "a1", "vuota", 0), "vuota").map((s) => s.id)).toEqual(["a1"]);
  });
});

describe("pesi", () => {
  it("ribilancia a 100 mantenendo le proporzioni", () => {
    const atti = [{ id: "a", nome: "A", sezioni: [{ id: "x", nome: "X", guida: "", peso: 10 }, { id: "y", nome: "Y", guida: "", peso: 20 }, { id: "z", nome: "Z", guida: "", peso: 20 }] }];
    const r = rebalance(atti);
    expect(r[0].sezioni.map((s) => s.peso)).toEqual([20, 40, 40]);
    const zero = rebalance([{ id: "a", nome: "A", sezioni: ["p", "q", "r"].map((id) => ({ id, nome: id, guida: "", peso: 0 })) }]);
    expect(totalWeight(zero)).toBe(100);
  });

  it("stima le parole per sezione", () => {
    const t = wordTargets(builtinTemplate("viaggio-eroe")!.atti, 80000);
    expect(t.get("prova-centrale")).toBe(12000);
    expect(t.get("mondo-ordinario")).toBe(4000);
  });
});

describe("misura in battute esatte", () => {
  const atti = [
    { id: "a", nome: "Inizio", sezioni: [{ id: "x", nome: "X", guida: "", peso: 25 }] },
    { id: "b", nome: "Fine", sezioni: [{ id: "y", nome: "Y", guida: "", peso: 50 }, { id: "z", nome: "Z", guida: "", peso: 25 }] },
  ];
  const doc: WorkStructure = { modello: { id: "libero", nome: "Libero" }, atti, scene: [] };

  it("distribuisce un totale secondo i pesi, con somma esatta", () => {
    const b = changeMeasure(doc, "battute", 10001);
    expect(b.misura).toBe("battute");
    expect(b.atti.flatMap((a) => a.sezioni.map((s) => s.battute))).toEqual([2500, 5001, 2500]);
    expect(totalBattute(b.atti)).toBe(10001);
    expect(sectionTargets(b, 80000)).toEqual({ unit: "battute", targets: new Map([["x", 2500], ["y", 5001], ["z", 2500]]) });
  });

  it("torna alla percentuale ricavando i pesi dalle battute, e conserva le battute per un ritorno", () => {
    const b = changeMeasure(doc, "battute", 8000);
    const edited = { ...b, atti: b.atti.map((a) => ({ ...a, sezioni: a.sezioni.map((s) => ({ ...s, battute: s.id === "x" ? 4000 : 2000 })) })) };
    const p = changeMeasure(edited, "percentuale", 0);
    expect(p.misura).toBeUndefined();
    expect(p.atti.flatMap((a) => a.sezioni.map((s) => s.peso))).toEqual([50, 25, 25]);
    // Le battute scritte a mano non vanno perse: tornando alle battute si ritrovano.
    expect(changeMeasure(p, "battute", 99999).atti.flatMap((a) => a.sezioni.map((s) => s.battute))).toEqual([4000, 2000, 2000]);
    expect(sectionTargets(p, 1000).unit).toBe("parole");
  });

  it("salva e rilegge misura e battute; le strutture senza misura restano in percentuale", () => {
    const b = changeMeasure(doc, "battute", 12000);
    const back = parseWorkStructure(serializeWorkStructure(b), "x");
    expect(back.misura).toBe("battute");
    expect(back.atti[1].sezioni[0].battute).toBe(6000);
    expect(parseWorkStructure(serializeWorkStructure(doc), "x").misura).toBeUndefined();
    const t = parseTemplate(serializeTemplate({ id: "t", nome: "Racconto 10k", descrizione: "", origine: "", misura: "battute", atti: b.atti }), "t");
    expect(t.misura).toBe("battute");
    expect(applyTemplate(null, t).misura).toBe("battute");
    expect(() => normalizeWorkStructure({ atti: [{ id: "a", nome: "A", sezioni: [{ id: "s", nome: "S", battute: -3 }] }] })).toThrow(FormatError);
  });
});

describe("ridistribuzione delle battute", () => {
  it("porta il totale a un nuovo valore mantenendo le proporzioni", () => {
    const atti = [{ id: "a", nome: "A", sezioni: [{ id: "x", nome: "X", guida: "", peso: 0, battute: 3000 }, { id: "y", nome: "Y", guida: "", peso: 0, battute: 1000 }] }];
    expect(scaleBattute(atti, 10000)[0].sezioni.map((s) => s.battute)).toEqual([7500, 2500]);
    expect(totalBattute(scaleBattute(atti, 9999))).toBe(9999);
  });
});

describe("parole di ogni scena", () => {
  const sc = (id: string, sezione: string | null, capitolo: string | null): Scene => ({
    id, titolo: id, sezione, capitolo, stato: "scritta", sinossi: "", obiettivo: "", conflitto: "", esito: "", pov: null, luogo: null, quando: "", personaggi: [],
  });
  const atti = [{ id: "a", nome: "A", sezioni: [{ id: "s1", nome: "S1", guida: "", peso: 50 }, { id: "s2", nome: "S2", guida: "", peso: 50 }] }];
  // Nell'elenco la scena della seconda sezione viene prima: conta l'ordine della storia.
  const doc: WorkStructure = { modello: { id: "x", nome: "X" }, atti, scene: [sc("tardi", "s2", "c1.md"), sc("presto", "s1", "c1.md"), sc("sola", "s1", "c2.md"), sc("a1", "s1", "c3.md"), sc("a2", "s2", "c3.md")] };

  it("assegna a ogni scena la sua parte del capitolo, nell'ordine della storia", () => {
    const r = sceneAmounts(doc, new Map([["c1.md", { totale: 300, parti: [100, 200] }], ["c2.md", { totale: 50, parti: [20, 30] }], ["c3.md", { totale: 90, parti: [90] }]]));
    expect(chapterScenes(doc, "c1.md").map((s) => s.id)).toEqual(["presto", "tardi"]);
    expect(r.amounts.get("presto")).toBe(100);
    expect(r.amounts.get("tardi")).toBe(200);
    // Una sola scena nel capitolo: tutto il capitolo è suo, anche con più parti.
    expect(r.amounts.get("sola")).toBe(50);
    expect(r.exact.has("sola")).toBe(true);
    // Due scene ma una sola parte: stima e avviso.
    expect(r.amounts.get("a1")).toBe(45);
    expect(r.exact.has("a1")).toBe(false);
    expect(r.mismatched).toEqual([{ file: "c3.md", scene: 2, parti: 1 }]);
  });

  it("divide il capitolo ai cambi di scena, ignorando le parti vuote", () => {
    expect(splitScenes("Uno due.\n\n---\n\nTre.\n\n* * *\n\nQuattro cinque sei.")).toEqual(["Uno due.", "Tre.", "Quattro cinque sei."]);
    expect(splitScenes("---\n\nSolo questa.\n\n---\n")).toEqual(["Solo questa."]);
  });
});
