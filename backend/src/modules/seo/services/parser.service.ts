import { createHash } from 'crypto';
import { isSameOrigin, normalizeUrl } from '../seo.util';

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  robotsMeta: string | null;
  canonical: string | null;
  h1: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[]; // normalized, same-origin
  structuredDataTypes: string[];
  wordCount: number;
  contentHash: string | null;
}

/** Read one attribute from a single tag string, case-insensitive, quote-aware. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

function allTags(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(re) || [];
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function parseHtml(html: string, pageUrl: string, baseUrl: string): ParsedPage {
  // ── <title> ──
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].replace(/\s+/g, ' ')) || null : null;

  // ── <meta> (description / robots) ──
  let metaDescription: string | null = null;
  let robotsMeta: string | null = null;
  for (const tag of allTags(html, 'meta')) {
    const name = (attr(tag, 'name') || '').toLowerCase();
    if (name === 'description' && metaDescription === null) {
      metaDescription = decode(attr(tag, 'content') || '') || null;
    } else if (name === 'robots' && robotsMeta === null) {
      robotsMeta = (attr(tag, 'content') || '').toLowerCase() || null;
    }
  }

  // ── <link rel="canonical"> ──
  let canonical: string | null = null;
  for (const tag of allTags(html, 'link')) {
    if ((attr(tag, 'rel') || '').toLowerCase() === 'canonical') {
      const href = attr(tag, 'href');
      if (href) canonical = normalizeUrl(decode(href), baseUrl);
      break;
    }
  }

  // ── <h1> (need inner text, so match the full element) ──
  const h1: string[] = [];
  const h1Re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let h1m: RegExpExecArray | null;
  while ((h1m = h1Re.exec(html))) {
    const text = decode(h1m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (text) h1.push(text);
  }

  // ── <img> alt coverage ──
  const imgs = allTags(html, 'img');
  const imagesTotal = imgs.length;
  const imagesMissingAlt = imgs.filter((t) => !(attr(t, 'alt') || '').trim()).length;

  // ── same-origin internal links ──
  const links = new Set<string>();
  for (const tag of allTags(html, 'a')) {
    const href = attr(tag, 'href');
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(decode(href), pageUrl).toString();
    } catch {
      continue;
    }
    if (isSameOrigin(abs, baseUrl)) links.add(normalizeUrl(abs, baseUrl));
  }

  // ── JSON-LD structured-data @types ──
  const structuredDataTypes = new Set<string>();
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    try {
      const json = JSON.parse(ld[1].trim());
      const collect = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (typeof node === 'object') {
          const t = (node as Record<string, unknown>)['@type'];
          if (typeof t === 'string') structuredDataTypes.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && structuredDataTypes.add(x));
          if ((node as Record<string, unknown>)['@graph']) collect((node as Record<string, unknown>)['@graph']);
        }
      };
      collect(json);
    } catch {
      /* malformed JSON-LD is reported by a rule, not here */
    }
  }

  // ── visible-text word count + content hash (for thin-content / change detection) ──
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text ? text.split(' ').filter(Boolean).length : 0;
  const contentHash = createHash('sha1').update(text).digest('hex');

  return {
    title,
    metaDescription,
    robotsMeta,
    canonical,
    h1,
    imagesTotal,
    imagesMissingAlt,
    internalLinks: Array.from(links),
    structuredDataTypes: Array.from(structuredDataTypes),
    wordCount,
    contentHash,
  };
}

/** Extract normalized <loc> URLs from a sitemap.xml body. */
export function parseSitemapLocs(xml: string, baseUrl: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) locs.push(normalizeUrl(decode(m[1]), baseUrl));
  return locs;
}
