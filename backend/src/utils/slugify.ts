/**
 * Converts any string to a URL-safe slug.
 * e.g. "Men's T-Shirts & Tops!" → "mens-t-shirts-tops"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars (except spaces and hyphens)
    .replace(/[\s_]+/g, '-')    // spaces and underscores → hyphens
    .replace(/-{2,}/g, '-')     // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');   // trim leading/trailing hyphens
}

/**
 * Ensures a slug is unique by appending a suffix.
 * Pass an async exists function that checks the DB.
 */
export async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = base;
  let i = 1;
  while (await exists(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}
