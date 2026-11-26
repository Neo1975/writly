import type { MentionMatcher } from "./mentions";
import { sentences, words } from "./style";

/**
 * Controllo di continuità euristico: se la scheda dice «occhi verdi» e una frase
 * che nomina il personaggio parla di «occhi azzurri», lo segnaliamo. Mai
 * bloccante: è un promemoria, l'autore decide.
 */

/** Parti del corpo controllate e i loro sinonimi nel testo. */
const PARTS: Record<string, string> = {
  occhi: "occhi",
  occhio: "occhi",
  iride: "occhi",
  iridi: "occhi",
  sguardo: "occhi",
  capelli: "capelli",
  chioma: "capelli",
  capigliatura: "capelli",
  barba: "barba",
  baffi: "barba",
  pelle: "pelle",
  carnagione: "pelle",
};

/** Aggettivi base → dimensione (due valori in conflitto devono essere della stessa dimensione). */
const ADJECTIVES: Record<string, "colore" | "forma" | "lunghezza"> = {
  azzurro: "colore",
  celeste: "colore",
  blu: "colore",
  verde: "colore",
  castano: "colore",
  marrone: "colore",
  nocciola: "colore",
  nero: "colore",
  grigio: "colore",
  bianco: "colore",
  biondo: "colore",
  rosso: "colore",
  ramato: "colore",
  ambra: "colore",
  dorato: "colore",
  argenteo: "colore",
  corvino: "colore",
  olivastro: "colore",
  pallido: "colore",
  abbronzato: "colore",
  riccio: "forma",
  ricciuto: "forma",
  liscio: "forma",
  mosso: "forma",
  ondulato: "forma",
  crespo: "forma",
  lungo: "lunghezza",
  corto: "lunghezza",
  rasato: "lunghezza",
};

/** Tutte le forme (genere e numero) degli aggettivi, verso la forma base. */
const FORMS = (() => {
  const map = new Map<string, string>();
  for (const base of Object.keys(ADJECTIVES)) {
    const forms = [base];
    if (/(co|go)$/.test(base)) {
      const root = base.slice(0, -1);
      forms.push(`${root}a`, `${root}hi`, `${root}he`);
    } else if (/io$/.test(base)) {
      const root = base.slice(0, -1);
      forms.push(`${root}a`, base.slice(0, -2) + "i", `${root}e`);
    } else if (base.endsWith("o")) {
      const root = base.slice(0, -1);
      forms.push(`${root}a`, `${root}i`, `${root}e`);
    } else if (base.endsWith("e")) {
      forms.push(`${base.slice(0, -1)}i`);
    }
    for (const f of forms) map.set(f, base);
  }
  return map;
})();

/** Quante parole dopo la parte del corpo cerchiamo l'aggettivo («occhi di un verde intenso»). */
const WINDOW = 4;

export interface Attribute {
  parte: string;
  valore: string;
}

/** Coppie parte → aggettivo trovate in un testo, nell'ordine. */
export function findAttributes(text: string): (Attribute & { start: number; end: number })[] {
  const tokens = words(text);
  const out: (Attribute & { start: number; end: number })[] = [];
  tokens.forEach((t, i) => {
    const parte = PARTS[t.word.toLowerCase()];
    if (!parte) return;
    for (let j = i + 1; j <= Math.min(i + WINDOW, tokens.length - 1); j++) {
      const w = tokens[j].word.toLowerCase();
      if (PARTS[w]) break; // un'altra parte del corpo: l'aggettivo è suo
      const base = FORMS.get(w);
      if (base) out.push({ parte, valore: base, start: t.start, end: tokens[j].end });
    }
  });
  return out;
}

/** Attributi dichiarati nella scheda: parte → valori base. */
export function sheetAttributes(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const a of findAttributes(text)) {
    const set = out.get(a.parte) ?? new Set<string>();
    set.add(a.valore);
    out.set(a.parte, set);
  }
  return out;
}

export interface ContinuityCharacter {
  id: string;
  nome: string;
  attributi: Map<string, Set<string>>;
}

export interface ContinuityWarning {
  id: string;
  nome: string;
  parte: string;
  trovato: string;
  atteso: string[];
  /** Le parole così come sono scritte («occhi azzurri»). */
  testo: string;
  start: number;
  end: number;
  /** La frase, accorciata, per mostrarla nel pannello. */
  frase: string;
}

export function continuityWarnings(text: string, characters: ContinuityCharacter[], matcher: MentionMatcher): ContinuityWarning[] {
  const byId = new Map(characters.filter((c) => c.attributi.size > 0).map((c) => [c.id, c]));
  if (byId.size === 0) return [];
  const mentions = matcher.find(text).filter((m) => byId.has(m.id));
  if (mentions.length === 0) return [];
  const out: ContinuityWarning[] = [];
  for (const s of sentences(text)) {
    const inSentence = mentions.filter((m) => m.start >= s.start && m.end <= s.end);
    if (inSentence.length === 0) continue;
    const sentence = text.slice(s.start, s.end);
    for (const a of findAttributes(sentence)) {
      const at = s.start + a.start;
      // Il personaggio nominato più vicino prima dell'attributo, altrimenti il primo dopo.
      const before = inSentence.filter((m) => m.end <= at);
      const who = byId.get((before[before.length - 1] ?? inSentence[0]).id)!;
      const expected = who.attributi.get(a.parte);
      if (!expected) continue;
      const dim = ADJECTIVES[a.valore];
      const sameDim = [...expected].filter((v) => ADJECTIVES[v] === dim);
      if (sameDim.length === 0 || sameDim.includes(a.valore)) continue;
      out.push({
        id: who.id,
        nome: who.nome,
        parte: a.parte,
        trovato: a.valore,
        atteso: sameDim,
        testo: text.slice(at, s.start + a.end),
        start: at,
        end: s.start + a.end,
        frase: sentence.length > 140 ? `${sentence.slice(0, 140)}…` : sentence,
      });
    }
  }
  return out;
}
