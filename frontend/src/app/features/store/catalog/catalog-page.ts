import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { CATALOG_SEO, breadcrumbJsonLd, injectJsonLd } from '../../../core/seo/seo-content';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';
import { CatalogService, VariantOption } from '../../../core/services/catalog.service';
import { ReviewStore, ProductRatingSummary } from '../../../core/services/review.store';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ScrollRevealDirective } from '../../../shared/directives/scroll-reveal.directive';
import { trackPixelCustomEvent } from '../../../core/utils/meta-pixel';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, ButtonComponent, ScrollRevealDirective],
  templateUrl: './catalog-page.html',
  styleUrls: ['./catalog-page.scss'],
})
export class CatalogPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly cart = inject(CartStore);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly reviewStore = inject(ReviewStore);
  private readonly document = inject(DOCUMENT);

  categoryName = '';
  readonly hoveringProducts = signal<Set<string>>(new Set());
  readonly ratingSummaries = signal<Map<string, ProductRatingSummary>>(new Map());

  constructor() {
    // Fetch real rating summaries whenever the visible result set changes
    effect(() => {
      const ids = this.store.results().map((p: any) => p._id);
      const missing = ids.filter((id: string) => !this.ratingSummaries().has(id));
      if (missing.length) this.loadRatingSummaries(missing);
    });
  }

  private loadRatingSummaries(ids: string[]): void {
    this.reviewStore.getSummaries(ids).subscribe({
      next: (res) => {
        const map = new Map(this.ratingSummaries());
        for (const id of ids) if (!map.has(id)) map.set(id, { productId: id, averageRating: 0, totalReviews: 0 });
        for (const s of res.data || []) map.set(s.productId, s);
        this.ratingSummaries.set(map);
      },
      error: () => { /* ratings are non-critical */ },
    });
  }

  ratingFor(productId: string): number {
    return this.ratingSummaries().get(productId)?.averageRating ?? 0;
  }

  reviewCountFor(productId: string): number {
    return this.ratingSummaries().get(productId)?.totalReviews ?? 0;
  }

  // Variant option facet filters
  readonly variantOptions = signal<VariantOption[]>([]);
  readonly selectedValues = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.catalog.getVariantOptionsPublic().subscribe({
      next: (res) => this.variantOptions.set(res.data || []),
      error: () => { /* filters are optional */ },
    });

    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.categoryName = slug?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || '';

      // Unique per-category title + meta description (falls back to the derived
      // name for any category without curated copy).
      const seo = CATALOG_SEO[slug];
      this.titleService.setTitle(seo?.title || `${this.categoryName || 'Catalog'} — Rajhans Tea`);
      if (seo?.description) this.meta.updateTag({ name: 'description', content: seo.description });

      // Additive BreadcrumbList JSON-LD: Home → Category (canonical URLs).
      if (slug) {
        injectJsonLd(
          this.document,
          'breadcrumb-jsonld',
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: this.categoryName || 'Catalog', url: `/catalog/${slug}/` },
          ]),
        );
      }
      // Changing category resets any active facet selection
      this.selectedValues.set(new Set());
      this.store.search('', { categorySlug: slug });
      // Meta Pixel: category browsed. `ViewCategory` has no Meta standard-event
      // equivalent, so it is fired as a custom event.
      trackPixelCustomEvent('ViewCategory', { content_category: this.categoryName || slug });
    });
  }

  isValueSelected(value: string): boolean {
    return this.selectedValues().has(value);
  }

  toggleValue(value: string): void {
    const next = new Set(this.selectedValues());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.selectedValues.set(next);

    const values = Array.from(next);
    if (values.length) this.store.applyFilter('optionValues', values);
    else this.store.removeFilter('optionValues');
  }

  clearFilters(): void {
    this.selectedValues.set(new Set());
    this.store.removeFilter('optionValues');
  }

  setHovering(productId: string, isHovering: boolean): void {
    const hoveringSet = new Set(this.hoveringProducts());
    if (isHovering) {
      hoveringSet.add(productId);
    } else {
      hoveringSet.delete(productId);
    }
    this.hoveringProducts.set(hoveringSet);
  }

  isHovering(productId: string): boolean {
    return this.hoveringProducts().has(productId);
  }

  isWishlisted(productId: string): boolean {
    return false;
  }

  toggleWishlist(product: any, event: Event): void {
    event.stopPropagation();
  }

  addToCart(product: any, event: { event: Event; variantId?: string }): void {
    event.event.preventDefault();
    event.event.stopPropagation();
    // Honor the weight/variant the user picked on the card; fall back to the
    // first variant only if none was selected.
    const variantId = event.variantId ?? product.variants?.[0]?._id;
    this.cart.addItem(product._id, 1, variantId);
  }

  buyNow(product: any, event: { event: Event; variantId?: string }): void {
    event.event.preventDefault();
    event.event.stopPropagation();
    const variant = event.variantId ? product.variants?.find((v: any) => v._id === event.variantId) : undefined;
    this.cart.buyNowItem(product, 1, variant);
    this.router.navigate(['/checkout']);
  }

  goToProduct(product: any): void {
    this.router.navigate(['/product', product.slug]);
  }

  goToAllProducts(): void {
    this.router.navigate(['/products']);
  }
}
