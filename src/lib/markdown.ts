import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Plugin } from "unified";
import type { Root } from "mdast";

export const HIGHLIGHT_PATTERN =
  /\{\{h:([a-zA-Z0-9_-]+)(?::([a-z0-9-]+))?\}\}([\s\S]*?)\{\{\/h\}\}/g;

const remarkHighlight: Plugin<[], Root> = () => (tree) => {
  findAndReplace(tree, [
    [
      HIGHLIGHT_PATTERN,
      (_match: string, id: string, color: string | undefined, text: string) =>
        ({
          type: "highlight",
          data: {
            hName: "mark",
            hProperties: {
              className: ["wr-highlight"],
              "data-hl-id": id,
              "data-hl-color": color,
            },
          },
          children: [{ type: "text", value: text }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    ],
  ]);
};

const processor = unified()
  .use(remarkParse)
  .use(remarkHighlight)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeStringify);

export async function renderMarkdown(content: string): Promise<string> {
  const file = await processor.process(content);
  return String(file);
}

export function wrapWithHighlight(text: string, highlightId: string, color?: string): string {
  const colorSuffix = color ? `:${color}` : "";
  return `{{h:${highlightId}${colorSuffix}}}${text}{{/h}}`;
}

export function stripHighlights(content: string): string {
  return content.replace(HIGHLIGHT_PATTERN, (_match, _id, _color, text) => text);
}

export function extractHighlightIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(HIGHLIGHT_PATTERN)) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

export function getHighlightColor(content: string, highlightId: string): string | undefined {
  for (const match of content.matchAll(HIGHLIGHT_PATTERN)) {
    if (match[1] === highlightId) return match[2];
  }
  return undefined;
}

export function unwrapHighlight(content: string, highlightId: string): string {
  return content.replace(HIGHLIGHT_PATTERN, (match, id: string, _color, inner: string) =>
    id === highlightId ? inner : match
  );
}

export function findHighlightRange(
  content: string,
  highlightId: string
): { from: number; to: number } | null {
  for (const match of content.matchAll(HIGHLIGHT_PATTERN)) {
    if (match[1] !== highlightId) continue;
    const inner = match[3];
    const matchStart = match.index ?? 0;
    const closingLength = "{{/h}}".length;
    const openingLength = match[0].length - inner.length - closingLength;
    const from = matchStart + openingLength;
    return { from, to: from + inner.length };
  }
  return null;
}
