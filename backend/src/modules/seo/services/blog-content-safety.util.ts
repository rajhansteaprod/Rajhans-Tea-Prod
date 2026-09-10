/**
 * Phase 6.6A — deterministic, DB/network-free safety/structure checks for a
 * brand-new blog article's HTML body, shared by the draft generator and the
 * preflight evaluator (same one-implementation principle as
 * internal-link-patch.util.ts / faq-schema.util.ts).
 */

export type ArticleHtmlSafetyResult = { ok: true } | { ok: false; reason: string };

/**
 * Rejects anything that would execute script or inject unsafe markup, and
 * requires a minimally sane article structure (at least one heading, at
 * least two paragraphs) — never a bare, structureless blob of text.
 */
export function validateArticleHtml(html: string): ArticleHtmlSafetyResult {
  if (!html || !html.trim()) return { ok: false, reason: 'empty_content' };

  if (/<script\b/i.test(html)) return { ok: false, reason: 'script_tag_present' };
  if (/\son\w+\s*=/i.test(html)) return { ok: false, reason: 'inline_event_handler' };
  if (/javascript\s*:/i.test(html)) return { ok: false, reason: 'javascript_uri' };
  if (/<iframe\b/i.test(html)) return { ok: false, reason: 'iframe_present' };
  if (/<style\b/i.test(html)) return { ok: false, reason: 'style_tag_present' };

  const h2Count = (html.match(/<h2\b/gi) ?? []).length;
  if (h2Count < 1) return { ok: false, reason: 'no_headings' };

  const pCount = (html.match(/<p\b/gi) ?? []).length;
  if (pCount < 2) return { ok: false, reason: 'too_few_paragraphs' };

  return { ok: true };
}

export interface ExtractedLink {
  href: string;
  anchor: string;
}

/**
 * Every `<a href="...">anchor</a>` pair in `html`. Returns null (rather than
 * a partial list) if any anchor tag is malformed (missing href, or anchor
 * text containing nested tags) — the caller must treat that as an unsafe/
 * unparseable article rather than silently ignoring the bad link.
 */
export function extractLinks(html: string): ExtractedLink[] | null {
  const links: ExtractedLink[] = [];
  const pattern = /<a\s+[^>]*href\s*=\s*"([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const anchorTagCount = (html.match(/<a\b/gi) ?? []).length;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const href = m[1]!.trim();
    const anchor = m[2]!.trim();
    if (!href || !anchor) return null;
    links.push({ href, anchor });
  }

  if (links.length !== anchorTagCount) return null; // some <a> didn't match the strict pattern — malformed
  return links;
}

/** True only when `url` is same-origin with `baseUrl` — never a protocol-relative or external host. */
export function isInternalUrl(url: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.origin.toLowerCase() === base.origin.toLowerCase();
  } catch {
    return false;
  }
}
