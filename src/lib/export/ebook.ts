import { strToU8, zipSync, type Zippable } from "fflate";
import { markdownBlocks, type Block, type Run } from "./markdown";

/**
 * Export EPUB 3 (per i lettori di ebook) e DOCX (il formato che chiedono
 * editori, agenzie e concorsi), composti nel browser come archivi zip.
 * Logica pura: riceve il Markdown dei capitoli, restituisce i byte del file.
 */

export interface EbookBook {
  titolo: string;
  sottotitolo?: string;
  autore?: string;
  lingua?: string;
}

export interface EbookChapter {
  titolo: string;
  markdown: string;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ——— EPUB ———

function htmlRuns(runs: Run[]): string {
  return runs
    .map((r) => {
      let t = xml(r.text).replace(/\n/g, "<br/>");
      if (r.italic) t = `<em>${t}</em>`;
      if (r.bold) t = `<strong>${t}</strong>`;
      return t;
    })
    .join("");
}

function htmlBlocks(blocks: Block[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const b of blocks) {
    if (b.type === "li") {
      list.push(`<li>${htmlRuns(b.runs)}</li>`);
      continue;
    }
    flushList();
    if (b.type === "p") out.push(`<p>${htmlRuns(b.runs)}</p>`);
    else if (b.type === "h") out.push(`<h${b.level}>${htmlRuns(b.runs)}</h${b.level}>`);
    else if (b.type === "quote") out.push(`<blockquote><p>${htmlRuns(b.runs)}</p></blockquote>`);
    else out.push(`<p class="sep" aria-hidden="true">* * *</p>`);
  }
  flushList();
  return out.join("\n");
}

function xhtml(lang: string, title: string, body: string, extraNs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${extraNs} xml:lang="${lang}" lang="${lang}">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

const EPUB_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1 { text-align: center; margin: 3em 0 2em; font-weight: normal; }
h2, h3 { margin: 1.5em 0 0.8em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
h1 + p, h2 + p, h3 + p, .sep + p, blockquote + p { text-indent: 0; }
.sep { text-align: center; text-indent: 0; margin: 1em 0; }
blockquote { margin: 1em 2em; font-style: italic; }
.title-page { text-align: center; margin-top: 30%; }
.title-page .title { font-size: 2em; text-indent: 0; text-align: center; }
.title-page .subtitle, .title-page .author { text-indent: 0; text-align: center; margin-top: 1em; }
`;

export function buildEpub(book: EbookBook, chapters: EbookChapter[], opts: { id: string; modified?: Date }): Uint8Array {
  const lang = book.lingua ?? "it";
  const modified = (opts.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const files: Zippable = {
    // Il primo file, non compresso, dichiara il tipo dell'archivio.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`),
    "OEBPS/style.css": strToU8(EPUB_CSS),
  };
  const titlePage = `<section class="title-page" epub:type="titlepage">
<p class="title">${xml(book.titolo)}</p>
${book.sottotitolo ? `<p class="subtitle">${xml(book.sottotitolo)}</p>` : ""}
${book.autore ? `<p class="author">${xml(book.autore)}</p>` : ""}
</section>`;
  files["OEBPS/titolo.xhtml"] = strToU8(xhtml(lang, book.titolo, titlePage, ' xmlns:epub="http://www.idpf.org/2007/ops"'));
  const names = chapters.map((_, i) => `capitolo-${i + 1}.xhtml`);
  chapters.forEach((c, i) => {
    files[`OEBPS/${names[i]}`] = strToU8(xhtml(lang, c.titolo, `<section epub:type="chapter">\n<h1>${xml(c.titolo)}</h1>\n${htmlBlocks(markdownBlocks(c.markdown))}\n</section>`, ' xmlns:epub="http://www.idpf.org/2007/ops"'));
  });
  const navList = chapters.map((c, i) => `<li><a href="${names[i]}">${xml(c.titolo)}</a></li>`).join("\n");
  files["OEBPS/nav.xhtml"] = strToU8(
    xhtml(lang, "Indice", `<nav epub:type="toc" id="toc"><h1>Indice</h1>\n<ol>\n${navList}\n</ol></nav>`, ' xmlns:epub="http://www.idpf.org/2007/ops"'),
  );
  // Indice NCX per i lettori EPUB 2 più vecchi.
  files["OEBPS/toc.ncx"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${xml(opts.id)}"/></head>
<docTitle><text>${xml(book.titolo)}</text></docTitle>
<navMap>
${chapters.map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(c.titolo)}</text></navLabel><content src="${names[i]}"/></navPoint>`).join("\n")}
</navMap>
</ncx>
`);
  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="titolo" href="titolo.xhtml" media-type="application/xhtml+xml"/>`,
    ...names.map((n, i) => `<item id="c${i + 1}" href="${n}" media-type="application/xhtml+xml"/>`),
  ];
  const spine = [`<itemref idref="titolo"/>`, ...names.map((_, i) => `<itemref idref="c${i + 1}"/>`)];
  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${xml(opts.id)}</dc:identifier>
<dc:title>${xml(book.titolo)}</dc:title>
<dc:language>${lang}</dc:language>
${book.autore ? `<dc:creator>${xml(book.autore)}</dc:creator>` : ""}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine toc="ncx">
${spine.join("\n")}
</spine>
</package>
`);
  return zipSync(files);
}

