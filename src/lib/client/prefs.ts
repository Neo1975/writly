"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferenze di questo browser (controlli di stile, concentrazione, obiettivo
 * della sessione) e diario della scrittura. Restano sul dispositivo: non sono
 * dati del progetto e non vanno su GitHub.
 *
 *   writly:stile                 { ripetizioni, frasiLunghe, avverbi }
 *   writly:concentrazione        true | false
 *   writly:obiettivo-sessione    numero di parole (0 = nessuno)
 *   writly:diario:<owner>/<repo> { "AAAA-MM-GG": { "<capitolo>": [parole a inizio giornata, parole adesso] } }
 */

const EVENT = "writly-pref";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Archiviazione piena o bloccata: la preferenza vale solo finché la pagina resta aperta.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Preferenza JSON letta da localStorage; sul server (e se manca) vale `fallback`. */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  let value = fallback;
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as T;
      value = typeof fallback === "object" && fallback !== null ? { ...fallback, ...parsed } : parsed;
    } catch {
      value = fallback;
    }
  }
  const set = useCallback((v: T) => write(key, JSON.stringify(v)), [key]);
  return [value, set];
}

// ——— Diario della scrittura ———

/** Per ogni giorno e capitolo: parole all'inizio della giornata e all'ultima misura. */
export type WritingDiary = Record<string, Record<string, [number, number]>>;

const KEEP_DAYS = 400;

const diaryKey = (owner: string, repo: string) => `writly:diario:${owner}/${repo}`;

export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDiary(raw: string | null): WritingDiary {
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as WritingDiary) : {};
  } catch {
    return {};
  }
}

/** Registra le parole del capitolo adesso: la prima misura del giorno fa da base. */
export function recordWriting(owner: string, repo: string, chapter: string, words: number) {
  const diary = parseDiary(read(diaryKey(owner, repo)));
  const day = today();
  const entry = (diary[day] ??= {});
  const prev = entry[chapter];
  if (prev && prev[1] === words) return;
  entry[chapter] = [prev ? prev[0] : words, words];
  const days = Object.keys(diary).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete diary[old];
  write(diaryKey(owner, repo), JSON.stringify(diary));
}

/** Parole nette scritte ogni giorno (somma sui capitoli; negativa se si è tagliato più di quanto scritto). */
export function dailyTotals(diary: WritingDiary): { day: string; words: number }[] {
  return Object.entries(diary)
    .map(([day, chapters]) => ({ day, words: Object.values(chapters).reduce((sum, [a, b]) => sum + (b - a), 0) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function useDiary(owner: string, repo: string): WritingDiary {
  const raw = useSyncExternalStore(subscribe, () => read(diaryKey(owner, repo)), () => null);
  return parseDiary(raw);
}
