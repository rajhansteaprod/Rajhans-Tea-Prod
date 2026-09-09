/**
 * Phase 6.4A — deterministic internal-link content patching.
 *
 * Pure functions only: no database, no network, no LLM. Both the draft
 * generator (which proposes a patch) and the preflight evaluator (which
 * independently RE-DERIVES the same patch from the same inputs and requires
 * it to match byte-for-byte) import this module, so there is exactly one
 * algorithm — a generated draft can never diverge from what execution would
 * actually apply.
 */

/** How many times `needle` occurs in `haystack`, as a plain substring (no regex). */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

/** Minimal HTML-attribute escaping — the target URL is always our own site's, but this is defense in depth. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type LinkPatchFailureReason =
  | 'context_not_found'
  | 'context_ambiguous'
  | 'anchor_not_in_context'
  | 'anchor_ambiguous_in_context'
  | 'malformed_anchor_text'
  | 'malformed_target_url';

export type LinkPatchResult =
  | { ok: true; afterContent: string }
  | { ok: false; reason: LinkPatchFailureReason };

/**
 * Deterministically insert one `<a href="targetUrl">anchorText</a>` into
 * `beforeContent`, by finding `contextSnapshot` (an exact, already-present
 * contiguous substring) and wrapping the `anchorText` found inside it.
 *
 * Requires:
 *  - `contextSnapshot` occurs in `beforeContent` EXACTLY ONCE (never guesses
 *    which occurrence was meant);
 *  - `anchorText` occurs inside `contextSnapshot` EXACTLY ONCE (same reason);
 *  - neither `anchorText` nor `targetUrl` contain characters (`<`, `>`, `"`)
 *    that could produce malformed/broken HTML once inserted.
 */
export function applyInternalLinkPatch(
  beforeContent: string,
  contextSnapshot: string,
  anchorText: string,
  targetUrl: string,
): LinkPatchResult {
  if (/[<>]/.test(anchorText) || !anchorText.trim()) {
    return { ok: false, reason: 'malformed_anchor_text' };
  }
  if (/["<>]/.test(targetUrl) || !targetUrl.trim()) {
    return { ok: false, reason: 'malformed_target_url' };
  }

  const contextOccurrences = countOccurrences(beforeContent, contextSnapshot);
  if (contextOccurrences === 0) return { ok: false, reason: 'context_not_found' };
  if (contextOccurrences > 1) return { ok: false, reason: 'context_ambiguous' };

  const anchorOccurrences = countOccurrences(contextSnapshot, anchorText);
  if (anchorOccurrences === 0) return { ok: false, reason: 'anchor_not_in_context' };
  if (anchorOccurrences > 1) return { ok: false, reason: 'anchor_ambiguous_in_context' };

  const anchorIdx = contextSnapshot.indexOf(anchorText);
  const linkedSnippet =
    contextSnapshot.slice(0, anchorIdx) +
    `<a href="${escapeHtmlAttr(targetUrl)}">${anchorText}</a>` +
    contextSnapshot.slice(anchorIdx + anchorText.length);

  const afterContent = beforeContent.replace(contextSnapshot, linkedSnippet);
  return { ok: true, afterContent };
}

/**
 * Whether `content` already contains an `<a href="targetUrl" ...>` link
 * (trailing-slash tolerant, case-insensitive on the href value). Used to
 * reject a proposal that would create a duplicate link to the same target.
 */
export function contentAlreadyLinksTo(content: string, targetUrl: string): boolean {
  const normalize = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');
  const wanted = normalize(targetUrl);
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(content)) !== null) {
    if (normalize(match[1]) === wanted) return true;
  }
  return false;
}
