import { diffMissingMetrics, mapKeywordIdeasResponse, mapSearchVolumeResponse } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.mapper';
import { DataForSeoKeywordIdeaItem, DataForSeoSearchVolumeItem, DataForSeoTaskResponse } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.types';

function taskResp<T>(result: T[]): DataForSeoTaskResponse<T> {
  return { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result }] };
}

describe('mapKeywordIdeasResponse', () => {
  it('maps keyword + embedded inline metrics (no second call needed)', () => {
    const raw = taskResp<DataForSeoKeywordIdeaItem>([
      { keyword: 'assam tea', keyword_info: { search_volume: 720, cpc: 0.5, competition: 0.3, competition_level: 'LOW' } },
    ]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results).toHaveLength(1);
    expect(results[0].keyword).toBe('assam tea');
    expect(results[0].inlineMetrics).toEqual({
      keyword: 'assam tea',
      searchVolume: 720,
      cpc: { value: 0.5, currency: 'USD' },
      paidCompetition: 'low',
      paidCompetitionIndex: 0.3,
    });
  });

  it('preserves a genuine zero search volume, does not coerce it to null', () => {
    const raw = taskResp<DataForSeoKeywordIdeaItem>([{ keyword: 'obscure phrase', keyword_info: { search_volume: 0, cpc: null, competition: null, competition_level: null } }]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results[0].inlineMetrics?.searchVolume).toBe(0);
    expect(results[0].inlineMetrics?.cpc).toBeNull();
  });

  it('maps missing/null provider fields to null (UNKNOWN), never fabricates zero', () => {
    const raw = taskResp<DataForSeoKeywordIdeaItem>([{ keyword: 'no data keyword', keyword_info: null }]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results[0].inlineMetrics).toBeNull();
  });

  it('drops malformed items with no keyword', () => {
    const raw = taskResp<DataForSeoKeywordIdeaItem>([{ keyword: '', keyword_info: null } as unknown as DataForSeoKeywordIdeaItem]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results).toHaveLength(0);
  });

  it('handles an empty/absent task result gracefully', () => {
    const raw: DataForSeoTaskResponse<DataForSeoKeywordIdeaItem> = { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result: null }] };
    expect(mapKeywordIdeasResponse(raw).results).toEqual([]);
  });
});

describe('mapSearchVolumeResponse', () => {
  it('maps CPC/paidCompetition as PAID signals, never touching organicDifficulty', () => {
    const raw = taskResp<DataForSeoSearchVolumeItem>([{ keyword: 'ctc tea', search_volume: 1200, cpc: 1.2, competition: 0.8, competition_level: 'HIGH' }]);
    const [m] = mapSearchVolumeResponse(raw);
    expect(m).toEqual({ keyword: 'ctc tea', searchVolume: 1200, cpc: { value: 1.2, currency: 'USD' }, paidCompetition: 'high', paidCompetitionIndex: 0.8 });
    expect(m).not.toHaveProperty('organicDifficulty');
  });
});

describe('diffMissingMetrics', () => {
  it('flags requested keywords absent from results as missing (UNKNOWN, not rejected)', () => {
    const missing = diffMissingMetrics(['a', 'b', 'c'], [{ keyword: 'a', searchVolume: 10, cpc: null, paidCompetition: null, paidCompetitionIndex: null }]);
    expect(missing).toEqual(['b', 'c']);
  });

  it('returns empty when every keyword got a result', () => {
    const missing = diffMissingMetrics(['a'], [{ keyword: 'a', searchVolume: null, cpc: null, paidCompetition: null, paidCompetitionIndex: null }]);
    expect(missing).toEqual([]);
  });
});
