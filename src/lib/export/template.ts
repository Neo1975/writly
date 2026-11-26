import YAML from "yaml";
import { FormatError, parseYaml } from "@/lib/project/format";
import { oneOf, record, requiredText, text } from "@/lib/project/normalize";

/**
 * Template di impaginazione PDF: formato, margini, testo, titoli, intestazioni,
 * numerazione, frontespizio, indice, separatore di scena, filigrana.
 * I template dell'autore sono in `template-pdf/<id>.yaml` nel repository del progetto.
 */

export const PAGE_FORMATS = {
  A4: { nome: "A4 (21×29,7 cm)", larghezza: 210, altezza: 297 },
  A5: { nome: "A5 (14,8×21 cm)", larghezza: 148, altezza: 210 },
  "14x21": { nome: "14×21 cm", larghezza: 140, altezza: 210 },
  "15x23": { nome: "15×23 cm", larghezza: 150, altezza: 230 },
  "12x19": { nome: "Tascabile 12×19 cm", larghezza: 120, altezza: 190 },
  personalizzato: { nome: "Personalizzato", larghezza: 0, altezza: 0 },
} as const;
export type PageFormat = keyof typeof PAGE_FORMATS;
const FORMATS = Object.keys(PAGE_FORMATS) as PageFormat[];

export const FONTS = ["Literata", "EB Garamond", "Roboto"] as const;
export type FontName = (typeof FONTS)[number];

export interface PdfTemplate {
  id: string;
  nome: string;
  pagina: { formato: PageFormat; larghezza: number; altezza: number };
  /** Millimetri. Interno = lato della rilegatura (a sinistra sulle pagine dispari). */
  margini: { alto: number; basso: number; interno: number; esterno: number };
  testo: {
    font: FontName;
    /** Corpo in punti tipografici. */
    corpo: number;
    interlinea: number;
    /** Rientro della prima riga, in mm (0 = nessuno). */
    rientro: number;
    giustificato: boolean;
    /** Spazio dopo ogni paragrafo, in punti. */
    spazioParagrafi: number;
  };
  /** Ogni capitolo comincia su una nuova pagina. */
  capitoli: {
    /** Ogni capitolo comincia su una pagina dispari (a destra), aggiungendo una pagina bianca se serve. */
    aDestra: boolean;
    allineamento: "centro" | "sinistra";
    corpo: number;
    maiuscolo: boolean;
    /** Mostra «Capitolo N» sopra il titolo. */
    numero: boolean;
    /** Spazio sopra il titolo, in mm. */
    spazioSopra: number;
  };
  /** «titoli»: titolo dell'opera sulle pagine pari, del capitolo sulle dispari. */
  intestazioni: "nessuna" | "titoli";
  numerazione: "centro" | "esterno" | "nessuna";
  frontespizio: boolean;
  indice: boolean;
  separatoreScena: string;
  filigrana: boolean;
}

