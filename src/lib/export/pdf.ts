import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Block, Run } from "./markdown";
import { MM, type FontName, type PdfTemplate } from "./template";

/**
 * Definizioni pdfmake (logica pura, senza disegnare nulla).
 *
 * Ogni capitolo è un documento a sé: così sappiamo dove comincia, possiamo farlo
 * iniziare a destra aggiungendo una pagina bianca, mettere il suo titolo nelle
 * intestazioni e scrivere i numeri di pagina giusti nell'indice. I margini
 * interno/esterno (specchiati) si ottengono dopo, spostando le pagine dispari e
 * pari in direzioni opposte: qui i margini sinistro e destro sono la loro media.
 */

export interface BookInfo {
  titolo: string;
  sottotitolo: string;
  autore: string;
}

export interface BookChapter {
  titolo: string;
  /** Numero d'ordine nell'opera, per «Capitolo N». */
  numero: number;
  blocks: Block[];
}

export const FONT_FAMILY: Record<FontName, string> = { Literata: "Literata", "EB Garamond": "EBGaramond", Roboto: "Roboto" };

export const FONT_FILES: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }> = {
  Literata: {
    normal: "Literata_400Regular.ttf",
    bold: "Literata_700Bold.ttf",
    italics: "Literata_400Regular_Italic.ttf",
    bolditalics: "Literata_700Bold_Italic.ttf",
  },
  EBGaramond: {
    normal: "EBGaramond_400Regular.ttf",
    bold: "EBGaramond_700Bold.ttf",
    italics: "EBGaramond_400Regular_Italic.ttf",
    bolditalics: "EBGaramond_700Bold_Italic.ttf",
  },
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};

/** Dimensioni della pagina e margini (in punti) del documento prima dello specchiamento. */
export function geometry(t: PdfTemplate) {
  const side = ((t.margini.interno + t.margini.esterno) / 2) * MM;
  return {
    pageSize: { width: t.pagina.larghezza * MM, height: t.pagina.altezza * MM },
    margins: [side, t.margini.alto * MM, side, t.margini.basso * MM] as [number, number, number, number],
    /** Spostamento orizzontale delle pagine dispari (+) e pari (−) per ottenere interno ed esterno. */
    mirrorShift: ((t.margini.interno - t.margini.esterno) / 2) * MM,
  };
}

const runs = (rs: Run[]): ContentText["text"] =>
  rs.map((r) => ({ text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italics: true } : {}) }));

function base(t: PdfTemplate): Pick<TDocumentDefinitions, "pageSize" | "pageMargins" | "defaultStyle" | "watermark" | "info"> {
  const g = geometry(t);
  return {
    pageSize: g.pageSize,
    pageMargins: g.margins,
    defaultStyle: { font: FONT_FAMILY[t.testo.font], fontSize: t.testo.corpo, lineHeight: t.testo.interlinea },
    ...(t.filigrana ? { watermark: { text: "BOZZA", opacity: 0.08, bold: true, angle: -45 } } : {}),
  };
}

/** Il corpo del capitolo: titolo e blocchi di testo. */
export function chapterContent(t: PdfTemplate, ch: BookChapter): Content[] {
  const out: Content[] = [];
  const align = t.capitoli.allineamento === "centro" ? "center" : "left";
  const title = t.capitoli.maiuscolo ? ch.titolo.toLocaleUpperCase("it") : ch.titolo;
  if (t.capitoli.numero) {
    out.push({ text: `Capitolo ${ch.numero}`, alignment: align, fontSize: t.testo.corpo, italics: true, margin: [0, t.capitoli.spazioSopra * MM, 0, 4] });
  }
  out.push({
    text: title,
    alignment: align,
    fontSize: t.capitoli.corpo,
    bold: !t.capitoli.maiuscolo,
    characterSpacing: t.capitoli.maiuscolo ? 1.5 : 0,
    lineHeight: 1.15,
    margin: [0, t.capitoli.numero ? 0 : t.capitoli.spazioSopra * MM, 0, t.testo.corpo * 2.5],
  });

  // Tipografia classica: niente rientro sul primo paragrafo dopo titoli e cambi di scena.
  let afterBreak = true;
  const indent = t.testo.rientro * MM;
  const after = t.testo.spazioParagrafi;
  for (const b of ch.blocks) {
    switch (b.type) {
      case "p":
        out.push({
          text: runs(b.runs),
          alignment: t.testo.giustificato ? "justify" : "left",
          leadingIndent: afterBreak ? 0 : indent,
          margin: [0, 0, 0, after],
        });
        afterBreak = false;
        break;
      case "h":
        out.push({ text: runs(b.runs), bold: true, fontSize: t.testo.corpo + (b.level === 2 ? 2 : 1), margin: [0, t.testo.corpo, 0, t.testo.corpo * 0.6] });
        afterBreak = true;
        break;
      case "quote":
        out.push({ text: runs(b.runs), italics: true, margin: [indent * 2 || 18, t.testo.corpo * 0.4, indent * 2 || 18, t.testo.corpo * 0.4 + after] });
        afterBreak = true;
        break;
      case "li":
        out.push({ text: [{ text: `${b.marker} ` }, ...(runs(b.runs) as Content[] as never[])], margin: [indent || 12, 0, 0, after] });
        afterBreak = false;
        break;
      case "sep":
        out.push({ text: t.separatoreScena || " ", alignment: "center", margin: [0, t.testo.corpo * 0.8, 0, t.testo.corpo * 0.8] });
        afterBreak = true;
        break;
    }
  }
  return out;
}

