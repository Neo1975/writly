import { PDFDocument } from "pdf-lib";

/**
 * Re-impone le pagine di un PDF (pensato per pagine A5) su fogli A4 orizzontali,
 * due pagine per facciata, nell'ordine "quadernetto" (saddle-stitch): stampando
 * fronte-retro, piegando a metà e cucendo al centro, le pagine tornano in ordine di lettura.
 */
export async function imposeBooklet(contentPdfBytes: Uint8Array): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(contentPdfBytes);
  const total = srcDoc.getPageCount();
  const padded = Math.ceil(total / 4) * 4;

  const firstPage = srcDoc.getPage(0);
  const pageWidth = firstPage.getWidth();
  const pageHeight = firstPage.getHeight();

  const outDoc = await PDFDocument.create();
  const embeddedPages = await outDoc.embedPdf(contentPdfBytes);

  const sheetWidth = pageWidth * 2;
  const sheetHeight = pageHeight;

  function drawHalf(
    sheet: Awaited<ReturnType<typeof outDoc.addPage>>,
    logicalPageNumber: number,
    side: "left" | "right"
  ) {
    if (logicalPageNumber < 1 || logicalPageNumber > total) return;
    const embedded = embeddedPages[logicalPageNumber - 1];
    const x = side === "left" ? 0 : pageWidth;
    sheet.drawPage(embedded, { x, y: 0, width: pageWidth, height: pageHeight });
  }

  const sheets = padded / 4;
  for (let s = 0; s < sheets; s++) {
    const frontLeft = padded - 2 * s;
    const frontRight = 1 + 2 * s;
    const backLeft = 2 + 2 * s;
    const backRight = padded - 1 - 2 * s;

    const front = outDoc.addPage([sheetWidth, sheetHeight]);
    drawHalf(front, frontLeft, "left");
    drawHalf(front, frontRight, "right");

    const back = outDoc.addPage([sheetWidth, sheetHeight]);
    drawHalf(back, backLeft, "left");
    drawHalf(back, backRight, "right");
  }

  return outDoc.save();
}
