export interface TextStats {
  parole: number;
  /** Battute con spazi: caratteri visibili più spazi, senza gli a capo (come i conteggi editoriali). */
  battute: number;
  battuteSenzaSpazi: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

export function textStats(text: string): TextStats {
  const noBreaks = text.replace(/\r?\n/g, "");
  const chars = Array.from(noBreaks);
  return {
    parole: countWords(text),
    battute: chars.length,
    battuteSenzaSpazi: chars.filter((c) => !/\s/u.test(c)).length,
  };
}

const NUMBER = new Intl.NumberFormat("it-IT");

export function formatCount(n: number): string {
  return NUMBER.format(n);
}

/**
 * Testo semplice approssimato dal Markdown dei capitoli (per le statistiche
 * calcolate lato server, senza editor): toglie marcatori di titolo, citazione,
 * enfasi, separatori di scena ed escape.
 */
export function markdownToPlain(md: string): string {
  return md
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
    .map((line) => line.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)+/, ""))
    .join("\n")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
    .replace(/\n{2,}/g, "\n");
}

const SCENE_BREAK = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;

/**
 * Le parti di un capitolo separate dai cambi di scena (righe «---», «***» o
 * «___», come le scrive il pulsante «Cambio scena»). Le parti vuote, per
 * esempio un separatore all'inizio, non contano.
 */
export function splitScenes(markdown: string): string[] {
  const parts: string[][] = [[]];
  for (const line of markdown.split(/\r?\n/)) {
    if (SCENE_BREAK.test(line)) parts.push([]);
    else parts[parts.length - 1].push(line);
  }
  return parts.map((p) => p.join("\n").trim()).filter((p) => countWords(markdownToPlain(p)) > 0);
}
