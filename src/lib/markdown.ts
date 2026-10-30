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

export const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

type WikilinkResolver = (title: string) => string | undefined;

const remarkWikilink: Plugin<[WikilinkResolver?], Root> =
  (resolveSlug) => (tree) => {
    findAndReplace(tree, [
      [
        WIKILINK_PATTERN,
        (_match: string, rawTitle: string) => {
          const title = rawTitle.trim();
          const slug = resolveSlug?.(title);
          return {
            type: "wikilink",
            data: {
              hName: "a",
              hProperties: {
                className: slug ? ["wr-wikilink"] : ["wr-wikilink", "wr-wikilink-unresolved"],
                href: slug ? `/agendina?note=${encodeURIComponent(slug)}` : undefined,
              },
            },
            children: [{ type: "text", value: title }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        },
      ],
    ]);
  };

function buildProcessor(resolveSlug?: WikilinkResolver) {
  return unified()
    .use(remarkParse)
    .use(remarkHighlight)
    .use(remarkWikilink, resolveSlug)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeStringify);
}

const defaultProcessor = buildProcessor();

export async function renderMarkdown(
  content: string,
  options?: { resolveNoteSlug?: WikilinkResolver }
): Promise<string> {
  const processor = options?.resolveNoteSlug ? buildProcessor(options.resolveNoteSlug) : defaultProcessor;
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
