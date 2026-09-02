import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { CatalogService, Product, Category } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';
import { ReviewStore, ProductRatingSummary } from '../../../core/services/review.store';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';
import { ScrollRevealDirective } from '../../../shared/directives/scroll-reveal.directive';

// ─ NgModel for two-way binding ─
class PriceFilter {
  value: number = 4000;
}

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductCardComponent, ScrollRevealDirective],
  templateUrl: './products-page.html',
  styleUrls: ['./products-page.scss'],
})
export class ProductsPageComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly reviewStore = inject(ReviewStore);

  // State
  readonly products = signal<Product[]>([]);
  readonly ratingSummaries = signal<Map<string, ProductRatingSummary>>(new Map());
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly totalProducts = signal(0);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly filterOpen = signal<string | null>(null);
  readonly hoveredProductId = signal<string | null>(null);

  // Filters
  readonly selectedCategory = signal<string | null>(null);
  readonly selectedRegion = signal<string | null>(null);
  readonly selectedBestTakenFor = signal<string | null>(null);
  readonly selectedWeight = signal<string | null>(null);
  readonly selectedTags = signal<string[]>([]);
  readonly sortBy = signal('createdAt:desc');
  readonly maxPrice = signal(4000); // Max price (multiple of 200)

  // Price range — using plain property for ngModel two-way binding
  priceRangeModel = new PriceFilter(); // Holds value for ngModel binding

  // Computed
  readonly allTags = computed(() => {
    const tags = new Set<string>();
    this.products().forEach((p) => p.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  });

  readonly isFiltered = computed(() =>
    !!this.selectedCategory() ||
    !!this.selectedRegion() ||
    !!this.selectedBestTakenFor() ||
    !!this.selectedWeight() ||
    this.selectedTags().length > 0 ||
    this.priceRangeModel.value < this.maxPrice()
  );

  readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.selectedCategory()) count++;
    count += this.selectedTags().length;
    if (this.priceRangeModel.value < this.maxPrice()) count++;
    return count;
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  constructor() {
    this.titleService.setTitle('All Products — Rajhans Tea');
  }

  ngOnInit(): void {
    this.meta.updateTag({
      name: 'description',
      content: 'Shop Rajhans Tea products — Assam, Darjeeling, Nilgiri and Dooars teas for everyday chai and premium tea drinking.',
    });

    let canonical = this.document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://rajhanstea.com/products/');

    // Load categories
    this.catalog.getCategoriesPublic().subscribe({
      next: (res) => this.categories.set(res.data),
    });

    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    const [sortField, sortDir] = this.sortBy().split(':');

    const params: Record<string, string | number | boolean | string[]> = {
      page: this.currentPage(),
      limit: 12,
      sortBy: sortField,
      sortOrder: sortDir,
    };

    if (this.selectedCategory()) params['categoryId'] = this.selectedCategory()!;
    if (this.selectedRegion()) params['region'] = this.selectedRegion()!;
    if (this.selectedBestTakenFor()) params['bestTakenFor'] = this.selectedBestTakenFor()!;
    if (this.selectedWeight()) params['weight'] = this.selectedWeight()!;
    if (this.priceRangeModel.value < this.maxPrice()) params['priceMax'] = this.priceRangeModel.value;
    if (this.selectedTags().length > 0) params['tags'] = this.selectedTags();

    this.catalog.getProductsPublic(params).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.totalProducts.set(res.meta.total);
        this.totalPages.set(res.meta.totalPages);
        this.loading.set(false);
        this.loadRatingSummaries(res.data.map((p) => p._id));
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private loadRatingSummaries(ids: string[]): void {
    const missing = ids.filter((id) => !this.ratingSummaries().has(id));
    if (!missing.length) return;
    this.reviewStore.getSummaries(missing).subscribe({
      next: (res) => {
        const map = new Map(this.ratingSummaries());
        for (const id of missing) if (!map.has(id)) map.set(id, { productId: id, averageRating: 0, totalReviews: 0 });
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

  selectCategory(catId: string | null): void {
    this.selectedCategory.set(catId);
    this.filterOpen.set(null);
    this.currentPage.set(1);
    this.loadProducts();
  }

  selectRegion(region: string | null): void {
    this.selectedRegion.set(region);
    this.filterOpen.set(null);
    this.currentPage.set(1);
    this.loadProducts();
  }

  selectBestTakenFor(time: string | null): void {
    this.selectedBestTakenFor.set(time);
    this.filterOpen.set(null);
    this.currentPage.set(1);
    this.loadProducts();
  }

  toggleFilterDropdown(filterName: string): void {
    this.filterOpen.set(this.filterOpen() === filterName ? null : filterName);
  }

  applyPriceFilter(): void {
    this.currentPage.set(1);
    this.loadProducts();
  }

  onPriceRangeChange(): void {
    this.currentPage.set(1);
    this.loadProducts();
  }

  getPriceRangeValue(): number {
    return this.priceRangeModel.value;
  }

  getMaxPriceValue(): number {
    return this.maxPrice();
  }

  toggleTag(tag: string): void {
    const current = this.selectedTags();
    if (current.includes(tag)) {
      this.selectedTags.set(current.filter((t) => t !== tag));
    } else {
      this.selectedTags.set([...current, tag]);
    }
    this.currentPage.set(1);
    this.loadProducts();
  }

  selectWeight(weight: string | null): void {
    if (weight === null) {
      this.selectedWeight.set(null);
    } else {
      this.selectedWeight.set(this.selectedWeight() === weight ? null : weight);
    }
    this.filterOpen.set(null);
    this.currentPage.set(1);
    this.loadProducts();
  }

  clearFilters(): void {
    this.selectedCategory.set(null);
    this.selectedRegion.set(null);
    this.selectedBestTakenFor.set(null);
    this.selectedWeight.set(null);
    this.selectedTags.set([]);
    this.priceRangeModel.value = this.maxPrice();
    this.currentPage.set(1);
    this.loadProducts();
    this.filterOpen.set(null);
  }

  onSort(value: string): void {
    this.sortBy.set(value);
    this.currentPage.set(1);
    this.loadProducts();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  addToCart(payload: { event: Event; variantId?: string }, productId: string): void {
    payload.event.preventDefault();
    payload.event.stopPropagation();
    this.cartStore.addItem(productId, 1, payload.variantId);
  }

  toggleWishlist(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartStore.toggleWishlist(productId);
  }

  isWishlisted(productId: string): boolean {
    return this.cartStore.wishlistIds().has(productId);
  }

  setHovering(productId: string, isHovering: boolean): void {
    this.hoveredProductId.set(isHovering ? productId : null);
  }

  isHovering(productId: string): boolean {
    return this.hoveredProductId() === productId;
  }

  goToProduct(product: Product): void {
    window.location.href = `/product/${product.slug}`;
  }

  buyNow(product: Product, payload: { event: Event; variantId?: string }): void {
    payload.event.stopPropagation();
    const variant = payload.variantId ? product.variants?.find(v => v._id === payload.variantId) : undefined;
    this.cartStore.buyNowItem(product, 1, variant);
    window.location.href = `/checkout`;
  }
}
