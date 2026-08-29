import { chunk, diffMissingMetrics, mapKeywordIdeasResponse, mapSearchVolumeResponse } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.mapper';
import {
  DataForSeoKeywordIdeaItem,
  DataForSeoKeywordIdeasResultWrapper,
  DataForSeoSearchVolumeItem,
  DataForSeoTaskResponse,
} from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.types';

function taskResp<T>(result: T[]): DataForSeoTaskResponse<T> {
  return { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result }] };
}

/**
 * Realistic Keyword Ideas fixture: tasks[0].result[0].items[] — `result` is a
 * ONE-element array holding a wrapper object, NOT the keyword items directly.
 * This shape is what makes the 4b.2 `tasks[0].result[]` regression reproducible;
 * every keyword-ideas test below must go through this helper, never `taskResp`.
 */
function keywordIdeasResp(items: DataForSeoKeywordIdeaItem[] | null, seedKeywords: string[] = ['tea']): DataForSeoTaskResponse<DataForSeoKeywordIdeasResultWrapper> {
  const wrapper: DataForSeoKeywordIdeasResultWrapper = {
    seed_keywords: seedKeywords,
    location_code: 2356,
    language_code: 'en',
    total_count: items?.length ?? 0,
    items_count: items?.length ?? 0,
    items,
  };
  return { status_code: 20000, status_message: 'Ok.', tasks: [{ status_code: 20000, status_message: 'Ok.', result: [wrapper] }] };
}

describe('mapKeywordIdeasResponse', () => {
  it('reads keyword ideas from the NESTED tasks[0].result[0].items[] path, not tasks[0].result[]', () => {
    const raw = keywordIdeasResp([
      { keyword: 'assam tea', keyword_info: { search_volume: 720, cpc: 0.5, competition: 0.3, competition_level: 'LOW' } },
      { keyword: 'assam ctc tea', keyword_info: { search_volume: 320, cpc: 0.4, competition: 0.2, competition_level: 'LOW' } },
    ]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.keyword)).toEqual(['assam tea', 'assam ctc tea']);
  });

  it('maps keyword + embedded inline metrics (no second call needed)', () => {
    const raw = keywordIdeasResp([{ keyword: 'assam tea', keyword_info: { search_volume: 720, cpc: 0.5, competition: 0.3, competition_level: 'LOW' } }]);
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
    const raw = keywordIdeasResp([{ keyword: 'obscure phrase', keyword_info: { search_volume: 0, cpc: null, competition: null, competition_level: null } }]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results[0].inlineMetrics?.searchVolume).toBe(0);
    expect(results[0].inlineMetrics?.cpc).toBeNull();
  });

  it('maps missing/null provider fields to null (UNKNOWN), never fabricates zero', () => {
    const raw = keywordIdeasResp([{ keyword: 'no data keyword', keyword_info: null }]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results[0].inlineMetrics).toBeNull();
  });

  it('drops malformed items with no keyword', () => {
    const raw = keywordIdeasResp([{ keyword: '', keyword_info: null } as unknown as DataForSeoKeywordIdeaItem]);
    const { results } = mapKeywordIdeasResponse(raw);
    expect(results).toHaveLength(0);
  });

  it('handles a null items array inside the wrapper gracefully', () => {
    const raw = keywordIdeasResp(null);
    expect(mapKeywordIdeasResponse(raw).results).toEqual([]);
  });

  it('handles an empty/absent task result gracefully', () => {
    const raw: DataForSeoTaskResponse<DataForSeoKeywordIdeasResultWrapper> = {
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [{ status_code: 20000, status_message: 'Ok.', result: null }],
    };
    expect(mapKeywordIdeasResponse(raw).results).toEqual([]);
  });

  it('does NOT read keyword items directly off tasks[0].result[] (regression guard for the 4b.2 bug)', () => {
    // Malformed/legacy-shaped response: items placed directly on result[], no wrapper/items[].
    const malformed = {
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [{ status_code: 20000, status_message: 'Ok.', result: [{ keyword: 'assam tea' }] as unknown as DataForSeoKeywordIdeasResultWrapper[] }],
    };
    // Because result[0] is treated as the wrapper, `.items` on a bare keyword object is undefined -> no results.
    expect(mapKeywordIdeasResponse(malformed).results).toEqual([]);
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

describe('chunk', () => {
  it('keeps a batch under the max size in a single chunk', () => {
    expect(chunk(['a', 'b', 'c'], 200)).toEqual([['a', 'b', 'c']]);
  });

  it('splits a batch exceeding the max size into provider-sized chunks', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const out = chunk(items, 200);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(200);
    expect(out[1]).toHaveLength(50);
  });

  it('handles an exact multiple with no trailing empty chunk', () => {
    const items = Array.from({ length: 400 }, (_, i) => i);
    expect(chunk(items, 200)).toHaveLength(2);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 200)).toEqual([]);
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
