import { HIGHLIGHT_PATTERN } from "./markdown";

const HEADING_PATTERN = /^(#{1,6})([ \t]+)(.*)$/gm;
const BOLD_PATTERN = /\*\*([^\n*]+?)\*\*/g;
const ITALIC_PATTERN = /(?<!\*)\*([^\n*]+?)\*(?!\*)/g;

export type LivePreviewSpan =
  | { kind: "hide"; from: number; to: number }
  | { kind: "heading"; from: number; to: number; level: number }
  | { kind: "bold"; from: number; to: number }
  | { kind: "italic"; from: number; to: number }
  | { kind: "highlight"; from: number; to: number; highlightId: string };

interface Range {
  from: number;
  to: number;
}

function overlapsAny(used: Range[], from: number, to: number): boolean {
  return used.some((r) => from < r.to && to > r.from);
}

function cursorIntersects(cursorFrom: number, cursorTo: number, from: number, to: number): boolean {
  return cursorFrom < to && cursorTo > from;
}

/**
 * Computes "live preview" decoration spans for a chunk of markdown text:
 * raw syntax markers are hidden and the content is styled, except for the
 * token the cursor/selection currently intersects (which stays raw so it
 * can be edited).
 *
 * `textOffset` is the absolute document position of `text[0]`; all
 * returned spans and `cursorFrom`/`cursorTo` are in that same absolute
 * coordinate space.
 */
export function computeLivePreviewSpans(
  text: string,
  textOffset: number,
  cursorFrom: number,
  cursorTo: number
): LivePreviewSpan[] {
  const used: Range[] = [];
  const spans: LivePreviewSpan[] = [];

  for (const m of text.matchAll(HIGHLIGHT_PATTERN)) {
    const id = m[1];
    const inner = m[2];
    const matchStart = textOffset + (m.index ?? 0);
    const matchEnd = matchStart + m[0].length;
    const closingLength = "{{/h}}".length;
    const openingLength = m[0].length - inner.length - closingLength;
    const openTo = matchStart + openingLength;
    const innerTo = openTo + inner.length;

    used.push({ from: matchStart, to: matchEnd });
    if (cursorIntersects(cursorFrom, cursorTo, matchStart, matchEnd)) continue;
    if (inner.length === 0) continue;

    spans.push({ kind: "hide", from: matchStart, to: openTo });
    spans.push({ kind: "highlight", from: openTo, to: innerTo, highlightId: id });
    spans.push({ kind: "hide", from: innerTo, to: matchEnd });
  }

  for (const m of text.matchAll(HEADING_PATTERN)) {
    const hashes = m[1];
    const space = m[2];
    const matchStart = textOffset + (m.index ?? 0);
    const matchEnd = matchStart + m[0].length;
    const contentFrom = matchStart + hashes.length + space.length;

    if (overlapsAny(used, matchStart, matchEnd)) continue;
    used.push({ from: matchStart, to: matchEnd });
    if (cursorIntersects(cursorFrom, cursorTo, matchStart, matchEnd)) continue;
    if (contentFrom >= matchEnd) continue;

    spans.push({ kind: "hide", from: matchStart, to: contentFrom });
    spans.push({ kind: "heading", from: contentFrom, to: matchEnd, level: hashes.length });
  }

  for (const m of text.matchAll(BOLD_PATTERN)) {
    const matchStart = textOffset + (m.index ?? 0);
    const matchEnd = matchStart + m[0].length;

    if (overlapsAny(used, matchStart, matchEnd)) continue;
    used.push({ from: matchStart, to: matchEnd });
    if (cursorIntersects(cursorFrom, cursorTo, matchStart, matchEnd)) continue;

    const innerFrom = matchStart + 2;
    const innerTo = matchEnd - 2;
    spans.push({ kind: "hide", from: matchStart, to: innerFrom });
    spans.push({ kind: "bold", from: innerFrom, to: innerTo });
    spans.push({ kind: "hide", from: innerTo, to: matchEnd });
  }

  for (const m of text.matchAll(ITALIC_PATTERN)) {
    const matchStart = textOffset + (m.index ?? 0);
    const matchEnd = matchStart + m[0].length;

    if (overlapsAny(used, matchStart, matchEnd)) continue;
    used.push({ from: matchStart, to: matchEnd });
    if (cursorIntersects(cursorFrom, cursorTo, matchStart, matchEnd)) continue;

    const innerFrom = matchStart + 1;
    const innerTo = matchEnd - 1;
    spans.push({ kind: "hide", from: matchStart, to: innerFrom });
    spans.push({ kind: "italic", from: innerFrom, to: innerTo });
    spans.push({ kind: "hide", from: innerTo, to: matchEnd });
  }

  spans.sort((a, b) => a.from - b.from || a.to - b.to);
  return spans;
}