/**
 * Documento di un capitolo. `firstPage` è il numero (nel libro intero) della sua
 * prima pagina: serve a numerare le pagine e ad alternare le intestazioni.
 */
export function chapterDoc(t: PdfTemplate, book: BookInfo, ch: BookChapter, firstPage: number): TDocumentDefinitions {
  const g = geometry(t);
  const small = Math.max(7, t.testo.corpo - 2);
  const pageNo = (p: number) => firstPage + p - 1;
  return {
    ...base(t),
    info: { title: `${book.titolo} — ${ch.titolo}`, author: book.autore },
    content: chapterContent(t, ch),
    header:
      t.intestazioni === "titoli"
        ? (current: number) =>
            current === 1
              ? null
              : {
                  text: pageNo(current) % 2 === 0 ? book.titolo : ch.titolo,
                  alignment: "center",
                  italics: true,
                  fontSize: small,
                  margin: [g.margins[0], g.margins[1] / 2 - small / 2, g.margins[2], 0],
                }
        : undefined,
    footer:
      t.numerazione === "nessuna"
        ? undefined
        : (current: number) => {
            const n = pageNo(current);
            const alignment = t.numerazione === "centro" ? "center" : n % 2 === 1 ? "right" : "left";
            return { text: String(n), alignment, fontSize: small, margin: [g.margins[0], g.margins[3] / 2 - small / 2, g.margins[2], 0] };
          },
  };
}

/**
 * Pagine iniziali: frontespizio (con il retro bianco se i capitoli iniziano a
 * destra) e indice. `null` se il template non prevede né l'uno né l'altro.
 */
export function frontDoc(t: PdfTemplate, book: BookInfo, toc: { titolo: string; pagina: number | null }[]): TDocumentDefinitions | null {
  if (!t.frontespizio && !t.indice) return null;
  const g = geometry(t);
  const content: Content[] = [];
  if (t.frontespizio) {
    const usable = g.pageSize.height - g.margins[1] - g.margins[3];
    content.push(
      book.autore ? { text: book.autore, alignment: "center", fontSize: t.testo.corpo + 2, margin: [0, usable * 0.12, 0, 0] } : { text: "", margin: [0, usable * 0.12, 0, 0] },
      { text: book.titolo, alignment: "center", fontSize: Math.max(t.capitoli.corpo * 1.4, 20), bold: true, lineHeight: 1.15, margin: [0, usable * 0.18, 0, 8] },
    );
    if (book.sottotitolo) content.push({ text: book.sottotitolo, alignment: "center", italics: true, fontSize: t.testo.corpo + 2 });
    if (t.capitoli.aDestra) content.push({ text: "", pageBreak: "before" });
  }
  if (t.indice) {
    content.push({
      text: "Indice",
      fontSize: t.capitoli.corpo,
      bold: true,
      alignment: t.capitoli.allineamento === "centro" ? "center" : "left",
      margin: [0, t.capitoli.spazioSopra * MM * 0.6, 0, t.testo.corpo * 2],
      ...(t.frontespizio ? { pageBreak: "before" as const } : {}),
    });
    content.push({
      table: {
        widths: ["*", "auto"],
        body: toc.map((e) => [
          { text: e.titolo, margin: [0, 2, 8, 2] },
          { text: e.pagina === null ? "" : String(e.pagina), alignment: "right", margin: [0, 2, 0, 2] },
        ]),
      },
      layout: "noBorders",
    });
  }
  return { ...base(t), info: { title: book.titolo, author: book.autore }, content };
}
