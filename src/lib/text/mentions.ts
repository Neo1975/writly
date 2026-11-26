/**
 * Riconoscimento di personaggi e voci del mondo nel testo, per nome e alias.
 *
 * Il confronto è sensibile alle maiuscole («Rosa» il personaggio, «rosa» il
 * fiore) e rispetta i confini di parola anche con le lettere accentate; i nomi
 * di più parole hanno la precedenza su quelli più corti («Mastro Ilario» prima
 * di «Ilario»).
 */

export interface MentionTarget {
  id: string;
  names: string[];
}

export interface Mention {
  start: number;
  end: number;
  id: string;
  name: string;
}

export interface MentionMatcher {
  find(text: string): Mention[];
  /** Nomi attribuiti a più di una scheda (il riconoscimento usa la prima). */
  ambiguous: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createMentionMatcher(targets: MentionTarget[]): MentionMatcher {
  const owner = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const t of targets) {
    for (const raw of t.names) {
      const name = raw.trim().replace(/’/g, "'");
      if (name.length < 2) continue;
      const prev = owner.get(name);
      if (prev && prev !== t.id) ambiguous.add(name);
      else owner.set(name, t.id);
    }
  }
  const names = [...owner.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return { find: () => [], ambiguous: [] };
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "gu");

  return {
    ambiguous: [...ambiguous],
    find(text) {
      const normalized = text.replace(/’/g, "'"); // stessa lunghezza: le posizioni restano valide
      const out: Mention[] = [];
      for (const m of normalized.matchAll(re)) {
        out.push({ start: m.index, end: m.index + m[0].length, id: owner.get(m[0])!, name: m[0] });
      }
      return out;
    },
  };
}

/** Quante volte compare ogni scheda nel testo. */
export function countMentions(matcher: MentionMatcher, text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matcher.find(text)) counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
  return counts;
}

/** Le singole parole dei nomi, da accettare nel controllo ortografico. */
export function nameWords(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const n of names) for (const w of n.split(/[\s'’-]+/)) if (/\p{L}/u.test(w)) out.add(w);
  return [...out];
}
