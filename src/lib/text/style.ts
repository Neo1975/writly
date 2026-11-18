/**
 * Controlli di stile locali, euristici e mai bloccanti: ripetizioni ravvicinate,
 * frasi molto lunghe, avverbi in -mente, parole più usate nel capitolo.
 *
 * Lavorano sul testo semplice del capitolo (blocchi separati da "\n") e
 * restituiscono intervalli di caratteri, così l'editor può sottolinearli.
 */

export type StyleKind = "ripetizione" | "frase-lunga" | "avverbio";

export interface StyleIssue {
  kind: StyleKind;
  start: number;
  end: number;
  note: string;
}

export interface StyleOptions {
  ripetizioni: boolean;
  frasiLunghe: boolean;
  avverbi: boolean;
  /** Distanza massima, in parole, perché una ripetizione sia «ravvicinata». */
  finestra?: number;
  /** Oltre questo numero di parole una frase è segnalata come lunga. */
  maxParole?: number;
  /** Parole da non segnalare mai come ripetizioni (nomi propri, termini del glossario). */
  ignora?: Iterable<string>;
}

export const STYLE_DEFAULTS = { finestra: 30, maxParole: 40 } as const;

/** Parole funzionali e verbi ausiliari: ripeterle è normale. */
const STOPWORDS = new Set(
  (
    "della delle dello degli dell nella nelle nello negli nell alla alle allo agli dalla dalle dallo dagli dall sulla sulle sullo sugli sull " +
    "come anche quando perché perche però pero questo questa questi queste quello quella quelli quelle quel " +
    "sono essere stato stata stati state era erano ero eri fosse fossero sarà sara sarebbe siamo siete " +
    "avere aveva avevano avevo avevi abbiamo hanno avesse avrebbe avuto ebbe " +
    "fare fece fatto faceva stava stavano stavo stare " +
    "ancora dove mentre tutto tutta tutti tutte così cosi molto molta molti molte senza sempre dopo prima verso " +
    "contro fino oltre loro suoi sue nostro nostra vostro vostra cosa qualche ogni altro altra altri altre stesso stessa " +
    "solo sola ormai invece quindi allora ecco proprio appena quasi forse niente nulla nessuno nessuna " +
    "essa esso egli dentro fuori sopra sotto disse dice chiese rispose poco poca pochi poche tanto tanta tanti tante " +
    "qualcosa qualcuno neanche nemmeno neppure oppure ovvero cioè cioe perciò percio"
  ).split(/\s+/),
);

/** Parole che finiscono in -mente ma non sono avverbi. */
const NOT_ADVERBS = new Set(["mente", "demente", "clemente", "veemente", "semente", "fremente", "gemente", "dormente"]);

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export interface WordToken {
  /** Forma originale (dopo l'eventuale elisione: «dell'acqua» → «acqua»). */
  word: string;
  start: number;
  end: number;
}

/** Parole con posizione; per le elisioni si tiene la parte dopo l'apostrofo. */
export function words(text: string): WordToken[] {
  const out: WordToken[] = [];
  for (const m of text.matchAll(WORD)) {
    const raw = m[0];
    const cut = Math.max(raw.lastIndexOf("'"), raw.lastIndexOf("’"));
    out.push({ word: raw.slice(cut + 1), start: m.index + cut + 1, end: m.index + raw.length });
  }
  return out;
}

/** Radice grossolana: minuscolo, senza la vocale finale (case/casa, rossi/rosso). */
export function stem(word: string): string {
  const w = word.toLowerCase();
  return w.length > 4 ? w.replace(/[aeiouàèéìòù]$/u, "") : w;
}

function significant(word: string, ignore: Set<string>): boolean {
  const w = word.toLowerCase();
  return w.length >= 4 && !/^\p{N}+$/u.test(w) && !STOPWORDS.has(w) && !ignore.has(w);
}

export interface Sentence {
  start: number;
  end: number;
  words: number;
}

/** Frasi: finiscono con . ! ? … (anche seguiti da virgolette o parentesi) o a fine blocco. */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?…\n]+(?:[.!?…]+["»”’)\]]*|(?=\n)|$)/gu;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) continue;
    const n = body.match(WORD)?.length ?? 0;
    if (n === 0) continue;
    out.push({ start: m.index + lead, end: m.index + lead + body.length, words: n });
  }
  return out;
}

export function analyzeStyle(text: string, opts: StyleOptions): StyleIssue[] {
  const finestra = opts.finestra ?? STYLE_DEFAULTS.finestra;
  const maxParole = opts.maxParole ?? STYLE_DEFAULTS.maxParole;
  const ignore = new Set([...(opts.ignora ?? [])].map((w) => w.toLowerCase()));
  const issues: StyleIssue[] = [];

  if (opts.frasiLunghe) {
    for (const s of sentences(text)) {
      if (s.words > maxParole) issues.push({ kind: "frase-lunga", start: s.start, end: s.end, note: `Frase di ${s.words} parole` });
    }
  }

  const tokens = opts.ripetizioni || opts.avverbi ? words(text) : [];

  if (opts.avverbi) {
    for (const t of tokens) {
      const w = t.word.toLowerCase();
      if (w.length >= 7 && w.endsWith("mente") && !NOT_ADVERBS.has(w)) issues.push({ kind: "avverbio", start: t.start, end: t.end, note: "Avverbio in -mente" });
    }
  }

  if (opts.ripetizioni) {
    const last = new Map<string, number>(); // radice → indice dell'ultima occorrenza
    const marked = new Set<number>();
    tokens.forEach((t, i) => {
      if (!significant(t.word, ignore)) return;
      const key = stem(t.word);
      const prev = last.get(key);
      if (prev !== undefined && i - prev <= finestra) {
        for (const j of [prev, i]) {
          if (marked.has(j)) continue;
          marked.add(j);
          issues.push({ kind: "ripetizione", start: tokens[j].start, end: tokens[j].end, note: `«${tokens[j].word}» ripetuta a poca distanza` });
        }
      }
      last.set(key, i);
    });
  }

  return issues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export interface WordFrequency {
  word: string;
  count: number;
  /** Occorrenze ogni mille parole. */
  perMille: number;
}

/** Le parole significative più frequenti (raggruppate per radice, mostrate nella forma più comune). */
export function overusedWords(text: string, { top = 8, min = 4, ignora = [] as Iterable<string> } = {}): WordFrequency[] {
  const ignore = new Set([...ignora].map((w) => w.toLowerCase()));
  const tokens = words(text);
  const groups = new Map<string, Map<string, number>>();
  for (const t of tokens) {
    if (!significant(t.word, ignore)) continue;
    const key = stem(t.word);
    const forms = groups.get(key) ?? new Map<string, number>();
    const form = t.word.toLowerCase();
    forms.set(form, (forms.get(form) ?? 0) + 1);
    groups.set(key, forms);
  }
  const total = Math.max(tokens.length, 1);
  return [...groups.values()]
    .map((forms) => {
      const count = [...forms.values()].reduce((a, b) => a + b, 0);
      const word = [...forms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { word, count, perMille: Math.round((count / total) * 10000) / 10 };
    })
    .filter((f) => f.count >= min)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "it"))
    .slice(0, top);
}
