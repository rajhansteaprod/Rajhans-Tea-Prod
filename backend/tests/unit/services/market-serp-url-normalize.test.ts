import { normalizeSerpDomain, normalizeSerpUrl } from '../../../src/modules/seo/market/services/serp-url-normalize';

describe('normalizeSerpUrl', () => {
  it('lowercases host, drops fragment, strips default port, preserves path/query', () => {
    expect(normalizeSerpUrl('HTTPS://Example.com:443/Tea/Assam?ref=1#section')).toBe('https://example.com/Tea/Assam?ref=1');
  });

  it('rejects non-http(s) schemes', () => {
    expect(normalizeSerpUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeSerpUrl('javascript:alert(1)')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(normalizeSerpUrl('not a url')).toBeNull();
  });

  it('does not delete query parameters (they may identify different pages)', () => {
    expect(normalizeSerpUrl('https://example.com/tea?variant=assam')).toContain('variant=assam');
  });
});

describe('normalizeSerpDomain', () => {
  it('lowercases and strips a leading www.', () => {
    expect(normalizeSerpDomain('WWW.Example.com')).toBe('example.com');
  });

  it('strips a trailing dot', () => {
    expect(normalizeSerpDomain('example.com.')).toBe('example.com');
  });

  it('leaves an already-normalized domain unchanged', () => {
    expect(normalizeSerpDomain('example.com')).toBe('example.com');
  });

  it('does not strip www from the middle of a domain', () => {
    expect(normalizeSerpDomain('shop.example.com')).toBe('shop.example.com');
  });
});
