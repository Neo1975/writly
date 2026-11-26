import { describe, expect, it } from "vitest";
import { anchorComment, comparable, parseComments, quoteContext, serializeComments, type ChapterComment } from "./comments";
import { commentsPath } from "./paths";

const base: ChapterComment = {
  id: "c1",
  tipo: "mentore",
  autore: "Claude",
  creato: "2026-11-18T10:00:00Z",
  categoria: "punto di vista",
  citazione: "Iris scese al molo",
  prima: "",
  dopo: "",
  testo: "Qui il punto di vista scivola.",
  risolto: false,
  risposte: [],
};

describe("commenti: formato", () => {
  it("salva e rilegge senza perdite, e il percorso segue il capitolo", () => {
    const c = { ...base, risposte: [{ tipo: "autore" as const, autore: "autore", creato: "2026-11-18T11:00:00Z", testo: "Giusto, sistemo." }] };
    const out = parseComments(serializeComments([c, { ...base, id: "c2", citazione: "", categoria: "", testo: "Commento generale." }]), "x.yaml");
    expect(out.errori).toEqual([]);
    expect(out.commenti[0]).toEqual(c);
    expect(out.commenti[1].citazione).toBe("");
    expect(commentsPath("il-molo", "capitolo-1.md")).toBe("opere/il-molo/commenti/capitolo-1.yaml");
  });

  it("salta i commenti illeggibili o con id ripetuto senza perdere gli altri", () => {
    const src = "commenti:\n  - id: a\n    testo: ok\n  - id: Non Valido\n    testo: x\n  - id: a\n    testo: doppio\n  - id: b\n";
    const out = parseComments(src, "x.yaml");
    expect(out.commenti.map((c) => c.id)).toEqual(["a"]);
    expect(out.errori).toHaveLength(3);
  });
});

describe("commenti: ancoraggio alla citazione", () => {
  const text = "Iris scese al molo. Il molo era deserto.\nPoi Iris scese al molo, di nuovo, con l’ombrello.";

  it("trova la citazione e ignora spazi, apostrofi tipografici e segni Markdown", () => {
    expect(anchorComment(text, { citazione: "con l'ombrello", prima: "", dopo: "" })).toEqual({ start: text.indexOf("con l’ombrello"), end: text.indexOf("con l’ombrello") + 14 });
    const r = anchorComment(text, { citazione: "Il   **molo** era\ndeserto", prima: "", dopo: "" })!;
    expect(text.slice(r.start, r.end)).toBe("Il molo era deserto");
  });

  it("con più occorrenze sceglie quella col contesto più simile", () => {
    const second = anchorComment(text, { citazione: "Iris scese al molo", prima: "deserto. Poi", dopo: ", di nuovo" })!;
    expect(second.start).toBe(text.lastIndexOf("Iris scese al molo"));
    const first = anchorComment(text, { citazione: "Iris scese al molo", prima: "", dopo: ". Il molo" })!;
    expect(first.start).toBe(0);
  });

  it("ripiega sulle maiuscole diverse e restituisce null se il passaggio non c'è più", () => {
    expect(anchorComment(text, { citazione: "il molo era DESERTO", prima: "", dopo: "" })).not.toBeNull();
    expect(anchorComment(text, { citazione: "una frase tagliata", prima: "", dopo: "" })).toBeNull();
    expect(anchorComment(text, { citazione: "", prima: "", dopo: "" })).toBeNull();
  });

  it("prepara il contesto di una nuova citazione", () => {
    const s = text.indexOf("Il molo");
    expect(quoteContext(text, s, s + 7, 12)).toEqual({ prima: "se al molo. ", dopo: " era deserto" });
    expect(comparable("  a \n b ").text).toBe("a b");
  });
});
