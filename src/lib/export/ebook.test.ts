import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildDocx, buildEpub } from "./ebook";

const book = { titolo: "Il faro & il molo", autore: "Autore <A>", sottotitolo: "Racconti" };
const chapters = [
  { titolo: "Uno", markdown: "Iris scese al **molo**.\n\nTomas *guardava*.\n\n---\n\nIl vento.  \nportava sale." },
  { titolo: "Due", markdown: "## Parte\n\n> Una citazione\n\n- primo\n- secondo" },
];

describe("EPUB", () => {
  const zip = buildEpub(book, chapters, { id: "urn:uuid:1234", modified: new Date("2026-11-18T10:00:00Z") });
  const files = unzipSync(zip);
  const text = (p: string) => strFromU8(files[p]);

  it("mette mimetype per primo e non compresso", () => {
    expect(Object.keys(files)[0]).toBe("mimetype");
    expect(text("mimetype")).toBe("application/epub+zip");
    // Intestazione locale del primo file: metodo di compressione 0 (stored), nome «mimetype» a offset 30.
    expect(zip[8]).toBe(0);
    expect(strFromU8(zip.slice(30, 38))).toBe("mimetype");
  });

  it("elenca capitoli, indice e metadati con l'escape dei caratteri speciali", () => {
    const opf = text("OEBPS/content.opf");
    expect(opf).toContain("<dc:title>Il faro &amp; il molo</dc:title>");
    expect(opf).toContain("<dc:creator>Autore &lt;A&gt;</dc:creator>");
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-18T10:00:00Z</meta>');
    expect(opf.match(/<itemref /g)).toHaveLength(3);
    expect(text("OEBPS/nav.xhtml")).toContain('<a href="capitolo-2.xhtml">Due</a>');
  });

  it("converte grassetto, corsivo, cambi di scena, a capo, citazioni ed elenchi", () => {
    const c1 = text("OEBPS/capitolo-1.xhtml");
    expect(c1).toContain("<p>Iris scese al <strong>molo</strong>.</p>");
    expect(c1).toContain("<em>guardava</em>");
    expect(c1).toContain('class="sep"');
    expect(c1).toContain("Il vento.<br/>portava sale.");
    const c2 = text("OEBPS/capitolo-2.xhtml");
    expect(c2).toContain("<h2>Parte</h2>");
    expect(c2).toContain("<blockquote><p>Una citazione</p></blockquote>");
    expect(c2).toContain("<ul><li>primo</li><li>secondo</li></ul>");
  });
});

describe("DOCX", () => {
  const files = unzipSync(buildDocx(book, chapters, { titlePage: true }));
  const doc = strFromU8(files["word/document.xml"]);

  it("contiene le parti obbligatorie", () => {
    for (const p of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "word/footer1.xml"]) expect(files[p]).toBeDefined();
  });

  it("usa gli stili per capitoli, primo paragrafo, cambio scena e citazioni", () => {
    expect(doc).toContain('<w:pStyle w:val="Frontespizio"/></w:pPr><w:r><w:t xml:space="preserve">Il faro &amp; il molo</w:t></w:r>');
    expect(doc.match(/w:val="Titolo1"/g)).toHaveLength(2);
    expect(doc).toContain('<w:pStyle w:val="Primo"/></w:pPr><w:r><w:t xml:space="preserve">Iris scese al </w:t></w:r><w:r><w:rPr><w:b/></w:rPr>');
    expect(doc).toContain('<w:pStyle w:val="Testo"/>');
    expect(doc).toContain('w:val="Separatore"');
    expect(doc).toContain('w:val="Citazione"');
    expect(doc).toContain("Il vento.</w:t><w:br/><w:t");
    expect(doc).toContain("•\t");
  });

  it("senza frontespizio il primo capitolo non apre con una pagina bianca", () => {
    const plain = strFromU8(unzipSync(buildDocx(book, chapters, { titlePage: false }))["word/document.xml"]);
    expect(plain).not.toContain("Frontespizio");
    expect(plain.match(/pageBreakBefore w:val="0"/g)).toHaveLength(1);
  });
});
