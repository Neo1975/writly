import YAML from "yaml";
import { FormatError, joinFrontMatter, parseYaml, splitFrontMatter } from "./format";
import { LONG, compact, idList, idOrNull, isId, list, record, requiredText, text, textList } from "./normalize";

/**
 * Personaggi, relazioni e voci del mondo.
 *
 *   personaggi/<slug>.md          front-matter (scheda) + biografia in Markdown
 *   relazioni.yaml                archi orientati tra personaggi
 *   mondo/categorie.yaml          categorie e campi personalizzati
 *   mondo/<categoria>/<slug>.md   front-matter (voce) + descrizione in Markdown
 *
 * I riferimenti usano gli id (stabili), non i nomi dei file.
 */

export interface Character {
  id: string;
  nome: string;
  alias: string[];
  ruolo: string;
  eta: string;
  fisico: { aspetto: string; tratti: string; abbigliamento: string };
  morale: { valori: string; paure: string; desideri: string; difetto: string; segreto: string };
  comportamento: { parlare: string; tic: string; abitudini: string; stress: string };
  arco: { partenza: string; arrivo: string };
  /** Come il personaggio legge il mondo e reagisce: testa, cuore o pancia. */
  polarizzazione: Polarization;
  biografia: string;
}

/**
 * Polarizzazione testa / cuore / pancia: il centro con cui il personaggio
 * percepisce e reagisce per primo, e quello che trascura (spesso la chiave
 * del suo arco).
 */
export const CENTERS = ["testa", "cuore", "pancia"] as const;
export type Center = (typeof CENTERS)[number];

export interface Polarization {
  dominante: Center | null;
  trascurato: Center | null;
  /** Come si vede nel comportamento («decide prima di sentire…»). */
  come: string;
}

export const CENTER_INFO: Record<Center, { label: string; descrizione: string }> = {
  testa: { label: "Testa", descrizione: "analizza, prevede, si protegge capendo; sotto pressione esita o razionalizza" },
  cuore: { label: "Cuore", descrizione: "passa tutto per le relazioni e per come appare agli altri; sotto pressione cerca approvazione o si ferisce" },
  pancia: { label: "Pancia", descrizione: "sente e agisce subito, difende il proprio spazio; sotto pressione reagisce prima di pensare" },
};

/** Riassunto leggibile («Testa · trascura la pancia · decide prima di sentire»); vuoto se non indicata. */
export function describePolarization(p: Polarization): string {
  return [p.dominante ? CENTER_INFO[p.dominante].label : "", p.trascurato ? `trascura ${p.trascurato === "testa" ? "la testa" : p.trascurato === "cuore" ? "il cuore" : "la pancia"}` : "", p.come]
    .filter(Boolean)
    .join(" · ");
}

export const CHARACTER_GROUPS = {
  fisico: { label: "Fisico", fields: { aspetto: "Aspetto", tratti: "Tratti distintivi", abbigliamento: "Abbigliamento" } },
  morale: {
    label: "Morale",
    fields: { valori: "Valori", paure: "Paure", desideri: "Desideri", difetto: "Difetto", segreto: "Segreto" },
  },
  comportamento: {
    label: "Comportamento",
    fields: { parlare: "Modo di parlare", tic: "Tic", abitudini: "Abitudini", stress: "Sotto stress" },
  },
  arco: { label: "Arco", fields: { partenza: "Punto di partenza", arrivo: "Punto d'arrivo" } },
} as const;

type GroupKey = keyof typeof CHARACTER_GROUPS;

/** Il testo della scheda da cui il controllo di continuità legge gli attributi fisici. */
export function characterAttributesText(c: Character): string {
  return [c.fisico.aspetto, c.fisico.tratti].filter(Boolean).join(". ");
}

export interface Relation {
  id: string;
  da: string;
  a: string;
  tipo: string;
  nota: string;
  /** Opere (slug) in cui vale; vuoto = sempre. */
  libri: string[];
}

export const RELATION_SUGGESTIONS = [
  "padre di",
  "madre di",
  "figlio di",
  "figlia di",
  "fratello di",
  "sorella di",
  "sposato con",
  "ama",
  "amico di",
  "alleato di",
  "rivale di",
  "nemico di",
  "mentore di",
  "lavora per",
  "tradisce",
];

export interface WorldField {
  id: string;
  nome: string;
}

export interface WorldCategory {
  id: string;
  nome: string;
  campi: WorldField[];
}

export interface WorldLink {
  /** Id di un personaggio o di un'altra voce del mondo. */
  id: string;
  nota: string;
}

export interface WorldEntry {
  id: string;
  nome: string;
  alias: string[];
  /** Voce che la contiene (regno → città → quartiere). */
  genitore: string | null;
  campi: Record<string, string>;
  collegamenti: WorldLink[];
  descrizione: string;
}

