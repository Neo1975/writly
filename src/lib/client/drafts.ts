import { del, get, set } from "idb-keyval";
import type { ChapterStatus } from "@/lib/project/format";

/**
 * Bozza locale di un capitolo, salvata in IndexedDB a ogni modifica.
 * `baseSha` è la versione GitHub da cui la bozza è partita: se al ritorno il
 * file su GitHub è cambiato, l'autore sceglie quale tenere (nessuna sovrascrittura silenziosa).
 */
export interface Draft {
  body: string;
  stato: ChapterStatus;
  baseSha: string;
  updatedAt: number;
}

function key(owner: string, repo: string, path: string) {
  return `writly:bozza:${owner}/${repo}/${path}`;
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
