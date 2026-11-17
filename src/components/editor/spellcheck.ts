import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpellChecker } from "@/lib/spell/checker";
import { tokenizeForSpellcheck } from "@/lib/text/tokenize";

export const spellcheckKey = new PluginKey<DecorationSet>("writly-spellcheck");

function buildDecorations(doc: PMNode, checker: SpellChecker | null): DecorationSet {
  if (!checker) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isTextblock) return true;
    node.forEach((child, offset) => {
      if (!child.isText || !child.text || child.marks.some((m) => m.type.name === "code")) return;
      const start = pos + 1 + offset;
      for (const t of tokenizeForSpellcheck(child.text)) {
        if (!checker.isCorrect(t.word)) {
          decorations.push(
            Decoration.inline(start + t.start, start + t.end, { class: "spell-error" }, { word: t.word }),
          );
        }
      }
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export interface SpellcheckOptions {
  getChecker: () => SpellChecker | null;
}

/** Sottolinea le parole non riconosciute. Il controllo gira nel browser, il testo non esce dal dispositivo. */
export const Spellcheck = Extension.create<SpellcheckOptions>({
  name: "writlySpellcheck",

  addOptions() {
    return { getChecker: () => null };
  },

  addProseMirrorPlugins() {
    const getChecker = this.options.getChecker;
    return [
      new Plugin<DecorationSet>({
        key: spellcheckKey,
        state: {
          init: (_, state) => buildDecorations(state.doc, getChecker()),
          apply: (tr, old) => {
            if (tr.docChanged || tr.getMeta(spellcheckKey)) return buildDecorations(tr.doc, getChecker());
            return old;
          },
        },
        props: {
          decorations: (state) => spellcheckKey.getState(state),
        },
      }),
    ];
  },
});

/** Ricalcola le sottolineature (dizionario caricato, parola aggiunta o ignorata). */
export function refreshSpellcheck(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(spellcheckKey, true));
}

/** Estremi e testo della parola sottolineata in una posizione del documento, se c'è. */
export function misspellingAt(editor: Editor, pos: number): { from: number; to: number; word: string } | null {
  const set = spellcheckKey.getState(editor.state);
  const found = set?.find(pos, pos)[0] ?? set?.find(pos - 1, pos)[0];
  if (!found) return null;
  const word = (found.spec as { word?: string }).word ?? editor.state.doc.textBetween(found.from, found.to);
  return { from: found.from, to: found.to, word };
}
