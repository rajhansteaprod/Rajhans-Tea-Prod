import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="catalog-page">
      <nav class="breadcrumbs"><a routerLink="/">Home</a> / <span>{{ categoryName || 'All Products' }}</span></nav>
      <h1 class="page-title">{{ categoryName || 'All Products' }}</h1>
      <p class="result-count">{{ store.resultCount() }} products</p>

      @if (store.loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (!store.hasResults()) {
        <div class="empty">No products in this category.</div>
      } @else {
        <div class="product-grid">
          @for (p of store.results(); track p._id) {
            <a [routerLink]="'/product/' + p.slug" class="product-card">
              <div class="card-image">
                @if (p.images?.[0]) { <img [src]="p.images[0]" [alt]="p.name" loading="lazy" /> }
                @else { <div class="img-ph"></div> }
              </div>
              <div class="card-body">
                <p class="card-name">{{ p.name }}</p>
                <p class="card-price">₹{{ p.basePrice | number:'1.0-0' }}</p>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .catalog-page { max-width:1100px; margin:0 auto; padding: $space-lg; }
    .breadcrumbs { font-size: $font-size-xs; color: $color-text-tertiary; margin-bottom: $space-md; a { color: $color-text-tertiary; text-decoration:none; &:hover { color: $color-primary; } } }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .result-count { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }
    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:32px; height:32px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxxl; }
    .product-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: $space-lg; }
    @media(max-width:768px) { .product-grid { grid-template-columns: repeat(2,1fr); } }
    .product-card { background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; overflow:hidden; text-decoration:none; transition: all $transition-normal;
      &:hover { border-color: $color-border; box-shadow: $shadow-lg; transform:translateY(-2px); }
    }
    .card-image { aspect-ratio:1; background: $color-bg-secondary; overflow:hidden;
      img { width:100%; height:100%; object-fit:cover; transition: transform $transition-slow; }
      &:hover img { transform:scale(1.04); }
    }
    .img-ph { width:100%; height:100%; background: $color-bg-secondary; }
    .card-body { padding: $space-md; }
    .card-name { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .card-price { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-primary; margin:0; }
  `],
})
export class CatalogPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  categoryName = '';

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.categoryName = slug?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || '';
      this.titleService.setTitle(`${this.categoryName || 'Catalog'} — Rajhans Ecommerce`);
      this.store.search('', { categorySlug: slug });
    });
  }
}
