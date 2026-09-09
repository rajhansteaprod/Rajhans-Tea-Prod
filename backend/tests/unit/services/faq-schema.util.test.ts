import { extractFaqPairsFromHtml, buildFaqJsonLd, serializeFaqJsonLd } from '../../../src/modules/seo/services/faq-schema.util';

describe('extractFaqPairsFromHtml', () => {
  it('extracts every <h3>Question</h3><p>Answer</p> pair in order', () => {
    const html =
      '<h2>FAQs</h2>\n<h3>What is CTC tea?</h3>\n<p>A processing method.</p>\n<h3>Is it fresh?</h3>\n<p>Yes, always.</p>';
    const result = extractFaqPairsFromHtml(html);
    expect(result).toEqual({
      ok: true,
      items: [
        { question: 'What is CTC tea?', answer: 'A processing method.' },
        { question: 'Is it fresh?', answer: 'Yes, always.' },
      ],
    });
  });

  it('trims surrounding whitespace on question and answer', () => {
    const html = '<h3>  Padded question?  </h3>\n<p>  Padded answer.  </p>';
    const result = extractFaqPairsFromHtml(html);
    expect(result).toEqual({ ok: true, items: [{ question: 'Padded question?', answer: 'Padded answer.' }] });
  });

  it('fails with no_faq_entries when there are no h3/p pairs at all', () => {
    expect(extractFaqPairsFromHtml('<h2>FAQs</h2><p>No questions here.</p>')).toEqual({
      ok: false,
      reason: 'no_faq_entries',
    });
    expect(extractFaqPairsFromHtml('')).toEqual({ ok: false, reason: 'no_faq_entries' });
  });

  it('fails with empty_question when an h3 is empty/whitespace-only', () => {
    const html = '<h3>   </h3>\n<p>An answer.</p>';
    expect(extractFaqPairsFromHtml(html)).toEqual({ ok: false, reason: 'empty_question' });
  });

  it('fails with empty_answer when a p is empty/whitespace-only', () => {
    const html = '<h3>A question?</h3>\n<p>   </p>';
    expect(extractFaqPairsFromHtml(html)).toEqual({ ok: false, reason: 'empty_answer' });
  });

  it('fails with duplicate_question when the same question (case-insensitive) appears twice', () => {
    const html = '<h3>Same question?</h3><p>Answer one.</p><h3>same question?</h3><p>Answer two.</p>';
    expect(extractFaqPairsFromHtml(html)).toEqual({ ok: false, reason: 'duplicate_question' });
  });

  it('does not match an h3/p pair containing nested tags (treated as no pair present)', () => {
    // The inner <strong> breaks the [^<]* match, so this h3/p never becomes a pair —
    // and with no other pairs present, the result is no_faq_entries.
    const html = '<h3>A <strong>bold</strong> question?</h3><p>An answer.</p>';
    expect(extractFaqPairsFromHtml(html)).toEqual({ ok: false, reason: 'no_faq_entries' });
  });

  it('is insensitive to whitespace between the </h3> and <p> tags', () => {
    const html = '<h3>Q?</h3>\n\n   <p>A.</p>';
    expect(extractFaqPairsFromHtml(html)).toEqual({ ok: true, items: [{ question: 'Q?', answer: 'A.' }] });
  });
});

describe('buildFaqJsonLd', () => {
  it('builds a canonical FAQPage JSON-LD object from items', () => {
    const jsonLd = buildFaqJsonLd([{ question: 'Q1?', answer: 'A1.' }]);
    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Q1?',
          acceptedAnswer: { '@type': 'Answer', text: 'A1.' },
        },
      ],
    });
  });

  it('preserves item order in mainEntity', () => {
    const jsonLd = buildFaqJsonLd([
      { question: 'First?', answer: 'One.' },
      { question: 'Second?', answer: 'Two.' },
    ]);
    const mainEntity = (jsonLd as any).mainEntity;
    expect(mainEntity[0].name).toBe('First?');
    expect(mainEntity[1].name).toBe('Second?');
  });

  it('produces an empty mainEntity array for an empty items list (never fabricated)', () => {
    expect(buildFaqJsonLd([])).toEqual({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] });
  });
});

describe('serializeFaqJsonLd + determinism', () => {
  it('produces byte-identical output for the same items every time', () => {
    const items = [{ question: 'Q?', answer: 'A.' }];
    const a = serializeFaqJsonLd(buildFaqJsonLd(items));
    const b = serializeFaqJsonLd(buildFaqJsonLd(items));
    expect(a).toBe(b);
  });

  it('produces different output when items differ', () => {
    const a = serializeFaqJsonLd(buildFaqJsonLd([{ question: 'Q1?', answer: 'A1.' }]));
    const b = serializeFaqJsonLd(buildFaqJsonLd([{ question: 'Q2?', answer: 'A2.' }]));
    expect(a).not.toBe(b);
  });
});
