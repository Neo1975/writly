import { markdownBlocks, type Block, type Run } from "./markdown";

/**
 * Un capitolo pronto da incollare nelle piattaforme di pubblicazione a puntate
 * (Royal Road, Wattpad, Webnovel…): testo semplice o HTML, con le note dell'autore in
 * testa e in coda. Si compone nel browser, capitolo per capitolo.
 */

export type PlatformFormat = "testo" | "html";

export interface PlatformChapter {
  titolo: string;
  markdown: string;
  /** Nota fissa in testa e in coda (testo semplice, paragrafi separati da una riga vuota). */
  notaIniziale?: string;
  notaFinale?: string;
  /** Il titolo in testa al capitolo (di solito lo si scrive nel campo apposta della piattaforma). */
  conTitolo?: boolean;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const plainRuns = (runs: Run[]) => runs.map((r) => r.text).join("");

function htmlRuns(runs: Run[]): string {
  return runs
    .map((r) => {
      let t = escapeHtml(r.text).replace(/\n/g, "<br />");
      if (r.italic) t = `<em>${t}</em>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      return t;
    })
    .join("");
}

function noteParagraphs(note: string | undefined): string[] {
  return (note ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function plainBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "sep") out.push("* * *");
    else if (b.type === "li") out.push(`${b.marker} ${plainRuns(b.runs)}`);
    else out.push(plainRuns(b.runs));
  }
  return out;
}

function htmlBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const b of blocks) {
    if (b.type === "li") {
      list.push(`<li>${htmlRuns(b.runs)}</li>`);
      continue;
    }
    flush();
    if (b.type === "p") out.push(`<p>${htmlRuns(b.runs)}</p>`);
    else if (b.type === "h") out.push(`<h${b.level}>${htmlRuns(b.runs)}</h${b.level}>`);
    else if (b.type === "quote") out.push(`<blockquote>${htmlRuns(b.runs)}</blockquote>`);
    else out.push("<hr />");
  }
  flush();
  return out;
}

/** Il capitolo nel formato scelto. In testo semplice: paragrafi separati da una riga vuota, cambi di scena «* * *», niente simboli di formattazione. */
export function chapterForPlatform(c: PlatformChapter, formato: PlatformFormat): string {
  const blocks = markdownBlocks(c.markdown);
  const before = noteParagraphs(c.notaIniziale);
  const after = noteParagraphs(c.notaFinale);
  if (formato === "testo") {
    const parts: string[] = [];
    if (c.conTitolo) parts.push(c.titolo);
    if (before.length) parts.push(...before, "* * *");
    parts.push(...plainBlocks(blocks));
    if (after.length) parts.push("* * *", ...after);
    return `${parts.join("\n\n")}\n`;
  }
  const parts: string[] = [];
  if (c.conTitolo) parts.push(`<h2>${escapeHtml(c.titolo)}</h2>`);
  if (before.length) parts.push(...before.map((p) => `<p><em>${escapeHtml(p).replace(/\n/g, "<br />")}</em></p>`), "<hr />");
  parts.push(...htmlBlocks(blocks));
  if (after.length) parts.push("<hr />", ...after.map((p) => `<p><em>${escapeHtml(p).replace(/\n/g, "<br />")}</em></p>`));
  return `${parts.join("\n")}\n`;
}
