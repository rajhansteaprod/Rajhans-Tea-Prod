/**
 * Unit tests for the canonical internal-URL helpers + TrailingSlashUrlSerializer.
 * Jasmine format (Angular `ng test`). The helpers are pure string logic, so they
 * are also verified stand-alone via ts-node in CI-independent checks.
 */
import {
  withTrailingSlash,
  stripTrailingSlash,
  isInternalPageHref,
  toCanonicalHref,
} from './canonical-url';
import { TrailingSlashUrlSerializer } from './trailing-slash-url-serializer';

describe('toCanonicalHref', () => {
  it('adds a trailing slash to a normal internal route', () => {
    expect(toCanonicalHref('/products')).toBe('/products/');
    expect(toCanonicalHref('/product/rajhans-royal-assam')).toBe('/product/rajhans-royal-assam/');
    expect(toCanonicalHref('/page/faq')).toBe('/page/faq/');
  });

  it('is idempotent — already trailing-slash URLs are unchanged', () => {
    expect(toCanonicalHref('/products/')).toBe('/products/');
    expect(toCanonicalHref('/')).toBe('/'); // root untouched
  });

  it('preserves query parameters (slash goes before the ?)', () => {
    expect(toCanonicalHref('/blog?tag=brewing')).toBe('/blog/?tag=brewing');
    expect(toCanonicalHref('/contact?reason=bulk')).toBe('/contact/?reason=bulk');
    expect(toCanonicalHref('/products/?page=2')).toBe('/products/?page=2'); // already canonical
  });

  it('preserves fragments (slash goes before the #)', () => {
    expect(toCanonicalHref('/page/about-us#team')).toBe('/page/about-us/#team');
    expect(toCanonicalHref('/products?sort=price#grid')).toBe('/products/?sort=price#grid');
  });

  it('leaves EXTERNAL URLs untouched', () => {
    expect(toCanonicalHref('https://example.com/x')).toBe('https://example.com/x');
    expect(toCanonicalHref('http://example.com')).toBe('http://example.com');
    expect(toCanonicalHref('//cdn.example.com/a')).toBe('//cdn.example.com/a'); // protocol-relative
  });

  it('leaves API, asset, mailto/tel, and fragment-only links untouched', () => {
    expect(toCanonicalHref('/api/v1/products')).toBe('/api/v1/products');
    expect(toCanonicalHref('/logo.png')).toBe('/logo.png');
    expect(toCanonicalHref('/sitemap.xml')).toBe('/sitemap.xml');
    expect(toCanonicalHref('/assets/styles.css')).toBe('/assets/styles.css');
    expect(toCanonicalHref('mailto:hi@rajhanstea.com')).toBe('mailto:hi@rajhanstea.com');
    expect(toCanonicalHref('tel:+919876543210')).toBe('tel:+919876543210');
    expect(toCanonicalHref('#top')).toBe('#top');
    expect(toCanonicalHref('')).toBe('');
  });

  it('classifies hrefs correctly', () => {
    expect(isInternalPageHref('/products')).toBe(true);
    expect(isInternalPageHref('/api/v1/x')).toBe(false);
    expect(isInternalPageHref('/logo.png')).toBe(false);
    expect(isInternalPageHref('https://x.com')).toBe(false);
    expect(isInternalPageHref('#frag')).toBe(false);
  });
});

describe('withTrailingSlash / stripTrailingSlash round-trip', () => {
  it('withTrailingSlash then stripTrailingSlash returns the path form', () => {
    for (const p of ['/products', '/blog?tag=x', '/page/faq#s']) {
      expect(stripTrailingSlash(withTrailingSlash(p))).toBe(p);
    }
  });
  it('root and suffixes are handled', () => {
    expect(withTrailingSlash('/')).toBe('/');
    expect(stripTrailingSlash('/')).toBe('/');
    expect(stripTrailingSlash('/products/')).toBe('/products');
  });
});

describe('TrailingSlashUrlSerializer', () => {
  const s = new TrailingSlashUrlSerializer();

  it('serializes internal routes with a trailing slash', () => {
    expect(s.serialize(s.parse('/products'))).toBe('/products/');
    expect(s.serialize(s.parse('/product/foo'))).toBe('/product/foo/');
  });

  it('is stable/idempotent across parse↔serialize (no redirect loop)', () => {
    expect(s.serialize(s.parse('/products/'))).toBe('/products/');
    expect(s.serialize(s.parse('/'))).toBe('/');
  });

  it('preserves query params and fragments', () => {
    expect(s.serialize(s.parse('/blog?tag=x'))).toBe('/blog/?tag=x');
    expect(s.serialize(s.parse('/page/faq#faqs'))).toBe('/page/faq/#faqs');
  });

  it('parse strips the trailing slash so routes without one still match', () => {
    // Both forms parse to the same tree ⇒ identical serialization.
    expect(s.serialize(s.parse('/products/'))).toBe(s.serialize(s.parse('/products')));
  });
});
