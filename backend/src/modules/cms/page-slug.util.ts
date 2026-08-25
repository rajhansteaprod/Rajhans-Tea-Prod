/**
 * Duplicate/legacy CMS page slugs and their canonical survivor. Legacy slugs are
 * 301'd to the canonical at the edge (nginx) and must be collapsed onto the
 * canonical wherever a page URL is emitted — the sitemap AND the SEO audit
 * inventory — so a legacy slug is never treated as a standalone indexable page.
 *
 * Single source of truth shared by cms.service (sitemap) and the SEO inventory.
 */
export const CANONICAL_PAGE_SLUG: Record<string, string> = {
  'terms-conditions': 'terms-and-conditions',
  'return-refund': 'return-refund-policy',
};

/** Map a page slug to its canonical survivor (identity when not a legacy slug). */
export const canonicalPageSlug = (slug: string): string => CANONICAL_PAGE_SLUG[slug] ?? slug;
