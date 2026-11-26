import YAML from "yaml";
import { FormatError, parseYaml } from "./format";
import { compact, idList, idOrNull, isId, list, record, requiredText, text } from "./normalize";

/**
 * Mondo avanzato: regole, storia del mondo con calendario proprio, mappe.
 *
 *   mondo/regole.yaml              vincoli del mondo, collegati alle voci
 *   mondo/cronologia.yaml          calendario (ere, mesi) ed eventi datati
 *   mondo/mappe/<slug>.yaml        mappa: immagine + segnaposti sulle voci
 *   mondo/mappe/<slug>.<ext>       immagine della mappa (png, jpg, webp)
 */

const FIELD_MAX = 4000;

// ——— Regole del mondo ———

export interface WorldRule {
  id: string;
  testo: string;
  /** Voci del mondo a cui si applica: la regola compare come promemoria quando sono in scena. */
  voci: string[];
  note: string;
}

export function normalizeRules(value: unknown, what = "mondo/regole.yaml"): WorldRule[] {
  const ids = new Set<string>();
  return list(value, what, 2000).map((r, i) => {
    const label = `${what}, regola ${i + 1}`;
    const obj = record(r, label);
    if (!isId(obj.id) || ids.has(obj.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    ids.add(obj.id);
    return { id: obj.id, testo: requiredText(obj, "testo", label, FIELD_MAX), voci: idList(obj.voci, `${label}, voci`), note: text(obj, "note", label, FIELD_MAX) };
  });
}

export function parseRules(source: string): WorldRule[] {
  return normalizeRules(parseYaml(source, "mondo/regole.yaml").regole);
}

export function serializeRules(items: WorldRule[]): string {
  return YAML.stringify({ regole: items.map((r) => compact({ ...r })) });
}

/** Regole che riguardano almeno una delle voci indicate. */
export function rulesFor(rules: WorldRule[], entryIds: Iterable<string>): WorldRule[] {
  const set = new Set(entryIds);
  return rules.filter((r) => r.voci.some((v) => set.has(v)));
}

// ——— Storia del mondo ———

export interface Era {
  id: string;
  nome: string;
}

export interface Calendar {
  /** Nell'ordine cronologico. */
  ere: Era[];
  /** Nomi dei mesi, nell'ordine; vuoto = solo anni. */
  mesi: string[];
}

export interface WorldEvent {
  id: string;
  titolo: string;
  era: string | null;
  anno: number;
  /** 1 = primo mese del calendario. */
  mese: number | null;
  giorno: number | null;
  descrizione: string;
  voci: string[];
  personaggi: string[];
}

export interface Chronology {
  calendario: Calendar;
  eventi: WorldEvent[];
}

export const EMPTY_CHRONOLOGY: Chronology = { calendario: { ere: [], mesi: [] }, eventi: [] };

function int(obj: Record<string, unknown>, key: string, what: string, min: number, max: number): number | null {
  const v = obj[key];
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new FormatError(`${what}: «${key}» deve essere un numero intero tra ${min} e ${max}`);
  return n;
}

export function normalizeChronology(value: unknown, what = "mondo/cronologia.yaml"): Chronology {
  const obj = record(value, what);
  const cal = record(obj.calendario, `${what}, calendario`);
  const eraIds = new Set<string>();
  const ere = list(cal.ere, `${what}, ere`, 100).map((e, i) => {
    const label = `${what}, era ${i + 1}`;
    const era = record(e, label);
    if (!isId(era.id) || eraIds.has(era.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    eraIds.add(era.id);
    return { id: era.id, nome: requiredText(era, "nome", label) };
  });
  const mesi = list(cal.mesi, `${what}, mesi`, 100).map((m, i) => {
    if (typeof m !== "string" || !m.trim() || m.length > 100) throw new FormatError(`${what}: mese ${i + 1} non valido`);
    return m.trim();
  });
  const ids = new Set<string>();
  const eventi = list(obj.eventi, `${what}, eventi`, 5000).map((e, i) => {
    const label = `${what}, evento ${i + 1}`;
    const ev = record(e, label);
    if (!isId(ev.id) || ids.has(ev.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    ids.add(ev.id);
    const era = idOrNull(ev, "era", label);
    // Un mese oltre il calendario (mese tolto dopo) diventa «senza mese» invece di bloccare il file.
    const meseRaw = int(ev, "mese", label, 1, 1000);
    return {
      id: ev.id,
      titolo: requiredText(ev, "titolo", label),
      era: era && eraIds.has(era) ? era : null,
      anno: int(ev, "anno", label, -1_000_000, 1_000_000) ?? 0,
      mese: meseRaw && meseRaw <= mesi.length ? meseRaw : null,
      giorno: int(ev, "giorno", label, 1, 1000),
      descrizione: text(ev, "descrizione", label, FIELD_MAX),
      voci: idList(ev.voci, `${label}, voci`),
      personaggi: idList(ev.personaggi, `${label}, personaggi`),
    };
  });
  return { calendario: { ere, mesi }, eventi: sortEvents(eventi, ere) };
}

/** Ordine cronologico: era (nell'ordine del calendario; senza era prima), anno, mese, giorno. */
export function sortEvents(events: WorldEvent[], ere: Era[]): WorldEvent[] {
  const eraIndex = new Map(ere.map((e, i) => [e.id, i]));
  const key = (e: WorldEvent) => [e.era ? (eraIndex.get(e.era) ?? -1) : -1, e.anno, e.mese ?? 0, e.giorno ?? 0];
  return [...events].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

export function formatWorldDate(e: Pick<WorldEvent, "era" | "anno" | "mese" | "giorno">, cal: Calendar): string {
  const parts: string[] = [];
  if (e.giorno) parts.push(String(e.giorno));
  if (e.mese && cal.mesi[e.mese - 1]) parts.push(cal.mesi[e.mese - 1]);
  parts.push(`anno ${e.anno}`);
  const era = e.era ? cal.ere.find((x) => x.id === e.era)?.nome : null;
  return era ? `${parts.join(" ")}, ${era}` : parts.join(" ");
}

export function parseChronology(source: string): Chronology {
  return normalizeChronology(parseYaml(source, "mondo/cronologia.yaml"));
}

export function serializeChronology(c: Chronology): string {
  return YAML.stringify({
    calendario: c.calendario,
    eventi: c.eventi.map((e) => compact({ ...e })),
  });
}

// ——— Mappe ———

export const MAP_IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type MapImageExt = keyof typeof MAP_IMAGE_TYPES;
export const MAX_MAP_BYTES = 5_000_000;

export interface MapPin {
  id: string;
  voce: string;
  /** Posizione in percentuale sulla larghezza e sull'altezza dell'immagine. */
  x: number;
  y: number;
}

export interface WorldMap {
  nome: string;
  /** Percorso dell'immagine nel repository (stessa cartella della mappa). */
  immagine: string;
  segnaposti: MapPin[];
}

const MAP_IMAGE_PATH = /^mondo\/mappe\/[a-z0-9]+(?:-[a-z0-9]+)*\.(png|jpg|webp)$/;

export function isMapImagePath(path: string): boolean {
  return MAP_IMAGE_PATH.test(path);
}

export function normalizeMap(value: unknown, what = "mappa"): WorldMap {
  const obj = record(value, what);
  const immagine = text(obj, "immagine", what);
  if (immagine && !isMapImagePath(immagine)) throw new FormatError(`${what}: «immagine» non valida`);
  const ids = new Set<string>();
  const segnaposti = list(obj.segnaposti, `${what}, segnaposti`, 1000).map((p, i) => {
    const label = `${what}, segnaposto ${i + 1}`;
    const pin = record(p, label);
    if (!isId(pin.id) || ids.has(pin.id)) throw new FormatError(`${label}: «id» mancante, non valido o ripetuto`);
    ids.add(pin.id);
    const voce = idOrNull(pin, "voce", label);
    if (!voce) throw new FormatError(`${label}: manca la voce`);
    const coord = (k: "x" | "y") => {
      const n = Number(pin[k]);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new FormatError(`${label}: «${k}» deve essere tra 0 e 100`);
      return Math.round(n * 100) / 100;
    };
    return { id: pin.id, voce, x: coord("x"), y: coord("y") };
  });
  return { nome: requiredText(obj, "nome", what), immagine, segnaposti };
}

export function parseMap(source: string, path: string): WorldMap {
  return normalizeMap(parseYaml(source, path), path);
}

export function serializeMap(m: WorldMap): string {
  return YAML.stringify(compact({ nome: m.nome, immagine: m.immagine, segnaposti: m.segnaposti }));
}

/** Riconosce il formato dai primi byte (non ci fidiamo del nome né del tipo dichiarato). */
export function sniffImage(bytes: Uint8Array): MapImageExt | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}
