import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Content, Root } from "mdast";
import { stripHighlights } from "@/lib/markdown";

export interface PdfTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PdfBlock {
  type: "heading" | "paragraph";
  depth?: number;
  runs: PdfTextRun[];
}

const parser = unified().use(remarkParse);

function flattenInline(
  node: Content,
  state: { bold: boolean; italic: boolean }
): PdfTextRun[] {
  switch (node.type) {
    case "text":
      return [{ text: node.value, bold: state.bold, italic: state.italic }];
    case "inlineCode":
      return [{ text: node.value, bold: state.bold, italic: state.italic }];
    case "break":
      return [{ text: "\n", bold: state.bold, italic: state.italic }];
    case "strong":
      return node.children.flatMap((child) =>
        flattenInline(child, { ...state, bold: true })
      );
    case "emphasis":
      return node.children.flatMap((child) =>
        flattenInline(child, { ...state, italic: true })
      );
    case "link":
    case "delete":
      return node.children.flatMap((child) => flattenInline(child, state));
    default:
      return [];
  }
}

function blockRuns(node: Content): PdfTextRun[] {
  if ("children" in node) {
    return (node.children as Content[]).flatMap((child) =>
      flattenInline(child, { bold: false, italic: false })
    );
  }
  return [];
}

export function chapterToBlocks(content: string): PdfBlock[] {
  const plain = stripHighlights(content);
  const tree = parser.parse(plain) as Root;
  const blocks: PdfBlock[] = [];

  for (const node of tree.children) {
    if (node.type === "heading") {
      blocks.push({ type: "heading", depth: node.depth, runs: blockRuns(node) });
    } else if (node.type === "paragraph") {
      blocks.push({ type: "paragraph", runs: blockRuns(node) });
    } else if (node.type === "blockquote") {
      for (const child of node.children) {
        blocks.push({
          type: "paragraph",
          runs: blockRuns(child).map((run) => ({ ...run, italic: true })),
        });
      }
    } else if (node.type === "list") {
      for (const item of node.children) {
        const runs = item.children.flatMap((child) => blockRuns(child));
        blocks.push({ type: "paragraph", runs: [{ text: "• " }, ...runs] });
      }
    } else if (node.type === "thematicBreak") {
      blocks.push({ type: "paragraph", runs: [{ text: "* * *" }] });
    }
  }

  return blocks;
}
