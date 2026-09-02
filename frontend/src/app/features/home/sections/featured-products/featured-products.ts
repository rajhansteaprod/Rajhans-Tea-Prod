import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { CartStore } from '../../../../core/services/cart.store';
import { ReviewStore, ProductRatingSummary } from '../../../../core/services/review.store';
import { ProductCardComponent } from '../../../../shared/components/product-card/product-card';
import { ScrollRevealDirective } from '../../../../shared/directives/scroll-reveal.directive';

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, ScrollRevealDirective],
  templateUrl: './featured-products.html',
  styleUrls: ['./featured-products.scss'],
})
export class FeaturedProductsComponent implements OnInit {
  private catalog = inject(CatalogService);
  private router = inject(Router);
  readonly cart = inject(CartStore);
  private readonly reviewStore = inject(ReviewStore);

  readonly sections = signal<{ title: string; products: Product[] }[]>([]);
  readonly loading = signal(true);
  readonly hoveringProducts = signal<Set<string>>(new Set());
  readonly ratingSummaries = signal<Map<string, ProductRatingSummary>>(new Map());

  ngOnInit(): void {
    this.catalog.getHomepageSections().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.sections.set(res.data);
          const ids = res.data.flatMap((s: { products: Product[] }) => s.products.map((p) => p._id));
          this.loadRatingSummaries([...new Set(ids)]);
        } else {
          this.sections.set([]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.sections.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadRatingSummaries(ids: string[]): void {
    if (!ids.length) return;
    this.reviewStore.getSummaries(ids).subscribe({
      next: (res) => {
        const map = new Map(this.ratingSummaries());
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

  addToCart(product: Product, payload: { event: Event; variantId?: string }): void {
    payload.event.preventDefault();
    payload.event.stopPropagation();
    this.cart.addItem(product._id, 1, payload.variantId);
  }

  buyNow(product: Product, payload: { event: Event; variantId?: string }): void {
    payload.event.preventDefault();
    payload.event.stopPropagation();
    const variant = payload.variantId ? product.variants?.find(v => v._id === payload.variantId) : undefined;
    this.cart.buyNowItem(product, 1, variant);
    this.router.navigate(['/checkout']);
  }

  goToProduct(product: Product): void {
    
    // Navigate to product detail page using product slug
    this.router.navigate(['/product', product.slug]);
  }

  toggleWishlist(product: Product, event: Event): void {
    
    event.preventDefault();
    event.stopPropagation();
    
    this.cart.toggleWishlist(product._id);
  }

  isWishlisted(productId: string): boolean {
    return this.cart.isWishlisted(productId)();
  }
}
