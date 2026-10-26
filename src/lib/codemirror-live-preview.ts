import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { computeLivePreviewSpans } from "./live-preview-spans";

const HEADING_CLASS: Record<number, string> = {
  1: "cm-live-heading cm-live-heading-1",
  2: "cm-live-heading cm-live-heading-2",
  3: "cm-live-heading cm-live-heading-3",
};
const HEADING_CLASS_DEFAULT = "cm-live-heading cm-live-heading-rest";

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const spans = computeLivePreviewSpans(text, from, sel.from, sel.to);

    for (const span of spans) {
      if (span.from >= span.to) continue;
      switch (span.kind) {
        case "hide":
          builder.add(span.from, span.to, Decoration.replace({}));
          break;
        case "heading":
          builder.add(
            span.from,
            span.to,
            Decoration.mark({ class: HEADING_CLASS[span.level] ?? HEADING_CLASS_DEFAULT })
          );
          break;
        case "bold":
          builder.add(span.from, span.to, Decoration.mark({ class: "cm-live-bold" }));
          break;
        case "italic":
          builder.add(span.from, span.to, Decoration.mark({ class: "cm-live-italic" }));
          break;
        case "highlight":
          builder.add(
            span.from,
            span.to,
            Decoration.mark({
              class: "cm-live-highlight",
              attributes: { "data-hl-id": span.highlightId },
            })
          );
          break;
      }
    }
  }

  return builder.finish();
}

export function livePreview(onHighlightClick?: (id: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
      eventHandlers: {
        mousedown(event) {
          if (!onHighlightClick) return;
          const target = event.target as HTMLElement;
          const el = target.closest(".cm-live-highlight") as HTMLElement | null;
          const id = el?.getAttribute("data-hl-id");
          if (id) onHighlightClick(id);
        },
      },
    }
  );
}
