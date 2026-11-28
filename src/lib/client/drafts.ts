import { del, get, keys, set } from "idb-keyval";
import type { ChapterStatus } from "@/lib/project/format";

/**
 * Bozza locale di un capitolo, salvata in IndexedDB a ogni modifica.
 * `baseSha` è la versione GitHub da cui la bozza è partita: se al ritorno il
 * file su GitHub è cambiato, l'autore sceglie quale tenere (nessuna sovrascrittura silenziosa).
 */
export interface Draft {
  body: string;
  stato: ChapterStatus;
  /** Giorno di uscita, solo con stato «pubblicato». */
  pubblicato?: string;
  baseSha: string;
  updatedAt: number;
}

const DRAFT_PREFIX = "writly:bozza:";

function key(owner: string, repo: string, path: string) {
  return `${DRAFT_PREFIX}${owner}/${repo}/${path}`;
}

/** Evento della finestra: le bozze sono cambiate (l'indicatore delle modifiche non salvate si aggiorna). */
export const DRAFTS_EVENT = "writly:bozze";
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAFTS_EVENT));
}

/** Una bozza con il capitolo a cui appartiene. `variant` è «variante/<nome>» o null per la versione principale. */
export interface DraftEntry {
  owner: string;
  repo: string;
  path: string;
  variant: string | null;
  draft: Draft;
}

/** Chiave di una bozza → progetto, capitolo e variante (null se non è la bozza di un capitolo). */
export function parseDraftKey(k: string): Omit<DraftEntry, "draft"> | null {
  if (!k.startsWith(DRAFT_PREFIX)) return null;
  const m = /^([^/]+)\/([^/]+)\/(opere\/[^/@]+\/capitoli\/[^/@]+\.md)(?:@(.+))?$/.exec(k.slice(DRAFT_PREFIX.length));
  return m ? { owner: m[1], repo: m[2], path: m[3], variant: m[4] ?? null } : null;
}

function readEmergency(k: string): Draft | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function dropEmergency(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    // niente da fare
  }
}

// IndexedDB può mancare (navigazione privata, permessi): l'editor funziona lo stesso.
export async function loadDraft(owner: string, repo: string, path: string): Promise<Draft | null> {
  const k = key(owner, repo, path);
  let stored: Draft | null = null;
  try {
    stored = ((await get(k)) as Draft | undefined) ?? null;
  } catch {
    stored = null;
  }
  const emergency = readEmergency(k);
  if (emergency && (!stored || emergency.updatedAt > stored.updatedAt)) return emergency;
  return stored;
}

export async function saveDraft(owner: string, repo: string, path: string, draft: Draft): Promise<boolean> {
  const k = key(owner, repo, path);
  try {
    await set(k, draft);
    dropEmergency(k);
    notify();
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia sincrona (localStorage) per quando la pagina si sta chiudendo:
 * una scrittura IndexedDB avviata in quel momento può non arrivare in fondo.
 */
export function saveDraftNow(owner: string, repo: string, path: string, draft: Draft): boolean {
  try {
    localStorage.setItem(key(owner, repo, path), JSON.stringify(draft));
    notify();
    return true;
  } catch {
    return false;
  }
}

export async function clearDraft(owner: string, repo: string, path: string): Promise<void> {
  const k = key(owner, repo, path);
  dropEmergency(k);
  try {
    await del(k);
  } catch {
    // niente da fare
  }
  notify();
}

/** Tutte le bozze di capitolo di questo dispositivo, dalla più recente (anche le copie di emergenza in localStorage). */
export async function listDrafts(): Promise<DraftEntry[]> {
  const found = new Map<string, DraftEntry>();
  const add = (k: string, draft: Draft | undefined) => {
    const id = parseDraftKey(k);
    if (!id || !draft || typeof draft.body !== "string") return;
    const prev = found.get(k);
    if (!prev || draft.updatedAt > prev.draft.updatedAt) found.set(k, { ...id, draft });
  };
  try {
    for (const k of await keys()) if (typeof k === "string" && k.startsWith(DRAFT_PREFIX)) add(k, (await get(k)) as Draft | undefined);
  } catch {
    // IndexedDB non disponibile: restano le copie di emergenza
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) add(k, readEmergency(k) ?? undefined);
    }
  } catch {
    // niente da fare
  }
  return [...found.values()].sort((a, b) => b.draft.updatedAt - a.draft.updatedAt);
}

/**
 * Copia locale di un documento strutturato (es. struttura e scene di un'opera)
 * non ancora salvato su GitHub. Stesse regole delle bozze dei capitoli.
 */
export interface LocalCopy<T> {
  data: T;
  baseSha: string | null;
  updatedAt: number;
}

function docKey(kind: string, owner: string, repo: string, id: string) {
  return `writly:${kind}:${owner}/${repo}/${id}`;
}

export async function loadLocalCopy<T>(kind: string, owner: string, repo: string, id: string): Promise<LocalCopy<T> | null> {
  try {
    return ((await get(docKey(kind, owner, repo, id))) as LocalCopy<T> | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveLocalCopy<T>(kind: string, owner: string, repo: string, id: string, copy: LocalCopy<T>): Promise<boolean> {
  try {
    await set(docKey(kind, owner, repo, id), copy);
    return true;
  } catch {
    return false;
  }
}

export async function clearLocalCopy(kind: string, owner: string, repo: string, id: string): Promise<void> {
  try {
    await del(docKey(kind, owner, repo, id));
  } catch {
    // niente da fare
  }
}
