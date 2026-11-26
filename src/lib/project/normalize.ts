import { FormatError } from "./format";

/**
 * Lettura tollerante dei dati strutturati (YAML scritto a mano o JSON dal client):
 * campi mancanti diventano vuoti, valori del tipo sbagliato sono un errore,
 * le lunghezze sono limitate. Così lo stesso codice valida i file del repository
 * e le richieste alle API.
 */

export const SHORT = 200;
export const LONG = 20_000;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 60 && ID.test(value);
}

export function record(value: unknown, what: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new FormatError(`${what}: atteso un oggetto`);
  return value as Record<string, unknown>;
}

export function text(obj: Record<string, unknown>, key: string, what: string, max = SHORT): string {
  const v = obj[key];
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") throw new FormatError(`${what}: «${key}» deve essere un testo`);
  if (v.length > max) throw new FormatError(`${what}: «${key}» supera ${max} caratteri`);
  return v.trim();
}

export function requiredText(obj: Record<string, unknown>, key: string, what: string, max = SHORT): string {
  const v = text(obj, key, what, max);
  if (!v) throw new FormatError(`${what}: «${key}» è obbligatorio`);
  return v;
}

export function list(value: unknown, what: string, maxItems = 2000): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new FormatError(`${what}: atteso un elenco`);
  if (value.length > maxItems) throw new FormatError(`${what}: troppi elementi (massimo ${maxItems})`);
  return value;
}

export function textList(value: unknown, what: string, max = SHORT): string[] {
  const out: string[] = [];
  for (const item of list(value, what, 200)) {
    if (typeof item !== "string") throw new FormatError(`${what}: atteso un elenco di testi`);
    const t = item.trim();
    if (t.length > max) throw new FormatError(`${what}: voce oltre ${max} caratteri`);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function idOrNull(obj: Record<string, unknown>, key: string, what: string): string | null {
  const v = obj[key];
  if (v === undefined || v === null || v === "") return null;
  if (!isId(v)) throw new FormatError(`${what}: «${key}» non è un identificativo valido`);
  return v;
}

export function idList(value: unknown, what: string): string[] {
  const out: string[] = [];
  for (const item of list(value, what, 500)) {
    if (!isId(item)) throw new FormatError(`${what}: identificativo non valido`);
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Toglie le chiavi con valori vuoti: i file YAML restano corti e i diff leggibili. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
