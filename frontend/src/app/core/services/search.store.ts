import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Product } from './catalog.service';

export interface SearchFacets {
  categories: { _id: string; name: string; slug: string; count: number }[];
  priceRange: { min: number; max: number };
  tags: { tag: string; count: number }[];
}

export interface SearchFilters {
  categoryId?: string;
  categorySlug?: string;
  collectionId?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  tags?: string[];
}

export interface AutocompleteSuggestion {
  type: 'product' | 'category';
  name: string;
  slug: string;
  image?: string;
}

type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc' | 'featured';

interface SearchResponse {
  success: boolean;
  data: Product[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  facets: SearchFacets;
  query: string;
}

@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // ─── Signals ───────────────────────────────────────────────────────────────

  private readonly _query = signal('');
  private readonly _results = signal<Product[]>([]);
  private readonly _facets = signal<SearchFacets | null>(null);
  private readonly _meta = signal<{ page: number; totalPages: number; total: number } | null>(null);
  private readonly _loading = signal(false);
  private readonly _filters = signal<SearchFilters>({});
  private readonly _sort = signal<SortOption>('relevance');
  private readonly _suggestions = signal<AutocompleteSuggestion[]>([]);
  private readonly _suggestionsLoading = signal(false);
  private readonly _suggestionsOpen = signal(false);

  readonly query = this._query.asReadonly();
  readonly results = this._results.asReadonly();
  readonly facets = this._facets.asReadonly();
  readonly meta = this._meta.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly sort = this._sort.asReadonly();
  readonly suggestions = this._suggestions.asReadonly();
  readonly suggestionsLoading = this._suggestionsLoading.asReadonly();
  readonly suggestionsOpen = this._suggestionsOpen.asReadonly();

  readonly hasResults = computed(() => this._results().length > 0);
  readonly isFiltered = computed(() => Object.keys(this._filters()).length > 0);
  readonly resultCount = computed(() => this._meta()?.total ?? 0);

  private autocompleteTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Search ────────────────────────────────────────────────────────────────

  search(q: string, filters?: SearchFilters, sort?: SortOption, page = 1): void {
    this._query.set(q);
    if (filters) this._filters.set(filters);
    if (sort) this._sort.set(sort);
    this._loading.set(true);
    this.closeSuggestions();

    let url = `${this.api}/search?q=${encodeURIComponent(q)}&page=${page}&limit=20&sort=${this._sort()}`;
    const f = this._filters();
    if (f.categoryId) url += `&categoryId=${f.categoryId}`;
    if (f.categorySlug) url += `&categorySlug=${f.categorySlug}`;
    if (f.collectionId) url += `&collectionId=${f.collectionId}`;
    if (f.priceMin !== undefined) url += `&priceMin=${f.priceMin}`;
    if (f.priceMax !== undefined) url += `&priceMax=${f.priceMax}`;
    if (f.inStock) url += `&inStock=true`;
    if (f.tags && f.tags.length) url += `&tags=${f.tags.join(',')}`;

    this.http.get<SearchResponse>(url).subscribe({
      next: (res) => {
        this._results.set(res.data);
        this._facets.set(res.facets);
        this._meta.set(res.meta ? { page: res.meta.page, totalPages: res.meta.totalPages, total: res.meta.total } : null);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  autocomplete(q: string): void {
    if (this.autocompleteTimer) clearTimeout(this.autocompleteTimer);
    if (!q || q.trim().length < 2) {
      this._suggestions.set([]);
      this._suggestionsOpen.set(false);
      return;
    }

    this._suggestionsLoading.set(true);
    this.autocompleteTimer = setTimeout(() => {
      this.http
        .get<{ data: AutocompleteSuggestion[] }>(`${this.api}/search/autocomplete?q=${encodeURIComponent(q)}&limit=8`)
        .subscribe({
          next: (res) => {
            this._suggestions.set(res.data);
            this._suggestionsOpen.set(res.data.length > 0);
            this._suggestionsLoading.set(false);
          },
          error: () => this._suggestionsLoading.set(false),
        });
    }, 300);
  }

  closeSuggestions(): void {
    this._suggestionsOpen.set(false);
  }

  // ─── Filters ───────────────────────────────────────────────────────────────

  applyFilter(key: keyof SearchFilters, value: unknown): void {
    this._filters.update((f) => ({ ...f, [key]: value }));
    this.search(this._query(), undefined, undefined, 1);
  }

  removeFilter(key: keyof SearchFilters): void {
    this._filters.update((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
    this.search(this._query(), undefined, undefined, 1);
  }

  clearAllFilters(): void {
    this._filters.set({});
    this.search(this._query(), undefined, undefined, 1);
  }

  setSort(sort: SortOption): void {
    this._sort.set(sort);
    this.search(this._query(), undefined, sort, 1);
  }

  goToPage(page: number): void {
    this.search(this._query(), undefined, undefined, page);
  }
}
