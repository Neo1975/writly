import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Plugin } from "unified";
import type { Root } from "mdast";

export const HIGHLIGHT_PATTERN =
  /\{\{h:([a-zA-Z0-9_-]+)\}\}([\s\S]*?)\{\{\/h\}\}/g;

const remarkHighlight: Plugin<[], Root> = () => (tree) => {
  findAndReplace(tree, [
    [
      HIGHLIGHT_PATTERN,
      (_match: string, id: string, text: string) =>
        ({
          type: "highlight",
          data: {
            hName: "mark",
            hProperties: { className: ["wr-highlight"], "data-hl-id": id },
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

export function wrapWithHighlight(text: string, highlightId: string): string {
  return `{{h:${highlightId}}}${text}{{/h}}`;
}

export function extractHighlightIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(HIGHLIGHT_PATTERN)) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}
