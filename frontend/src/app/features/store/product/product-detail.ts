import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { CatalogService, Product, ProductVariant } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';
import { ReviewStore, RatingSummary } from '../../../core/services/review.store';
import { ProductReviewsComponent } from './reviews/product-reviews';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, ProductReviewsComponent],
  templateUrl: './product-detail.html',
  styleUrls: ['./product-detail.scss'],
})
export class ProductDetailComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);

  // ─ State signals ─
  readonly product = signal<Product | null>(null);
  readonly selectedImage = signal<string>('');
  readonly ratingSummary = signal<RatingSummary | null>(null);
  readonly quantity = signal(1);
  readonly loading = signal(true);
  readonly relatedProducts = signal<Product[]>([]);
  readonly selectedVariant = signal<ProductVariant | null>(null);
  readonly zoomActive = signal(false);
  readonly zoomPos = signal('0% 0%');
  readonly hoveredProductId = signal<string | null>(null);

  // ─ Computed ─
  readonly effectivePrice = computed(() =>
    this.selectedVariant()?.price ?? this.product()?.basePrice ?? 0
  );

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.loading.set(true);

      this.catalog.getProductBySlug(slug).subscribe({
        next: (res) => {
          this.product.set(res.data);
          this.selectedImage.set(res.data.images?.[0] || '');

          // Set first variant if available
          if (res.data.variants?.length) {
            this.selectedVariant.set(res.data.variants[0]);
          }

          // SEO
          this.titleService.setTitle(`${res.data.name} — Rajhans Tea`);
          this.meta.updateTag({ name: 'description', content: res.data.shortDescription || res.data.name });
          this.meta.updateTag({ property: 'og:title', content: res.data.name });
          this.meta.updateTag({ property: 'og:description', content: res.data.shortDescription || '' });
          if (res.data.images?.[0]) this.meta.updateTag({ property: 'og:image', content: res.data.images[0] });

          // Load rating summary
          this.reviewStore.getRatingSummary(res.data._id).subscribe({
            next: (r) => this.ratingSummary.set(r.data),
          });

          // Load related products
          this.catalog
            .getProductsPublic({ categoryId: res.data.category._id, limit: 9 })
            .subscribe({
              next: (r) => {
                const filtered = r.data.filter((p) => p._id !== res.data._id);
                this.relatedProducts.set(filtered.slice(0, 8));
                this.loading.set(false);
              },
            });
        },
        error: () => this.loading.set(false),
      });
    });
  }

  // ─ Image & zoom ─
  onZoomMove(event: MouseEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    this.zoomPos.set(`${x}% ${y}%`);
  }

  selectVariant(variant: ProductVariant): void {
    this.selectedVariant.set(variant);
  }

  // ─ Quantity ─
  incrementQty(): void {
    let max = 99;
    if (this.selectedVariant()) {
      // Use variant stock if variant is selected
      max = this.selectedVariant()!.trackInventory ? this.selectedVariant()!.stock : 99;
    } else if (this.product()) {
      // Fall back to product stock
      max = this.product()!.trackInventory ? (this.product()!.stock ?? 99) : 99;
    }
    if (this.quantity() < max) this.quantity.set(this.quantity() + 1);
  }

  decrementQty(): void {
    if (this.quantity() > 1) this.quantity.set(this.quantity() - 1);
  }

  // ─ Cart ─
  addToCart(): void {
    if (this.product()) {
      this.cartStore.addItem(this.product()!._id, this.quantity(), this.selectedVariant()?._id);
    }
  }

  buyNow(): void {
    if (this.product()) {
      this.cartStore.addItem(this.product()!._id, this.quantity(), this.selectedVariant()?._id);
      this.router.navigate(['/checkout']);
    }
  }

  // ─ Recommendations (for card hover effect) ─
  setHovering(productId: string, isHovering: boolean): void {
    this.hoveredProductId.set(isHovering ? productId : null);
  }

  isHovering(productId: string): boolean {
    return this.hoveredProductId() === productId;
  }

  // ─ Wishlist ─
  isWishlisted(productId: string): boolean {
    return this.cartStore.wishlistIds().has(productId);
  }

  toggleWishlist(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartStore.toggleWishlist(productId);
  }

  // ─ Recommendations card navigation ─
  goToProduct(product: Product): void {
    this.router.navigate(['/product', product.slug]);
  }

  // ─ Helper methods for recommendation cards ─
  getRating(): number {
    return 5;
  }

  getReviewCount(): number {
    return this.ratingSummary()?.totalReviews ?? 0;
  }
}