export const DEFAULT_CATEGORIES: WorldCategory[] = [
  {
    id: "luoghi",
    nome: "Luoghi",
    campi: [
      { id: "clima", nome: "Clima" },
      { id: "popolazione", nome: "Popolazione" },
      { id: "governo", nome: "Governo" },
    ],
  },
  {
    id: "culture-e-fazioni",
    nome: "Culture e fazioni",
    campi: [
      { id: "capo", nome: "Capo" },
      { id: "obiettivi", nome: "Obiettivi" },
      { id: "alleati", nome: "Alleati" },
    ],
  },
  {
    id: "sistemi",
    nome: "Sistemi e regole",
    campi: [
      { id: "ambito", nome: "Ambito (magia, tecnologia, economia…)" },
      { id: "limiti", nome: "Limiti e costi" },
    ],
  },
  { id: "oggetti", nome: "Oggetti e artefatti", campi: [{ id: "proprietario", nome: "Proprietario" }, { id: "poteri", nome: "Poteri" }] },
  { id: "storia", nome: "Storia del mondo", campi: [{ id: "epoca", nome: "Epoca" }] },
  { id: "lingue", nome: "Lingue", campi: [{ id: "parlanti", nome: "Parlata da" }, { id: "suoni", nome: "Suoni e regole" }] },
];

const FIELD_MAX = 4000;

export function emptyCharacter(id: string, nome: string): Character {
  return {
    id,
    nome,
    alias: [],
    ruolo: "",
    eta: "",
    fisico: { aspetto: "", tratti: "", abbigliamento: "" },
    morale: { valori: "", paure: "", desideri: "", difetto: "", segreto: "" },
    comportamento: { parlare: "", tic: "", abitudini: "", stress: "" },
    arco: { partenza: "", arrivo: "" },
    polarizzazione: { dominante: null, trascurato: null, come: "" },
    biografia: "",
  };
}

function group<K extends GroupKey>(obj: Record<string, unknown>, key: K, what: string): Character[K] {
  const g = record(obj[key], `${what}, ${key}`);
  const out: Record<string, string> = {};
  for (const f of Object.keys(CHARACTER_GROUPS[key].fields)) out[f] = text(g, f, `${what}, ${key}`, FIELD_MAX);
  return out as Character[K];
}

export function normalizeCharacter(value: unknown, what = "personaggio"): Character {
  const obj = record(value, what);
  if (!isId(obj.id)) throw new FormatError(`${what}: «id» mancante o non valido`);
  return {
    id: obj.id,
    nome: requiredText(obj, "nome", what),
    alias: textList(obj.alias, `${what}, alias`),
    ruolo: text(obj, "ruolo", what),
    eta: text(obj, "eta", what),
    fisico: group(obj, "fisico", what),
    morale: group(obj, "morale", what),
    comportamento: group(obj, "comportamento", what),
    arco: group(obj, "arco", what),
    polarizzazione: polarization(obj, what),
    biografia: text(obj, "biografia", what, LONG * 10),
  };
}

function polarization(obj: Record<string, unknown>, what: string): Polarization {
  const p = record(obj.polarizzazione, `${what}, polarizzazione`);
  const center = (v: unknown): Center | null => (CENTERS.includes(v as Center) ? (v as Center) : null);
  const dominante = center(p.dominante);
  const trascurato = center(p.trascurato);
  // Il centro trascurato non può essere quello dominante.
  return { dominante, trascurato: trascurato && trascurato !== dominante ? trascurato : null, come: text(p, "come", `${what}, polarizzazione`, FIELD_MAX) };
}

export function parseCharacter(textValue: string, path: string): Character {
  const { data, body } = splitFrontMatter(textValue, path);
  if (!data) throw new FormatError(`${path}: manca il front-matter della scheda`);
  return normalizeCharacter({ ...data, biografia: body.trimEnd() }, path);
}

export function serializeCharacter(c: Character): string {
  const groups = Object.fromEntries(
    (Object.keys(CHARACTER_GROUPS) as GroupKey[]).map((k) => [k, compact(c[k] as Record<string, unknown>)]),
  );
  return joinFrontMatter(
    compact({ id: c.id, nome: c.nome, alias: c.alias, ruolo: c.ruolo, eta: c.eta, ...groups, polarizzazione: compact({ ...c.polarizzazione }) }),
    c.biografia,
  );
}

