import type { PdfTemplateId } from "@/lib/types";

export interface PdfTemplateDef {
  id: PdfTemplateId;
  name: string;
  description: string;
  fontFamily: {
    regular: string;
    bold: string;
    italic: string;
    boldItalic: string;
  };
  baseFontSize: number;
  headingFontSize: number;
  lineHeight: number;
  justify: boolean;
}

export const PDF_TEMPLATES: PdfTemplateDef[] = [
  {
    id: "classico",
    name: "Classico",
    description: "Serif, giustificato, impaginazione da romanzo tradizionale.",
    fontFamily: {
      regular: "Times-Roman",
      bold: "Times-Bold",
      italic: "Times-Italic",
      boldItalic: "Times-BoldItalic",
    },
    baseFontSize: 11,
    headingFontSize: 20,
    lineHeight: 1.5,
    justify: true,
  },
  {
    id: "moderno",
    name: "Moderno",
    description: "Sans serif, allineamento a sinistra, titoli netti.",
    fontFamily: {
      regular: "Helvetica",
      bold: "Helvetica-Bold",
      italic: "Helvetica-Oblique",
      boldItalic: "Helvetica-BoldOblique",
    },
    baseFontSize: 10.5,
    headingFontSize: 18,
    lineHeight: 1.4,
    justify: false,
  },
  {
    id: "manoscritto",
    name: "Manoscritto",
    description: "Monospaziato a doppia interlinea, pensato per revisione ed editing.",
    fontFamily: {
      regular: "Courier",
      bold: "Courier-Bold",
      italic: "Courier-Oblique",
      boldItalic: "Courier-BoldOblique",
    },
    baseFontSize: 12,
    headingFontSize: 14,
    lineHeight: 2,
    justify: false,
  },
];

export function getPdfTemplate(id: PdfTemplateId): PdfTemplateDef {
  return PDF_TEMPLATES.find((t) => t.id === id) ?? PDF_TEMPLATES[0];
}
