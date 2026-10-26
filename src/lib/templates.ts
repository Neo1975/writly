import type { Romanzo, Saga } from "./types";

export function sagaJsonTemplate(title: string, description?: string): string {
  const saga: Saga = {
    id: crypto.randomUUID(),
    title,
    description,
    createdAt: new Date().toISOString(),
  };
  return JSON.stringify(saga, null, 2) + "\n";
}

export function romanzoJsonTemplate(
  title: string,
  order: number,
  description?: string
): string {
  const romanzo: Romanzo = { title, order, description, status: "bozza" };
  return JSON.stringify(romanzo, null, 2) + "\n";
}

export function emptyJsonArray(): string {
  return "[]\n";
}

export function chapterTemplate(title: string): string {
  return `# ${title}\n\nScrivi qui il tuo capitolo.\n`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
