/**
 * Markdown dei capitoli → blocchi tipografici per l'impaginazione.
 * Copre ciò che l'editor produce: paragrafi, titoli (##, ###), citazioni,
 * cambi di scena (---), elenchi, grassetto e corsivo, a capo forzati.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: "p"; runs: Run[] }
  | { type: "h"; level: 2 | 3; runs: Run[] }
  | { type: "quote"; runs: Run[] }
  | { type: "li"; marker: string; runs: Run[] }
  | { type: "sep" };

/** Grassetto e corsivo (**, __, *, _), escape con backslash, link ridotti al loro testo. */
export function parseInline(src: string): Run[] {
  const text = src.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const last = runs[runs.length - 1];
    if (last && !!last.bold === bold && !!last.italic === italic) last.text += buf;
    else runs.push({ text: buf, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!>~]/.test(text[i + 1])) {
      buf += text[++i];
      continue;
    }
    if ((c === "*" || c === "_") && text[i + 1] === c) {
      // ** o __: apre se segue un carattere non spazio, chiude se è aperto.
      if (bold || (text[i + 2] && !/\s/.test(text[i + 2]))) {
        flush();
        bold = !bold;
        i++;
        continue;
      }
    } else if (c === "*" || c === "_") {
      const prev = text[i - 1] ?? " ";
      const next = text[i + 1] ?? " ";
      // _ dentro una parola (nomi_file) non è corsivo.
      const intraword = c === "_" && /[\p{L}\p{N}]/u.test(prev) && /[\p{L}\p{N}]/u.test(next);
      if (!intraword && (italic || !/\s/.test(next))) {
        flush();
        italic = !italic;
        continue;
      }
    }
    buf += c;
  }
  flush();
  return runs;
}

const HR = /^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/;
const LIST = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+(.*)$/;

/** Righe di un paragrafo: a capo semplice = spazio, due spazi o backslash finali = a capo forzato. */
function joinLines(lines: string[]): string {
  return lines
    .map((l, i) => {
      const last = i === lines.length - 1;
      const hard = /( {2,}|\\)$/.test(l) && !last;
      const clean = l.replace(/( {2,}|\\)$/, "").trim();
      return hard ? `${clean}\n` : `${clean}${last ? "" : " "}`;
    })
    .join("");
}

export function markdownBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];

  const endPara = () => {
    if (para.length) blocks.push({ type: "p", runs: parseInline(joinLines(para)) });
    para = [];
  };
  const endQuote = () => {
    if (quote.length) blocks.push({ type: "quote", runs: parseInline(joinLines(quote)) });
    quote = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      endPara();
      endQuote();
      continue;
    }
    if (HR.test(line)) {
      endPara();
      endQuote();
      blocks.push({ type: "sep" });
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      endPara();
      endQuote();
      blocks.push({ type: "h", level: h[1].length <= 2 ? 2 : 3, runs: parseInline(h[2]) });
      continue;
    }
    const q = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (q) {
      endPara();
      quote.push(q[1]);
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      endPara();
      endQuote();
      blocks.push({ type: "li", marker: /\d/.test(li[1]) ? li[1].replace(")", ".") : "•", runs: parseInline(li[2]) });
      continue;
    }
    if (quote.length) {
      quote.push(line);
      continue;
    }
    para.push(line);
  }
  endPara();
  endQuote();
  return blocks;
}