export function normalizeRelations(value: unknown, what = "relazioni.yaml"): Relation[] {
  const ids = new Set<string>();
  return list(value, what, 5000).map((r, i) => {
    const label = `${what}, relazione ${i + 1}`;
    const obj = record(r, label);
    if (!isId(obj.id) || ids.has(obj.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    ids.add(obj.id);
    const da = idOrNull(obj, "da", label);
    const a = idOrNull(obj, "a", label);
    if (!da || !a) throw new FormatError(`${label}: servono «da» e «a»`);
    return { id: obj.id, da, a, tipo: requiredText(obj, "tipo", label), nota: text(obj, "nota", label, FIELD_MAX), libri: idList(obj.libri, `${label}, libri`) };
  });
}

export function parseRelations(textValue: string): Relation[] {
  const obj = parseYaml(textValue, "relazioni.yaml");
  return normalizeRelations(obj.relazioni);
}

export function serializeRelations(items: Relation[]): string {
  return YAML.stringify({ relazioni: items.map((r) => compact({ ...r })) });
}

export function normalizeCategories(value: unknown, what = "mondo/categorie.yaml"): WorldCategory[] {
  const ids = new Set<string>();
  return list(value, what, 100).map((c, i) => {
    const label = `${what}, categoria ${i + 1}`;
    const obj = record(c, label);
    if (!isId(obj.id) || ids.has(obj.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    if (obj.id === "mappe") throw new FormatError(`${label}: «mappe» è riservato alle mappe del mondo`);
    ids.add(obj.id);
    const fieldIds = new Set<string>();
    return {
      id: obj.id,
      nome: requiredText(obj, "nome", label),
      campi: list(obj.campi, `${label}, campi`, 50).map((f, j) => {
        const field = record(f, `${label}, campo ${j + 1}`);
        if (!isId(field.id) || fieldIds.has(field.id)) throw new FormatError(`${label}, campo ${j + 1}: «id» non valido o ripetuto`);
        fieldIds.add(field.id);
        return { id: field.id, nome: requiredText(field, "nome", `${label}, campo ${j + 1}`) };
      }),
    };
  });
}

export function parseCategories(textValue: string): WorldCategory[] {
  return normalizeCategories(parseYaml(textValue, "mondo/categorie.yaml").categorie);
}

export function serializeCategories(items: WorldCategory[]): string {
  return YAML.stringify({ categorie: items });
}

export function normalizeWorldEntry(value: unknown, what = "voce del mondo"): WorldEntry {
  const obj = record(value, what);
  if (!isId(obj.id)) throw new FormatError(`${what}: «id» mancante o non valido`);
  const rawFields = record(obj.campi, `${what}, campi`);
  const campi: Record<string, string> = {};
  for (const key of Object.keys(rawFields)) {
    if (!isId(key)) throw new FormatError(`${what}: campo «${key}» non valido`);
    const v = text(rawFields, key, `${what}, campi`, FIELD_MAX);
    if (v) campi[key] = v;
  }
  const seen = new Set<string>();
  const collegamenti: WorldLink[] = [];
  for (const [i, l] of list(obj.collegamenti, `${what}, collegamenti`, 200).entries()) {
    const link = record(l, `${what}, collegamento ${i + 1}`);
    const id = idOrNull(link, "id", `${what}, collegamento ${i + 1}`);
    if (!id || seen.has(id) || id === obj.id) continue;
    seen.add(id);
    collegamenti.push({ id, nota: text(link, "nota", `${what}, collegamento ${i + 1}`) });
  }
  const genitore = idOrNull(obj, "genitore", what);
  return {
    id: obj.id,
    nome: requiredText(obj, "nome", what),
    alias: textList(obj.alias, `${what}, alias`),
    genitore: genitore === obj.id ? null : genitore,
    campi,
    collegamenti,
    descrizione: text(obj, "descrizione", what, LONG * 10),
  };
}

export function parseWorldEntry(textValue: string, path: string): WorldEntry {
  const { data, body } = splitFrontMatter(textValue, path);
  if (!data) throw new FormatError(`${path}: manca il front-matter della voce`);
  return normalizeWorldEntry({ ...data, descrizione: body.trimEnd() }, path);
}

export function serializeWorldEntry(e: WorldEntry): string {
  return joinFrontMatter(
    compact({ id: e.id, nome: e.nome, alias: e.alias, genitore: e.genitore, campi: e.campi, collegamenti: e.collegamenti.map((l) => compact({ ...l })) }),
    e.descrizione,
  );
}

/** Antenati di una voce, dal più vicino; si ferma sui cicli. */
export function ancestors(entries: Map<string, WorldEntry>, id: string): WorldEntry[] {
  const out: WorldEntry[] = [];
  const seen = new Set([id]);
  let cur = entries.get(id)?.genitore ?? null;
  while (cur && !seen.has(cur)) {
    const e = entries.get(cur);
    if (!e) break;
    out.push(e);
    seen.add(cur);
    cur = e.genitore;
  }
  return out;
}
