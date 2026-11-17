import { shouldSkipWord } from "@/lib/text/tokenize";

export interface SpellChecker {
  isCorrect(word: string): boolean;
  suggest(word: string): string[];
  /** Parole accettate per questa sessione (dizionario del progetto, nomi, "ignora"). */
  accept(words: Iterable<string>): void;
}

interface HunspellLike {
  spell(word: string): boolean;
  suggest(word: string): string[];
  addWord(word: string): void;
}

/** Avvolge un'istanza Hunspell con cache e parole accettate. Esportata per i test. */
export function createSpellChecker(hunspell: HunspellLike): SpellChecker {
  const cache = new Map<string, boolean>();
  const accepted = new Set<string>();

  return {
    isCorrect(word) {
      if (shouldSkipWord(word) || accepted.has(word)) return true;
      let ok = cache.get(word);
      if (ok === undefined) {
        ok = hunspell.spell(word);
        // "Città" a inizio frase: accettata se la forma minuscola è corretta.
        if (!ok && word[0] !== word[0].toLowerCase()) {
          ok = hunspell.spell(word[0].toLowerCase() + word.slice(1));
        }
        cache.set(word, ok);
      }
      return ok;
    },
    suggest(word) {
      return hunspell.suggest(word).slice(0, 6);
    },
    accept(words) {
      for (const w of words) {
        const clean = w.trim();
        if (!clean) continue;
        accepted.add(clean);
        hunspell.addWord(clean);
        cache.delete(clean);
      }
    },
  };
}

let loading: Promise<SpellChecker> | null = null;

/** Carica (una sola volta per pagina) Hunspell con il dizionario italiano servito da /dictionaries. */
export function loadItalianSpellChecker(): Promise<SpellChecker> {
  if (!loading) {
    loading = (async () => {
      const [{ loadModule }, aff, dic] = await Promise.all([
        import("hunspell-asm"),
        fetch("/dictionaries/it.aff").then((r) => r.arrayBuffer()),
        fetch("/dictionaries/it.dic").then((r) => r.arrayBuffer()),
      ]);
      const factory = await loadModule();
      const affPath = factory.mountBuffer(new Uint8Array(aff), "it.aff");
      const dicPath = factory.mountBuffer(new Uint8Array(dic), "it.dic");
      return createSpellChecker(factory.create(affPath, dicPath));
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
