"use client";

import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { impose, SHEET_SIZES, type DuplexFlip, type Imposition, type SheetSize } from "./imposition";
import { markdownBlocks } from "./markdown";
import { chapterDoc, FONT_FILES, frontDoc, geometry, type BookInfo } from "./pdf";
import { MM, type PdfTemplate } from "./template";

/**
 * Impaginazione nel browser: pdfmake compone le pagine, pdf-lib le assembla
 * (pagine bianche, margini specchiati) e le impone a opuscolo. Il testo non
 * lascia il dispositivo.
 */

export interface ExportChapter {
  titolo: string;
  numero: number;
  markdown: string;
}

export interface BookletOptions {
  foglio: SheetSize;
  fronteRetro: DuplexFlip;
  /** Fogli per fascicolo; 0 = un solo fascicolo. */
  fogliPerSegnatura: number;
  /** Compensazione del creep in mm per il foglio più interno (0 = nessuna). */
  creep: number;
}

export interface ExportResult {
  pdf: Uint8Array;
  pages: number;
  /** Pagina d'inizio (nel libro) di ogni capitolo. */
  starts: number[];
  booklet?: { pdf: Uint8Array; imposition: Imposition };
}

type PdfMake = typeof import("pdfmake/build/pdfmake");

let loading: Promise<PdfMake> | null = null;

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const blob = new Blob([buf]);
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Non riesco a leggere un font."));
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** pdfmake e i font (dal nostro sito: nessuna risorsa esterna). Caricati una volta sola. */
function loadPdfMake(): Promise<PdfMake> {
  if (!loading) {
    loading = (async () => {
      const mod = await import("pdfmake/build/pdfmake");
      const pdfMake = ((mod as unknown as { default?: PdfMake }).default ?? mod) as PdfMake;
      const files = Array.from(new Set(Object.values(FONT_FILES).flatMap((f) => Object.values(f))));
      const vfs: Record<string, string> = {};
      await Promise.all(
        files.map(async (file) => {
          const res = await fetch(`/fonts/${file}`);
          if (!res.ok) throw new Error(`Font mancante: ${file}`);
          vfs[file] = await toBase64(await res.arrayBuffer());
        }),
      );
      pdfMake.addVirtualFileSystem(vfs);
      pdfMake.addFonts(FONT_FILES);
      return pdfMake;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

async function render(pdfMake: PdfMake, def: TDocumentDefinitions): Promise<{ bytes: Uint8Array; pages: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const buffer = await pdfMake.createPdf(def).getBuffer();
  const bytes = new Uint8Array(buffer);
  const doc = await PDFDocument.load(bytes);
  return { bytes, pages: doc.getPageCount() };
}

export async function renderBook(
  template: PdfTemplate,
  book: BookInfo,
  chapters: ExportChapter[],
  booklet: BookletOptions | null,
  onProgress?: (message: string) => void,
): Promise<ExportResult> {
  if (chapters.length === 0) throw new Error("Nessun capitolo da esportare.");
  onProgress?.("Carico i font…");
  const pdfMake = await loadPdfMake();
  const { PDFDocument, degrees, rgb } = await import("pdf-lib");
  const parsed = chapters.map((c) => ({ titolo: c.titolo, numero: c.numero, blocks: markdownBlocks(c.markdown) }));

  // 1. Pagine iniziali con numeri provvisori, per sapere quante sono.
  const tocFor = (starts: (number | null)[]) => parsed.map((c, i) => ({ titolo: c.titolo, pagina: starts[i] }));
  let front = frontDoc(template, book, tocFor(parsed.map(() => 999)));
  let frontRendered = front ? await render(pdfMake, front) : null;

  // 2. Capitoli uno alla volta, ognuno con il suo numero di prima pagina.
  type Part = { bytes: Uint8Array; pages: number; firstPage: number; blankBefore: boolean };
  let parts: Part[] = [];
  let starts: number[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    parts = [];
    starts = [];
    let page = (frontRendered?.pages ?? 0) + 1;
    for (const [i, ch] of parsed.entries()) {
      onProgress?.(`Impagino «${ch.titolo}» (${i + 1} di ${parsed.length})…`);
      const blankBefore = template.capitoli.aDestra && page % 2 === 0;
      if (blankBefore) page++;
      const r = await render(pdfMake, chapterDoc(template, book, ch, page));
      parts.push({ ...r, firstPage: page, blankBefore });
      starts.push(page);
      page += r.pages;
    }
    if (!front || !template.indice) break;
    // 3. Indice con i numeri veri: se cambia lunghezza, si rifà la numerazione.
    const finalFront = frontDoc(template, book, tocFor(starts))!;
    const finalRendered = await render(pdfMake, finalFront);
    const same = finalRendered.pages === frontRendered!.pages;
    front = finalFront;
    frontRendered = finalRendered;
    if (same) break;
  }

  // 4. Assemblaggio: pagine bianche e margini specchiati.
  onProgress?.("Assemblo il libro…");
  const g = geometry(template);
  const { width, height } = g.pageSize;
  const out = await PDFDocument.create();
  out.setTitle(book.titolo);
  if (book.autore) out.setAuthor(book.autore);
  out.setCreator("Writly");
  let pageNo = 0;
  const place = async (bytes: Uint8Array, count: number) => {
    const embedded = await out.embedPdf(bytes, Array.from({ length: count }, (_, i) => i));
    for (const ep of embedded) {
      pageNo++;
      const p = out.addPage([width, height]);
      p.drawPage(ep, { x: pageNo % 2 === 1 ? g.mirrorShift : -g.mirrorShift, y: 0 });
    }
  };
  if (frontRendered) await place(frontRendered.bytes, frontRendered.pages);
  for (const part of parts) {
    if (part.blankBefore) {
      // Una pagina bianca deve avere comunque un contenuto, altrimenti non si può
      // incorporare nell'opuscolo: un rettangolo invisibile.
      out.addPage([width, height]).drawRectangle({ x: 0, y: 0, width: 1, height: 1, opacity: 0 });
      pageNo++;
    }
    await place(part.bytes, part.pages);
  }
  const pdf = await out.save();
  const result: ExportResult = { pdf, pages: pageNo, starts };
  if (!booklet) return result;

  // 5. Opuscolo: due pagine per facciata, nell'ordine di piegatura.
  onProgress?.("Impongo l'opuscolo…");
  const imposition = impose(pageNo, booklet.fogliPerSegnatura);
  const sheet = SHEET_SIZES[booklet.foglio];
  const W = sheet.larghezza * MM;
  const H = sheet.altezza * MM;
  const scale = Math.min(W / 2 / width, H / height);
  const pw = width * scale;
  const ph = height * scale;
  const bk = await PDFDocument.create();
  bk.setTitle(`${book.titolo} (opuscolo)`);
  bk.setCreator("Writly");
  const pages = await bk.embedPdf(pdf, Array.from({ length: pageNo }, (_, i) => i));
  const y = (H - ph) / 2;
  const side = (left: number | null, right: number | null, creep: number, rotate: boolean) => {
    const p = bk.addPage([W, H]);
    // Pagina sinistra contro il dorso (a destra della sua metà), destra contro il dorso (a sinistra).
    if (left) p.drawPage(pages[left - 1], { x: W / 2 - pw + creep, y, width: pw, height: ph });
    if (right) p.drawPage(pages[right - 1], { x: W / 2 - creep, y, width: pw, height: ph });
    // Segni di piegatura, appena visibili, fuori dall'area del testo.
    const mark = { thickness: 0.4, color: rgb(0.6, 0.6, 0.6) };
    p.drawLine({ start: { x: W / 2, y: H }, end: { x: W / 2, y: H - 8 }, ...mark });
    p.drawLine({ start: { x: W / 2, y: 0 }, end: { x: W / 2, y: 8 }, ...mark });
    if (rotate) p.setRotation(degrees(180));
  };
  for (const s of imposition.sheets) {
    const creep = booklet.creep * MM * s.depth;
    side(s.front.left, s.front.right, creep, false);
    side(s.back.left, s.back.right, creep, booklet.fronteRetro === "lungo");
  }
  return { ...result, booklet: { pdf: await bk.save(), imposition } };
}
