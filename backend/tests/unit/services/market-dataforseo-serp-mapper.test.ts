import { mapSerpResponse } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo-serp.mapper';
import { DataForSeoTaskResponse } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.types';
import { DataForSeoSerpResultWrapper } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo-serp.mapper';

function serpResp(items: Partial<{ type: string; url: string; domain: string; rank_group: number }>[]): DataForSeoTaskResponse<DataForSeoSerpResultWrapper> {
  return { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{ keyword: 'x', items_count: items.length, items: items as never }] }] };
}

describe('mapSerpResponse', () => {
  it('filters to organic items only (ads/featured snippets/people-also-ask excluded)', () => {
    const resp = serpResp([
      { type: 'featured_snippet', url: 'https://a.com/', domain: 'a.com' },
      { type: 'organic', url: 'https://b.com/', domain: 'b.com' },
      { type: 'people_also_ask' },
      { type: 'organic', url: 'https://c.com/', domain: 'c.com' },
    ]);
    const result = mapSerpResponse(resp, 'assam tea', '2026-01-01T00:00:00Z');
    expect(result.topUrls).toEqual(['https://b.com/', 'https://c.com/']);
    expect(result.topDomains).toEqual(['b.com', 'c.com']);
  });

  it('preserves the provider\'s own order (no re-sort) among organic items', () => {
    const resp = serpResp([
      { type: 'organic', url: 'https://third.com/', domain: 'third.com' },
      { type: 'organic', url: 'https://first.com/', domain: 'first.com' },
    ]);
    const result = mapSerpResponse(resp, 'k', '2026-01-01T00:00:00Z');
    expect(result.topUrls).toEqual(['https://third.com/', 'https://first.com/']);
  });

  it('normalizes and dedupes URLs and domains', () => {
    const resp = serpResp([
      { type: 'organic', url: 'HTTPS://Example.com:443/Tea/', domain: 'WWW.Example.com' },
      { type: 'organic', url: 'https://example.com/Tea/', domain: 'example.com' },
    ]);
    const result = mapSerpResponse(resp, 'k', '2026-01-01T00:00:00Z');
    expect(result.topUrls).toHaveLength(1);
    expect(result.topDomains).toHaveLength(1);
    expect(result.topDomains[0]).toBe('example.com');
  });

  it('drops organic items with a non-http(s)/malformed URL', () => {
    const resp = serpResp([{ type: 'organic', url: 'not a url', domain: 'x.com' }]);
    const result = mapSerpResponse(resp, 'k', '2026-01-01T00:00:00Z');
    expect(result.topUrls).toEqual([]);
  });

  it('handles an empty/absent wrapper gracefully', () => {
    const resp: DataForSeoTaskResponse<DataForSeoSerpResultWrapper> = { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result: null }] };
    const result = mapSerpResponse(resp, 'k', '2026-01-01T00:00:00Z');
    expect(result.topUrls).toEqual([]);
    expect(result.topDomains).toEqual([]);
  });

  it('collects the aggregate resultTypes present on the page (not per-URL)', () => {
    const resp = serpResp([
      { type: 'featured_snippet', url: 'https://a.com/', domain: 'a.com' },
      { type: 'organic', url: 'https://b.com/', domain: 'b.com' },
    ]);
    const result = mapSerpResponse(resp, 'k', '2026-01-01T00:00:00Z');
    expect(result.resultTypes.sort()).toEqual(['featured_snippet', 'organic']);
  });
});
