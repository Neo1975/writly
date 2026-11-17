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
