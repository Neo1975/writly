import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { MentionMatcher } from "@/lib/text/mentions";

export const mentionsKey = new PluginKey<DecorationSet>("writly-mentions");

export interface MentionsSource {
  matcher: MentionMatcher;
  /** "personaggio" o "voce", per lo stile. */
  kindOf: (id: string) => string;
}

function build(doc: PMNode, source: MentionsSource | null): DecorationSet {
  if (!source) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Il testo di un blocco può essere spezzato in più nodi (grassetto, corsivo): li cerchiamo insieme.
    // Ogni nodo foglia (es. a capo) vale un carattere, così le posizioni restano allineate.
    const text = node.textBetween(0, node.content.size, undefined, "￼");
    for (const m of source.matcher.find(text)) {
      decorations.push(
        Decoration.inline(pos + 1 + m.start, pos + 1 + m.end, { class: `mention mention-${source.kindOf(m.id)}`, "data-mention": m.id }, { id: m.id }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Evidenzia nel testo i nomi di personaggi e voci del mondo (riconoscimento locale, nel browser). */
export const Mentions = Extension.create<{ getSource: () => MentionsSource | null }>({
  name: "writlyMentions",

  addOptions() {
    return { getSource: () => null };
  },

  addProseMirrorPlugins() {
    const getSource = this.options.getSource;
    return [
      new Plugin<DecorationSet>({
        key: mentionsKey,
        state: {
          init: (_, state) => build(state.doc, getSource()),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(mentionsKey) ? build(tr.doc, getSource()) : old.map(tr.mapping, tr.doc)),
        },
        props: { decorations: (state) => mentionsKey.getState(state) },
      }),
    ];
  },
});

export function refreshMentions(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(mentionsKey, true));
}
