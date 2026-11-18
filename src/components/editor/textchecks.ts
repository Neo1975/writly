import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Un intervallo da evidenziare nel testo semplice del capitolo (blocchi separati da "\n"). */
export interface TextMark {
  start: number;
  end: number;
  className: string;
  note?: string;
  attrs?: Record<string, string>;
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

function offsets(list: { text: string }[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const b of list) {
    starts.push(offset);
    offset += b.text.length + 1;
  }
  return starts;
}

/** Posizione nel documento di un carattere del testo dei controlli. */
export function textOffsetToPos(doc: PMNode, offset: number): number {
  const list = blocks(doc);
  const starts = offsets(list);
  let i = 0;
  while (i < list.length - 1 && starts[i + 1] <= offset) i++;
  return list[i] ? list[i].pos + Math.min(offset - starts[i], list[i].text.length) : 0;
}

/** Il contrario: posizione nel testo dei controlli di una posizione del documento. */
export function posToTextOffset(doc: PMNode, pos: number): number {
  const list = blocks(doc);
  const starts = offsets(list);
  for (let i = list.length - 1; i >= 0; i--) {
    if (pos >= list[i].pos) return starts[i] + Math.min(pos - list[i].pos, list[i].text.length);
  }
  return 0;
}

function build(doc: PMNode, check: TextCheck | null): DecorationSet {
  if (!check) return DecorationSet.empty;
  const list = blocks(doc);
  const starts = offsets(list);
  const marks = check(list.map((b) => b.text).join("\n"));
  const decorations: Decoration[] = [];
  for (const m of marks) {
    // Un intervallo può attraversare più paragrafi (una citazione lunga): una decorazione per blocco.
    for (let i = 0; i < list.length; i++) {
      const bStart = starts[i];
      const bEnd = bStart + list[i].text.length;
      if (bEnd < m.start) continue;
      if (bStart >= m.end) break;
      const from = Math.max(m.start, bStart) - bStart;
      const to = Math.min(m.end, bEnd) - bStart;
      if (to <= from) continue;
      decorations.push(Decoration.inline(list[i].pos + from, list[i].pos + to, { class: m.className, ...(m.note ? { title: m.note } : {}), ...m.attrs }));
    }
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