// ——— DOCX ———

function docxRuns(runs: Run[], extra = ""): string {
  return runs
    .map((r) => {
      const props = `${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}${extra}`;
      const parts = r.text.split("\n");
      const text = parts.map((p) => `<w:t xml:space="preserve">${xml(p)}</w:t>`).join("<w:br/>");
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${text}</w:r>`;
    })
    .join("");
}

const para = (style: string, runs: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${runs}</w:p>`;

function docxBlocks(blocks: Block[]): string[] {
  let first = true;
  return blocks.map((b) => {
    const style = first ? "Primo" : "Testo";
    if (b.type === "p") {
      first = false;
      return para(style, docxRuns(b.runs));
    }
    first = true;
    if (b.type === "h") return para(b.level === 2 ? "Titolo2" : "Titolo3", docxRuns(b.runs));
    if (b.type === "quote") return para("Citazione", docxRuns(b.runs));
    if (b.type === "li") return para("Elenco", docxRuns([{ text: `${b.marker === "-" || b.marker === "*" || b.marker === "+" ? "•" : b.marker}\t` }, ...b.runs]));
    return para("Separatore", docxRuns([{ text: "* * *" }]));
  });
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Testo"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="567"/><w:jc w:val="both"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Primo"><w:name w:val="Primo paragrafo"/><w:basedOn w:val="Testo"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Titolo1"><w:name w:val="heading 1"/><w:basedOn w:val="Testo"/><w:next w:val="Primo"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="2400" w:after="720"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Titolo2"><w:name w:val="heading 2"/><w:basedOn w:val="Testo"/><w:next w:val="Primo"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Titolo3"><w:name w:val="heading 3"/><w:basedOn w:val="Titolo2"/><w:next w:val="Primo"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Citazione"><w:name w:val="Quote"/><w:basedOn w:val="Testo"/><w:qFormat/><w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="567" w:right="567" w:firstLine="0"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Elenco"><w:name w:val="List Paragraph"/><w:basedOn w:val="Testo"/><w:pPr><w:ind w:left="567" w:hanging="283"/><w:jc w:val="left"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Separatore"><w:name w:val="Cambio scena"/><w:basedOn w:val="Testo"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Frontespizio"><w:name w:val="Title"/><w:basedOn w:val="Testo"/><w:qFormat/><w:pPr><w:spacing w:before="4800" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Centrato"><w:name w:val="Subtitle"/><w:basedOn w:val="Testo"/><w:pPr><w:spacing w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
</w:styles>
`;

export function buildDocx(book: EbookBook, chapters: EbookChapter[], opts: { titlePage: boolean; modified?: Date }): Uint8Array {
  const body: string[] = [];
  if (opts.titlePage) {
    body.push(para("Frontespizio", docxRuns([{ text: book.titolo }])));
    if (book.sottotitolo) body.push(para("Centrato", docxRuns([{ text: book.sottotitolo }])));
    if (book.autore) body.push(para("Centrato", docxRuns([{ text: book.autore }])));
  }
  chapters.forEach((c, i) => {
    // Il primo capitolo senza frontespizio non deve aprire con una pagina bianca.
    const noBreak = i === 0 && !opts.titlePage ? '<w:pageBreakBefore w:val="0"/>' : "";
    body.push(para("Titolo1", docxRuns([{ text: c.titolo }]), noBreak));
    body.push(...docxBlocks(markdownBlocks(c.markdown)));
  });
  // Pagina A4, margini 2,5 cm, numero di pagina in basso al centro.
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;
  const ns = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const created = (opts.modified ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const files: Zippable = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>
`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>
`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
`),
    "word/styles.xml": strToU8(DOCX_STYLES),
    "word/footer1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${ns}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>
`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${ns}><w:body>
${body.join("\n")}
${sect}
</w:body></w:document>
`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xml(book.titolo)}</dc:title>
${book.autore ? `<dc:creator>${xml(book.autore)}</dc:creator>` : ""}
<dc:language>${book.lingua ?? "it"}</dc:language>
<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
</cp:coreProperties>
`),
  };
  return zipSync(files);
}
