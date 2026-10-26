import { Document, Page, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { PdfSettings } from "@/lib/types";
import { getPdfTemplate, type PdfTemplateDef } from "./templates";
import { chapterToBlocks, type PdfBlock, type PdfTextRun } from "./markdown-to-pdf";

export interface PdfChapterInput {
  file: string;
  title: string;
  content: string;
}

export interface BuildBookPdfParams {
  sagaTitle: string;
  romanzoTitle: string;
  settings: PdfSettings;
  chapters: PdfChapterInput[];
}

const MM_TO_PT = 2.83465;

function fontFor(template: PdfTemplateDef, run: PdfTextRun): string {
  if (run.bold && run.italic) return template.fontFamily.boldItalic;
  if (run.bold) return template.fontFamily.bold;
  if (run.italic) return template.fontFamily.italic;
  return template.fontFamily.regular;
}

function buildStyles(template: PdfTemplateDef, settings: PdfSettings) {
  const fontSize = settings.fontSize ?? template.baseFontSize;
  const lineHeight = settings.lineHeight ?? template.lineHeight;
  const margin = (settings.marginMm ?? 20) * MM_TO_PT;

  return StyleSheet.create({
    page: {
      paddingTop: margin,
      paddingBottom: margin + 14,
      paddingHorizontal: margin,
      fontFamily: template.fontFamily.regular,
      fontSize,
      lineHeight,
    },
    paragraph: {
      marginBottom: fontSize * 0.7,
      textAlign: template.justify ? "justify" : "left",
    },
    chapterHeading: {
      fontFamily: template.fontFamily.bold,
      fontSize: template.headingFontSize,
      marginBottom: fontSize * 1.5,
    },
    blockHeading: {
      fontFamily: template.fontFamily.bold,
      fontSize: template.headingFontSize * 0.75,
      marginTop: fontSize,
      marginBottom: fontSize * 0.7,
    },
    footer: {
      position: "absolute",
      bottom: margin / 2,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 9,
      color: "#666666",
    },
    coverPage: {
      paddingHorizontal: margin,
      fontFamily: template.fontFamily.regular,
      alignItems: "center",
      justifyContent: "center",
    },
    coverSaga: {
      fontFamily: template.fontFamily.italic,
      fontSize: 14,
      color: "#555555",
      marginBottom: 24,
      textAlign: "center",
    },
    coverTitle: {
      fontFamily: template.fontFamily.bold,
      fontSize: template.headingFontSize * 1.8,
      textAlign: "center",
      marginBottom: 24,
    },
    coverAuthor: {
      fontSize: 13,
      textAlign: "center",
    },
    tocPage: {
      paddingTop: margin,
      paddingHorizontal: margin,
      fontFamily: template.fontFamily.regular,
      fontSize,
    },
    tocTitle: {
      fontFamily: template.fontFamily.bold,
      fontSize: template.headingFontSize,
      marginBottom: fontSize * 1.5,
    },
    tocEntry: {
      marginBottom: fontSize * 0.5,
    },
  });
}

function Paragraph({
  block,
  template,
  style,
}: {
  block: PdfBlock;
  template: PdfTemplateDef;
  style: ReturnType<typeof buildStyles>["paragraph" | "blockHeading"];
}) {
  return (
    <Text style={style}>
      {block.runs.map((run, i) => (
        <Text key={i} style={{ fontFamily: fontFor(template, run) }}>
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

function BookDocument({ sagaTitle, romanzoTitle, settings, chapters }: BuildBookPdfParams) {
  const template = getPdfTemplate(settings.templateId);
  const styles = buildStyles(template, settings);
  const pageSize = settings.pageSize;

  const chaptersWithBlocks = chapters.map((chapter) => {
    const blocks = chapterToBlocks(chapter.content);
    const withoutTitleHeading =
      blocks[0]?.type === "heading" ? blocks.slice(1) : blocks;
    return { ...chapter, blocks: withoutTitleHeading };
  });

  return (
    <Document title={romanzoTitle} author={settings.authorName ?? undefined}>
      {settings.includeCoverPage && (
        <Page size={pageSize} style={styles.coverPage}>
          <Text style={styles.coverSaga}>{sagaTitle}</Text>
          <Text style={styles.coverTitle}>{romanzoTitle}</Text>
          {settings.authorName && (
            <Text style={styles.coverAuthor}>{settings.authorName}</Text>
          )}
        </Page>
      )}

      {settings.includeToc && (
        <Page size={pageSize} style={styles.tocPage}>
          <Text style={styles.tocTitle}>Indice</Text>
          {chaptersWithBlocks.map((chapter) => (
            <Text key={chapter.file} style={styles.tocEntry}>
              {chapter.title}
            </Text>
          ))}
        </Page>
      )}

      {chaptersWithBlocks.map((chapter) => (
        <Page key={chapter.file} size={pageSize} style={styles.page}>
          <Text style={styles.chapterHeading}>{chapter.title}</Text>
          {chapter.blocks.map((block, i) =>
            block.type === "heading" ? (
              <Paragraph key={i} block={block} template={template} style={styles.blockHeading} />
            ) : (
              <Paragraph key={i} block={block} template={template} style={styles.paragraph} />
            )
          )}
          <Text
            style={styles.footer}
            render={({ pageNumber }) => `${romanzoTitle} — ${pageNumber}`}
            fixed
          />
        </Page>
      ))}
    </Document>
  );
}

export async function buildBookPdf(params: BuildBookPdfParams): Promise<Buffer> {
  return renderToBuffer(<BookDocument {...params} />);
}
