import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Un intervallo da evidenziare nel testo semplice del capitolo (blocchi separati da "\n"). */
export interface TextMark {
  start: number;
  end: number;
  className: string;
  note: string;
}

export type TextCheck = (text: string) => TextMark[];

export const textChecksKey = new PluginKey<DecorationSet>("writly-textchecks");

/** Testo dei blocchi con la posizione di ciascuno nel documento. */
function blocks(doc: PMNode): { pos: number; text: string }[] {
  const out: { pos: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    out.push({ pos: pos + 1, text: node.textBetween(0, node.content.size, undefined, "￼") });
    return false;
  });
  return out;
}

/** Il testo semplice usato dai controlli: lo stesso su cui si calcolano le decorazioni. */
export function checkText(doc: PMNode): string {
  return blocks(doc)
    .map((b) => b.text)
    .join("\n");
}

function build(doc: PMNode, check: TextCheck | null): DecorationSet {
  if (!check) return DecorationSet.empty;
  const list = blocks(doc);
  const starts: number[] = [];
  let offset = 0;
  for (const b of list) {
    starts.push(offset);
    offset += b.text.length + 1;
  }
  const marks = check(list.map((b) => b.text).join("\n"));
  const decorations: Decoration[] = [];
  let i = 0;
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    while (i < list.length - 1 && starts[i + 1] <= m.start) i++;
    const b = list[i];
    if (!b) break;
    const from = m.start - starts[i];
    const to = Math.min(m.end - starts[i], b.text.length);
    if (to <= from) continue;
    decorations.push(Decoration.inline(b.pos + from, b.pos + to, { class: m.className, title: m.note }));
  }
  return DecorationSet.create(doc, decorations);
}

/** Evidenzia i risultati dei controlli di stile e continuità (calcolati nel browser). */
export const TextChecks = Extension.create<{ getCheck: () => TextCheck | null }>({
  name: "writlyTextChecks",

  addOptions() {
    return { getCheck: () => null };
  },

  addProseMirrorPlugins() {
    const getCheck = this.options.getCheck;
    return [
      new Plugin<DecorationSet>({
        key: textChecksKey,
        state: {
          init: (_, state) => build(state.doc, getCheck()),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(textChecksKey) ? build(tr.doc, getCheck()) : old),
        },
        props: { decorations: (state) => textChecksKey.getState(state) },
      }),
    ];
  },
});

export function refreshTextChecks(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(textChecksKey, true));
}
