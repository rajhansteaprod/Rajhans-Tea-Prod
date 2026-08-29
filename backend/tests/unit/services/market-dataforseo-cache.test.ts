import { partitionByFreshness } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.cache';
import { SearchKeyword } from '../../../src/modules/seo/market/models/search-keyword.model';
import { SearchKeywordMetric } from '../../../src/modules/seo/market/models/search-keyword-metric.model';

jest.mock('../../../src/modules/seo/market/models/search-keyword.model', () => ({
  SearchKeyword: { findOne: jest.fn() },
}));
jest.mock('../../../src/modules/seo/market/models/search-keyword-metric.model', () => ({
  SearchKeywordMetric: { findOne: jest.fn() },
}));

const market = { country: 'IN', language: 'en' };

function chain(result: unknown) {
  return { lean: () => ({ exec: async () => result }), sort: () => ({ lean: () => ({ exec: async () => result }) }) };
}

describe('partitionByFreshness', () => {
  beforeEach(() => jest.resetAllMocks());

  it('treats a keyword with no SearchKeyword doc yet as stale', async () => {
    (SearchKeyword.findOne as jest.Mock).mockReturnValue(chain(null));
    const { fresh, stale } = await partitionByFreshness(['assam tea'], market);
    expect(fresh).toEqual([]);
    expect(stale).toEqual(['assam tea']);
  });

  it('treats a keyword with no recent metric as stale', async () => {
    (SearchKeyword.findOne as jest.Mock).mockReturnValue(chain({ _id: 'kw1' }));
    (SearchKeywordMetric.findOne as jest.Mock).mockReturnValue(chain(null));
    const { stale } = await partitionByFreshness(['assam tea'], market);
    expect(stale).toEqual(['assam tea']);
  });

  it('reuses a fresh cached metric instead of requiring a provider call', async () => {
    (SearchKeyword.findOne as jest.Mock).mockReturnValue(chain({ _id: 'kw1' }));
    (SearchKeywordMetric.findOne as jest.Mock).mockReturnValue(
      chain({ searchVolume: 500, cpc: { value: 0.3, currency: 'USD' }, paidCompetition: 'low', paidCompetitionIndex: 0.2 }),
    );
    const { fresh, stale } = await partitionByFreshness(['assam tea'], market);
    expect(stale).toEqual([]);
    expect(fresh).toEqual([{ keyword: 'assam tea', searchVolume: 500, cpc: { value: 0.3, currency: 'USD' }, paidCompetition: 'low', paidCompetitionIndex: 0.2 }]);
  });
});
