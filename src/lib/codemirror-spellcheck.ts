import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { HIGHLIGHT_PATTERN } from "./markdown";
import type { SpellChecker } from "./spellcheck";

const WORD_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ'’]+/g;

function maskHighlightMarkers(text: string): string {
  const closingTag = "{{/h}}";
  return text.replace(HIGHLIGHT_PATTERN, (match, _id: string, inner: string) => {
    const openingLength = match.length - inner.length - closingTag.length;
    return " ".repeat(openingLength) + inner + " ".repeat(closingTag.length);
  });
}

function buildDecorations(view: EditorView, spell: SpellChecker): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const masked = maskHighlightMarkers(text);
    for (const match of masked.matchAll(WORD_PATTERN)) {
      const word = match[0];
      if (word.length < 2 || /^'+$/.test(word)) continue;
      if (spell.correct(word)) continue;
      const start = from + (match.index ?? 0);
      builder.add(start, start + word.length, Decoration.mark({ class: "cm-misspelled" }));
    }
  }

  return builder.finish();
}

export function italianSpellcheck(spell: SpellChecker | null) {
  if (!spell) return [];
  const checker: SpellChecker = spell;

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, checker);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, checker);
        }
      }
    },
    { decorations: (instance) => instance.decorations }
  );
}
