import { isSeedDiscoveryDue, classifyKeywordMetricAge, classifySerpAge } from '../../../src/modules/seo/market/services/evidence-freshness.service';
import { ISerpSnapshot } from '../../../src/modules/seo/market/models/search-keyword.model';

const NOW = new Date('2026-06-01T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('isSeedDiscoveryDue', () => {
  it('is due when never discovered', () => {
    expect(isSeedDiscoveryDue([], 'dataforseo', NOW)).toBe(true);
  });
  it('is not due within 30 days', () => {
    expect(isSeedDiscoveryDue([{ provider: 'dataforseo', lastDiscoveredAt: daysAgo(10) }], 'dataforseo', NOW)).toBe(false);
  });
  it('is due past 30 days', () => {
    expect(isSeedDiscoveryDue([{ provider: 'dataforseo', lastDiscoveredAt: daysAgo(31) }], 'dataforseo', NOW)).toBe(true);
  });
});

describe('classifyKeywordMetricAge', () => {
  it('fresh <=30d, stale-but-usable 31-90d, too-old >90d, unknown when null', () => {
    expect(classifyKeywordMetricAge(daysAgo(30), NOW)).toBe('fresh');
    expect(classifyKeywordMetricAge(daysAgo(45), NOW)).toBe('stale-but-usable');
    expect(classifyKeywordMetricAge(daysAgo(91), NOW)).toBe('too-old');
    expect(classifyKeywordMetricAge(null, NOW)).toBe('unknown');
  });
});

describe('classifySerpAge — use-case-specific max age, exact context match', () => {
  const baseSnapshot: ISerpSnapshot = { provider: 'dataforseo-serp', locationCode: 2356, languageCode: 'en', device: 'desktop', depth: 10, schemaVersion: 1, retrievedAt: daysAgo(10), topUrls: [], topDomains: [] };
  const context = { provider: 'dataforseo-serp', locationCode: 2356, languageCode: 'en', device: 'desktop' as const, depth: 10 };

  it('a 10-day snapshot is stale for priority use but fresh for broad use', () => {
    expect(classifySerpAge(baseSnapshot, context, 'priority', NOW)).toBe('stale-but-usable');
    expect(classifySerpAge(baseSnapshot, context, 'broad', NOW)).toBe('fresh');
  });

  it('too-old past 60 days regardless of use case', () => {
    const old = { ...baseSnapshot, retrievedAt: daysAgo(61) };
    expect(classifySerpAge(old, context, 'broad', NOW)).toBe('too-old');
  });

  it('unknown when no snapshot exists', () => {
    expect(classifySerpAge(null, context, 'broad', NOW)).toBe('unknown');
  });

  it('context mismatch is never a cache hit, regardless of age', () => {
    const wrongDevice = { ...context, device: 'mobile' as const };
    expect(classifySerpAge(baseSnapshot, wrongDevice, 'broad', NOW)).toBe('unknown');
    const wrongLocation = { ...context, locationCode: 9999 };
    expect(classifySerpAge(baseSnapshot, wrongLocation, 'broad', NOW)).toBe('unknown');
  });
});
