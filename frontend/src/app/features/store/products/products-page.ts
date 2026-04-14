import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { CatalogService, Product, Category } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';

// ─ NgModel for two-way binding ─
class PriceFilter {
  value: number = 4000;
}

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products-page.html',
  styleUrls: ['./products-page.scss'],
})
export class ProductsPageComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly titleService = inject(Title);

  // State
  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly totalProducts = signal(0);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly filterOpen = signal(false);
  readonly hoveredProductId = signal<string | null>(null);

  // Filters
  readonly selectedCategory = signal<string | null>(null);
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
    // Load categories
    this.catalog.getCategoriesPublic().subscribe({
      next: (res) => this.categories.set(res.data),
    });

    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    const [sortField, sortDir] = this.sortBy().split(':');

    const params: Record<string, string | number | boolean> = {
      page: this.currentPage(),
      limit: 12,
      sortBy: sortField,
      sortOrder: sortDir,
    };

    if (this.selectedCategory()) params['categoryId'] = this.selectedCategory()!;
    if (this.priceRangeModel.value < this.maxPrice()) params['priceMax'] = this.priceRangeModel.value;

    this.catalog.getProductsPublic(params).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.totalProducts.set(res.meta.total);
        this.totalPages.set(res.meta.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  selectCategory(catId: string | null): void {
    this.selectedCategory.set(catId);
    this.currentPage.set(1);
    this.loadProducts();
    this.filterOpen.set(false);
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

  clearFilters(): void {
    this.selectedCategory.set(null);
    this.selectedTags.set([]);
    this.priceRangeModel.value = this.maxPrice();
    this.currentPage.set(1);
    this.loadProducts();
    this.filterOpen.set(false);
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

  addToCart(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartStore.addItem(productId, 1);
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

  getRating(): number {
    return 5; // Default rating - can be updated based on product data
  }

  getReviewCount(): number {
    return 0; // Default review count - can be updated based on product data
  }

  goToProduct(product: Product): void {
    // Navigate to product detail page
    window.location.href = `/product/${product.slug}`;
  }

  buyNow(product: Product, event: Event): void {
    event.stopPropagation();
    this.addToCart(event, product._id);
    // Could also navigate to checkout, but for now just add to cart
    window.location.href = `/product/${product.slug}`;
  }
}