function num(obj: Record<string, unknown>, key: string, what: string, min: number, max: number, fallback: number): number {
  const v = obj[key];
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new FormatError(`${what}: «${key}» deve essere tra ${min} e ${max}`);
  return Math.round(n * 10) / 10;
}

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export function normalizePdfTemplate(value: unknown, what = "template PDF"): PdfTemplate {
  const obj = record(value, what);
  const pg = record(obj.pagina, `${what}, pagina`);
  const formato = oneOf(pg.formato, FORMATS, "A5");
  const size =
    formato === "personalizzato"
      ? { larghezza: num(pg, "larghezza", what, 50, 500, 148), altezza: num(pg, "altezza", what, 50, 500, 210) }
      : { larghezza: PAGE_FORMATS[formato].larghezza, altezza: PAGE_FORMATS[formato].altezza };
  const mg = record(obj.margini, `${what}, margini`);
  const margini = {
    alto: num(mg, "alto", what, 0, 80, 18),
    basso: num(mg, "basso", what, 0, 80, 20),
    interno: num(mg, "interno", what, 0, 80, 20),
    esterno: num(mg, "esterno", what, 0, 80, 15),
  };
  if (margini.interno + margini.esterno >= size.larghezza - 20 || margini.alto + margini.basso >= size.altezza - 30) {
    throw new FormatError(`${what}: i margini lasciano troppo poco spazio per il testo`);
  }
  const tx = record(obj.testo, `${what}, testo`);
  const cp = record(obj.capitoli, `${what}, capitoli`);
  const sep = text(obj, "separatoreScena", what, 20);
  return {
    id: text(obj, "id", what, 80),
    nome: requiredText(obj, "nome", what),
    pagina: { formato, ...size },
    margini,
    testo: {
      font: oneOf(tx.font, FONTS, "Literata"),
      corpo: num(tx, "corpo", what, 6, 24, 11),
      interlinea: num(tx, "interlinea", what, 0.8, 3, 1.35),
      rientro: num(tx, "rientro", what, 0, 30, 5),
      giustificato: bool(tx.giustificato, true),
      spazioParagrafi: num(tx, "spazioParagrafi", what, 0, 30, 0),
    },
    capitoli: {
      aDestra: bool(cp.aDestra, false),
      allineamento: oneOf(cp.allineamento, ["centro", "sinistra"] as const, "centro"),
      corpo: num(cp, "corpo", what, 8, 48, 18),
      maiuscolo: bool(cp.maiuscolo, false),
      numero: bool(cp.numero, true),
      spazioSopra: num(cp, "spazioSopra", what, 0, 150, 30),
    },
    intestazioni: oneOf(obj.intestazioni, ["nessuna", "titoli"] as const, "nessuna"),
    numerazione: oneOf(obj.numerazione, ["centro", "esterno", "nessuna"] as const, "centro"),
    frontespizio: bool(obj.frontespizio, true),
    indice: bool(obj.indice, false),
    separatoreScena: obj.separatoreScena === undefined ? "* * *" : sep,
    filigrana: bool(obj.filigrana, false),
  };
}

export function parsePdfTemplate(source: string, id: string): PdfTemplate {
  return { ...normalizePdfTemplate(parseYaml(source, `template-pdf/${id}.yaml`), `template-pdf/${id}.yaml`), id };
}

export function serializePdfTemplate(t: PdfTemplate): string {
  const { id: _id, ...rest } = t;
  void _id;
  const pagina = t.pagina.formato === "personalizzato" ? t.pagina : { formato: t.pagina.formato };
  return YAML.stringify({ ...rest, pagina });
}

const base = (id: string, nome: string, patch: Partial<Record<string, unknown>>): PdfTemplate =>
  normalizePdfTemplate({ id, nome, ...patch });

/** Template predefiniti (sola lettura: si duplicano per personalizzarli). */
export const BUILTIN_PDF_TEMPLATES: readonly PdfTemplate[] = [
  base("romanzo-14x21", "Romanzo 14×21", {
    pagina: { formato: "14x21" },
    margini: { alto: 18, basso: 20, interno: 20, esterno: 15 },
    testo: { font: "Literata", corpo: 10.5, interlinea: 1.4, rientro: 5, giustificato: true },
    capitoli: { aDestra: true, allineamento: "centro", corpo: 18, numero: true, spazioSopra: 35 },
    intestazioni: "titoli",
    numerazione: "esterno",
    frontespizio: true,
    indice: true,
  }),
  base("manoscritto-a4", "Manoscritto A4 (per editori e concorsi)", {
    pagina: { formato: "A4" },
    margini: { alto: 25, basso: 25, interno: 25, esterno: 25 },
    testo: { font: "Roboto", corpo: 12, interlinea: 2, rientro: 8, giustificato: false },
    capitoli: { aDestra: false, allineamento: "sinistra", corpo: 14, numero: true, spazioSopra: 20 },
    intestazioni: "titoli",
    numerazione: "centro",
    frontespizio: true,
    indice: false,
  }),
  base("tascabile-a5", "Tascabile A5", {
    pagina: { formato: "A5" },
    margini: { alto: 16, basso: 18, interno: 18, esterno: 14 },
    testo: { font: "EB Garamond", corpo: 11.5, interlinea: 1.3, rientro: 5, giustificato: true },
    capitoli: { aDestra: false, allineamento: "centro", corpo: 20, maiuscolo: true, numero: false, spazioSopra: 30 },
    intestazioni: "titoli",
    numerazione: "esterno",
    frontespizio: true,
    indice: false,
    separatoreScena: "⁂",
  }),
];

export function builtinPdfTemplate(id: string): PdfTemplate | undefined {
  return BUILTIN_PDF_TEMPLATES.find((t) => t.id === id);
}

export const MM = 72 / 25.4;
