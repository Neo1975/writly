export interface HighlightColor {
  id: string;
  label: string;
  swatch: string;
  background: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: "giallo", label: "Giallo", swatch: "#fde047", background: "#fef3c7" },
  { id: "verde", label: "Verde", swatch: "#4ade80", background: "#bbf7d0" },
  { id: "azzurro", label: "Azzurro", swatch: "#38bdf8", background: "#bae6fd" },
  { id: "rosa", label: "Rosa", swatch: "#f472b6", background: "#fbcfe8" },
  { id: "viola", label: "Viola", swatch: "#a78bfa", background: "#e9d5ff" },
  { id: "arancione", label: "Arancione", swatch: "#fb923c", background: "#fed7aa" },
];

export const DEFAULT_HIGHLIGHT_COLOR_ID = HIGHLIGHT_COLORS[0].id;

export function getHighlightBackground(colorId: string | undefined): string {
  const found = HIGHLIGHT_COLORS.find((c) => c.id === colorId);
  return (found ?? HIGHLIGHT_COLORS[0]).background;
}

export function getHighlightSwatch(colorId: string | undefined): string {
  const found = HIGHLIGHT_COLORS.find((c) => c.id === colorId);
  return (found ?? HIGHLIGHT_COLORS[0]).swatch;
}
