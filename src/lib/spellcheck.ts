export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

let cached: Promise<SpellChecker> | null = null;

export function loadItalianSpellChecker(): Promise<SpellChecker> {
  if (!cached) {
    cached = (async () => {
      const [{ loadModule }, affBuffer, dicBuffer] = await Promise.all([
        import("hunspell-asm"),
        fetch("/dictionaries/it.aff").then((res) => res.arrayBuffer()),
        fetch("/dictionaries/it.dic").then((res) => res.arrayBuffer()),
      ]);

      const factory = await loadModule();
      const affPath = factory.mountBuffer(new Uint8Array(affBuffer), "it.aff");
      const dicPath = factory.mountBuffer(new Uint8Array(dicBuffer), "it.dic");
      const hunspell = factory.create(affPath, dicPath);

      return {
        correct: (word: string) => hunspell.spell(word),
        suggest: (word: string) => hunspell.suggest(word),
      };
    })();
  }
  return cached;
}
