/**
 * Keyword normalization for IDENTITY / dedup only — never for destroying intent.
 * Collapses surface-form differences ("Assam Tea", "assam tea ") but PRESERVES
 * meaning-bearing modifiers, so these stay distinct:
 *   assam tea ≠ assam ctc tea ≠ assam tea benefits ≠ buy assam tea ≠ assam tea vs darjeeling
 */

/** Identity key: lowercase, strip diacritics, collapse whitespace, drop only
 *  surrounding/duplicate punctuation. Word order and every token are preserved. */
export function normalizeKeyword(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&+/-]+/gu, ' ') // keep letters/digits/space + a few joiners
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate a list of raw keywords by normalized identity, preserving the first
 * seen surface form as representative and collecting all variants.
 */
export function dedupeKeywords(raws: string[]): { keyword: string; normalizedKeyword: string; variants: string[] }[] {
  const byNorm = new Map<string, { keyword: string; normalizedKeyword: string; variants: string[] }>();
  for (const raw of raws) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) continue;
    const n = normalizeKeyword(trimmed);
    if (!n) continue;
    const existing = byNorm.get(n);
    if (existing) {
      if (!existing.variants.includes(trimmed)) existing.variants.push(trimmed);
    } else {
      byNorm.set(n, { keyword: trimmed, normalizedKeyword: n, variants: [trimmed] });
    }
  }
  return [...byNorm.values()];
}
