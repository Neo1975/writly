export interface WordToken {
  /** Parola da verificare (apostrofo tipografico normalizzato in '). */
  word: string;
  /** Offset nel testo originale, estremi [start, end). */
  start: number;
  end: number;
}

// Una "parola" con eventuali elisioni: dell'acqua, un'altra, quell’uomo.
const RUN = /[\p{L}]+(?:['’][\p{L}]+)*['’]?/gu;

/**
 * Spezza il testo nelle unità da sottoporre al controllo ortografico.
 * Le elisioni restano intere ("dell'acqua", "c'è"): il dizionario Hunspell
 * italiano le riconosce così, e in questo modo segnala anche "un'altro".
 */
export function tokenizeForSpellcheck(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const m of text.matchAll(RUN)) {
    const start = m.index ?? 0;
    tokens.push({ word: m[0].replace(/’/g, "'"), start, end: start + m[0].length });
  }
  return tokens;
}

/** Parole da non segnalare mai: sigle e numeri romani, cioè parole di 2+ lettere tutte maiuscole. */
export function shouldSkipWord(word: string): boolean {
  const bare = word.replace(/'/g, "");
  return bare.length >= 2 && bare === bare.toUpperCase() && /\p{Lu}/u.test(bare);
}
