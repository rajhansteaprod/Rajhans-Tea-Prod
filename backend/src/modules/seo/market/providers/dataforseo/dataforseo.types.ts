/** Minimal raw DataForSEO v3 response shapes actually consumed by the mapper.
 * Intentionally loose (optional/nullable) — DataForSEO's full schema has many
 * fields we don't use; we only type what we read. */

export interface DataForSeoTaskResponse<TResult> {
  status_code: number;
  status_message: string;
  tasks?: {
    status_code: number;
    status_message: string;
    result?: TResult[] | null;
  }[];
}

export interface DataForSeoKeywordInfo {
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  competition_level?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

/** POST /v3/dataforseo_labs/google/keyword_ideas/live result item. */
export interface DataForSeoKeywordIdeaItem {
  keyword: string;
  keyword_info?: DataForSeoKeywordInfo | null;
}

/**
 * POST /v3/dataforseo_labs/google/keyword_ideas/live's `result` array holds ONE
 * wrapper object (not the keyword items directly) — the actual keyword ideas are
 * nested under `items`. Real response shape:
 *   tasks[0].result[0].items[]
 * NOT tasks[0].result[] (that was the 4b.2 bug — result[] IS the items wrapper
 * array of length 1, each entry describing the whole task's result set).
 */
export interface DataForSeoKeywordIdeasResultWrapper {
  seed_keywords?: string[] | null;
  location_code?: number | null;
  language_code?: string | null;
  total_count?: number | null;
  items_count?: number | null;
  items?: DataForSeoKeywordIdeaItem[] | null;
}

/** POST /v3/dataforseo_labs/google/keyword_ideas/live task payload (one task per
 * call — up to 200 seed `keywords` batched into it, per DataForSEO Labs limits). */
export interface DataForSeoKeywordIdeasTaskPayload {
  keywords: string[];
  location_code: number;
  language_code: string;
  limit: number;
  offset?: number;
  include_serp_info: boolean;
  include_clickstream_data: boolean;
}

/** POST /v3/keywords_data/google_ads/search_volume/live result item. */
export interface DataForSeoSearchVolumeItem {
  keyword: string;
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  competition_level?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}
