/** Slug ASCII per nomi di file, opere e repository ("Le lanterne del molo" → "le-lanterne-del-molo"). */
export function slugify(text: string, maxLength = 60): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = slug.slice(0, maxLength).replace(/-+$/g, "");
  return cut || "senza-titolo";
}

/** Aggiunge -2, -3, ... finché lo slug non è libero. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Id breve e stabile, indipendente dal titolo (per capitoli e, in futuro, scene). */
export function shortId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}
