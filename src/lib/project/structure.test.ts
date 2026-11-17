import { describe, expect, it } from "vitest";
import { FormatError } from "./format";
import {
  applyTemplate,
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
