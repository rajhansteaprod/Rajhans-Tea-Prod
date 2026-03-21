import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="search-page">
      <!-- Header -->
      <div class="search-header">
        <div class="search-info">
          @if (store.query()) {
            <h1 class="search-title">Results for "{{ store.query() }}"</h1>
          } @else {
            <h1 class="search-title">Browse Products</h1>
          }
          <span class="result-count">{{ store.resultCount() }} products found</span>
        </div>
        <div class="sort-bar">
          <select class="sort-select" [ngModel]="store.sort()" (ngModelChange)="store.setSort($event)">
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="newest">Newest</option>
            <option value="name_asc">Name A-Z</option>
            <option value="featured">Featured</option>
          </select>
        </div>
      </div>

      <div class="search-layout">
        <!-- Filter Sidebar -->
        <aside class="filter-sidebar">
          @if (store.isFiltered()) {
            <button class="btn-clear-filters" (click)="store.clearAllFilters()">Clear all filters</button>
          }

          <!-- Category Filter -->
          @if (store.facets()?.categories?.length) {
            <div class="filter-group">
              <h3 class="filter-title">Category</h3>
              @for (cat of store.facets()!.categories; track cat._id) {
                <label class="filter-option">
                  <input type="radio" name="category" [value]="cat._id"
                    [checked]="store.filters().categoryId === cat._id"
                    (change)="store.applyFilter('categoryId', cat._id)" />
                  <span class="filter-label">{{ cat.name }}</span>
                  <span class="filter-count">{{ cat.count }}</span>
                </label>
              }
              @if (store.filters().categoryId) {
                <button class="btn-clear-filter" (click)="store.removeFilter('categoryId')">Clear</button>
              }
            </div>
          }

          <!-- Price Range -->
          @if (store.facets()?.priceRange) {
            <div class="filter-group">
              <h3 class="filter-title">Price Range</h3>
              <div class="price-inputs">
                <input type="number" placeholder="Min" [(ngModel)]="priceMin" min="0" />
                <span>—</span>
                <input type="number" placeholder="Max" [(ngModel)]="priceMax" min="0" />
                <button class="btn-apply-price" (click)="applyPriceFilter()">Go</button>
              </div>
              <p class="price-range-hint">₹{{ store.facets()!.priceRange.min | number:'1.0-0' }} — ₹{{ store.facets()!.priceRange.max | number:'1.0-0' }}</p>
            </div>
          }

          <!-- Tags -->
          @if (store.facets()?.tags?.length) {
            <div class="filter-group">
              <h3 class="filter-title">Tags</h3>
              <div class="tag-list">
                @for (tag of store.facets()!.tags.slice(0, 15); track tag.tag) {
                  <button class="tag-pill" [class.active]="isTagActive(tag.tag)" (click)="toggleTag(tag.tag)">
                    {{ tag.tag }} <span class="tag-count">{{ tag.count }}</span>
                  </button>
                }
              </div>
            </div>
          }

          <!-- In Stock -->
          <div class="filter-group">
            <label class="filter-option toggle">
              <input type="checkbox" [checked]="store.filters().inStock"
                (change)="store.filters().inStock ? store.removeFilter('inStock') : store.applyFilter('inStock', true)" />
              <span class="filter-label">In Stock Only</span>
            </label>
          </div>
        </aside>

        <!-- Results Grid -->
        <main class="results-area">
          @if (store.loading()) {
            <div class="loading"><div class="spinner"></div></div>
          } @else if (!store.hasResults()) {
            <div class="no-results">
              <div class="no-results-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
              <h2>No products found</h2>
              <p>Try different keywords or remove some filters</p>
              @if (store.isFiltered()) {
                <button class="btn-clear" (click)="store.clearAllFilters()">Clear all filters</button>
              }
            </div>
          } @else {
            <div class="product-grid">
              @for (product of store.results(); track product._id) {
                <div class="product-card">
                  @if (product.isFeatured) {
                    <span class="featured-badge">Featured</span>
                  }
                  <div class="card-image">
                    @if (product.images[0]) {
                      <img [src]="product.images[0]" [alt]="product.name" loading="lazy" />
                    } @else {
                      <div class="img-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        </svg>
                      </div>
                    }
                  </div>
                  <div class="card-body">
                    <p class="card-category">{{ product.category?.name || '' }}</p>
                    <p class="card-name">{{ product.name }}</p>
                    <p class="card-price">₹{{ product.basePrice | number:'1.0-0' }}</p>
                  </div>
                  <div class="card-actions">
                    <button class="btn-add-cart" (click)="addToCart(product._id)">Add to Cart</button>
                    <button class="btn-wishlist" (click)="toggleWishlist(product._id)" [class.active]="cartStore.isWishlisted(product._id)()">
                      <svg width="16" height="16" viewBox="0 0 24 24" [attr.fill]="cartStore.isWishlisted(product._id)() ? 'currentColor' : 'none'">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              }
            </div>

            <!-- Pagination -->
            @if (store.meta() && store.meta()!.totalPages > 1) {
              <div class="pagination">
                <button [disabled]="store.meta()!.page <= 1" (click)="store.goToPage(store.meta()!.page - 1)">← Prev</button>
                <span>Page {{ store.meta()!.page }} of {{ store.meta()!.totalPages }}</span>
                <button [disabled]="store.meta()!.page >= store.meta()!.totalPages" (click)="store.goToPage(store.meta()!.page + 1)">Next →</button>
              </div>
            }
          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;

    .search-page { max-width:1200px; margin:0 auto; padding: $space-lg; }
    .search-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: $space-xl; }
    .search-title { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .result-count { font-size: $font-size-sm; color: $color-text-tertiary; }
    .sort-select { padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; }

    .search-layout { display:grid; grid-template-columns:240px 1fr; gap: $space-xl; }
    @media(max-width:768px) { .search-layout { grid-template-columns:1fr; } .filter-sidebar { display:none; } }

    .filter-sidebar { display:flex; flex-direction:column; gap: $space-lg; }
    .filter-group { padding-bottom: $space-lg; border-bottom:1px solid $color-border-light; }
    .filter-title { font-size: $font-size-xs; font-weight: $font-weight-bold; color: $color-text-secondary; text-transform:uppercase; letter-spacing:.06em; margin:0 0 $space-sm; }
    .filter-option { display:flex; align-items:center; gap: $space-sm; padding: $space-xxs 0; font-size: $font-size-sm; color: $color-text-primary; cursor:pointer;
      input { cursor:pointer; }
      &.toggle { gap: $space-sm; }
    }
    .filter-label { flex:1; }
    .filter-count { font-size: $font-size-xs; color: $color-text-tertiary; background: $color-bg-secondary; padding:1px 6px; border-radius: $radius-full; }
    .btn-clear-filter { border:none; background:none; color: $color-primary; font-size: $font-size-xs; cursor:pointer; padding: $space-xxs 0; &:hover { text-decoration:underline; } }
    .btn-clear-filters { width:100%; padding: $space-xs; border:1px solid $color-error; border-radius: $radius-md; background:transparent; color: $color-error; font-size: $font-size-xs; cursor:pointer; margin-bottom: $space-sm; &:hover { background:rgba(192,57,43,.05); } }

    .price-inputs { display:flex; align-items:center; gap: $space-xs;
      input { width:70px; padding: $space-xs; border:1px solid $color-border; border-radius: $radius-sm; font-size: $font-size-xs; text-align:center; outline:none; &:focus { border-color: $color-primary; } }
      span { color: $color-text-tertiary; }
    }
    .btn-apply-price { padding: $space-xs $space-sm; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-sm; font-size: $font-size-xs; cursor:pointer; }
    .price-range-hint { font-size:10px; color: $color-text-disabled; margin: $space-xxs 0 0; }

    .tag-list { display:flex; flex-wrap:wrap; gap: $space-xxs; }
    .tag-pill { padding:2px $space-sm; border:1px solid $color-border; border-radius: $radius-full; background:transparent; font-size: $font-size-xs; cursor:pointer; transition: all $transition-fast; display:flex; align-items:center; gap:4px;
      &:hover { border-color: $color-primary; }
      &.active { background: $color-primary; color: $color-text-inverse; border-color: $color-primary; }
    }
    .tag-count { font-size:9px; opacity:.7; }

    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    .no-results { display:flex; flex-direction:column; align-items:center; gap: $space-md; padding: $space-xxxl 0; text-align:center;
      h2 { font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0; }
      p { font-size: $font-size-sm; color: $color-text-tertiary; margin:0; }
    }
    .no-results-icon { width:80px; height:80px; border-radius: $radius-xxl; background: $color-bg-secondary; display:flex; align-items:center; justify-content:center; color: $color-text-disabled; }
    .btn-clear { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; &:hover { border-color: $color-primary; color: $color-primary; } }

    .product-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-lg; }
    @media(max-width:992px) { .product-grid { grid-template-columns: repeat(2,1fr); } }
    @media(max-width:480px) { .product-grid { grid-template-columns:1fr; } }

    .product-card { position:relative; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; overflow:hidden; transition: all $transition-normal;
      &:hover { border-color: $color-border; box-shadow: $shadow-lg; transform:translateY(-2px); }
    }
    .featured-badge { position:absolute; top: $space-sm; left: $space-sm; padding:2px $space-sm; background: $color-primary; color: $color-text-inverse; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; z-index:1; }
    .card-image { aspect-ratio:1; background: $color-bg-secondary; overflow:hidden;
      img { width:100%; height:100%; object-fit:cover; transition: transform $transition-slow; }
      &:hover img { transform:scale(1.04); }
    }
    .img-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color: $color-text-disabled; }
    .card-body { padding: $space-md; }
    .card-category { font-size: $font-size-xs; color: $color-text-tertiary; margin:0 0 $space-xxs; text-transform:uppercase; letter-spacing:.04em; }
    .card-name { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-xs; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .card-price { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-primary; margin:0; }
    .card-actions { display:flex; gap: $space-xs; padding:0 $space-md $space-md; }
    .btn-add-cart { flex:1; padding: $space-sm; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast;
      &:hover { background: $color-primary-hover; }
    }
    .btn-wishlist { width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:1px solid $color-border; border-radius: $radius-md; background:transparent; cursor:pointer; color: $color-text-tertiary; transition: all $transition-fast;
      &:hover, &.active { color:#E74C3C; border-color:#E74C3C; }
    }

    .pagination { display:flex; align-items:center; justify-content:center; gap: $space-md; padding: $space-xl 0;
      button { padding: $space-xs $space-md; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; &:disabled { opacity:.4; cursor:not-allowed; } &:hover:not(:disabled) { border-color: $color-primary; color: $color-primary; } }
      span { font-size: $font-size-sm; color: $color-text-tertiary; }
    }
  `],
})
export class SearchPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  readonly cartStore = inject(CartStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  priceMin: number | null = null;
  priceMax: number | null = null;

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const q = params['q'] || '';
      const categorySlug = params['category'] || '';
      const filters: any = {};
      if (categorySlug) filters.categorySlug = categorySlug;
      this.store.search(q, filters, params['sort'] || 'relevance', parseInt(params['page'] || '1', 10));
    });
  }

  applyPriceFilter(): void {
    if (this.priceMin !== null) this.store.applyFilter('priceMin', this.priceMin);
    if (this.priceMax !== null) this.store.applyFilter('priceMax', this.priceMax);
  }

  isTagActive(tag: string): boolean {
    return this.store.filters().tags?.includes(tag) ?? false;
  }

  toggleTag(tag: string): void {
    const current = this.store.filters().tags || [];
    if (current.includes(tag)) {
      this.store.applyFilter('tags', current.filter((t) => t !== tag));
    } else {
      this.store.applyFilter('tags', [...current, tag]);
    }
  }

  addToCart(productId: string): void {
    this.cartStore.addItem(productId, 1);
  }

  toggleWishlist(productId: string): void {
    this.cartStore.toggleWishlist(productId);
  }
}
