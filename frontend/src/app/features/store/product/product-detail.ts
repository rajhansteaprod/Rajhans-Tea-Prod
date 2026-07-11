import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { CatalogService, Product, ProductVariant } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';
import { ReviewStore, RatingSummary, Review, ProductRatingSummary } from '../../../core/services/review.store';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-detail.html',
  styleUrls: ['./product-detail.scss'],
})
export class ProductDetailComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly cartStore = inject(CartStore);
  private readonly reviewStore = inject(ReviewStore);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly document = inject(DOCUMENT);

  readonly isLoggedIn = this.authService.isLoggedIn;

  // ─ State signals ─
  readonly product = signal<Product | null>(null);
  readonly selectedImage = signal<string>('');
  readonly ratingSummary = signal<RatingSummary | null>(null);
  readonly quantity = signal(1);
  readonly loading = signal(true);
  readonly relatedProducts = signal<Product[]>([]);
  readonly relatedSummaries = signal<Map<string, ProductRatingSummary>>(new Map());
  /** Review image shown enlarged in a simple overlay; null = closed */
  readonly lightboxImage = signal<string | null>(null);
  readonly selectedVariant = signal<ProductVariant | undefined>(undefined);
  readonly hoveredProductId = signal<string | null>(null);
  readonly activeTab = signal<'description' | 'brewing' | 'sourcing' | 'reviews'>('description');
  readonly reviews = signal<Review[]>([]);
  readonly reviewsLoading = signal(false);
  readonly reviewRating = signal(5);
  reviewTitle = '';
  reviewBody = '';
  readonly submittingReview = signal(false);

  readonly orderedImages = computed(() => {
    const prod = this.product();
    if (!prod) return [];
    
    const defaultImg = prod.primaryImage || prod.images?.[0] || '';
    const hoverImg = prod.reflectedImage || '';
    
    const result: string[] = [];
    if (defaultImg) result.push(defaultImg);
    if (hoverImg && !result.includes(hoverImg)) result.push(hoverImg);
    
    if (prod.images) {
      for (const img of prod.images) {
        if (img && !result.includes(img)) {
          result.push(img);
        }
      }
    }
    return result;
  });

  readonly brewingGuide = signal<string[]>([
    'Use 1 teaspoon (2g) of tea per 200ml of water',
    'Water temperature: 90-95°C (just off the boil)',
    'Steep for 3-4 minutes for optimal flavor',
    'Can be re-steeped 2-3 times with excellent results',
  ]);

  readonly sourcingInfo = signal<string[]>([
    'Sourced from the finest gardens in India\'s tea regions',
    'Direct partnerships with ethical and sustainable tea farms',
    'Each batch tested for quality, flavor, and purity',
    'Freshly dried and packaged within weeks of harvest',
    'Fair trade practices ensure farmer communities thrive',
    'Commitment to organic and eco-friendly farming methods',
  ]);

  // ─ Computed ─
  readonly effectivePrice = computed(() => {
    const variant = this.selectedVariant();
    const product = this.product();

    if (variant) {
      return variant.discountedPrice ?? variant.price;
    }

    if (product) {
      return product.discountedPrice ?? product.basePrice;
    }

    return 0;
  });

  readonly discountPercent = computed(() => {
    const variant = this.selectedVariant();
    const product = this.product();
    let originalPrice = 0;
    let discountedPrice = 0;

    if (variant) {
      originalPrice = variant.price;
      discountedPrice = variant.discountedPrice ?? 0;
    } else if (product) {
      originalPrice = product.basePrice;
      discountedPrice = product.discountedPrice ?? 0;
    }

    if (discountedPrice && originalPrice > discountedPrice) {
      return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
    }

    return 0;
  });

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.loading.set(true);

      this.catalog.getProductBySlug(slug).subscribe({
        next: (res) => {
          // If no variants exist, dynamically populate default weight options (250g, 500g, 1kg)
          if (!res.data.variants || res.data.variants.length === 0) {
            res.data.variants = [
              {
                _id: 'v-250g',
                name: '250g',
                price: res.data.basePrice,
                discountedPrice: res.data.discountedPrice,
                stock: res.data.stock ?? 50,
                trackInventory: false,
                images: res.data.images,
                position: 1,
                isActive: true
              },
              {
                _id: 'v-500g',
                name: '500g',
                price: Math.round(res.data.basePrice * 1.8),
                discountedPrice: res.data.discountedPrice ? Math.round(res.data.discountedPrice * 1.8) : undefined,
                stock: res.data.stock ?? 50,
                trackInventory: false,
                images: res.data.images,
                position: 2,
                isActive: true
              },
              {
                _id: 'v-1kg',
                name: '1kg',
                price: Math.round(res.data.basePrice * 3.4),
                discountedPrice: res.data.discountedPrice ? Math.round(res.data.discountedPrice * 3.4) : undefined,
                stock: res.data.stock ?? 50,
                trackInventory: false,
                images: res.data.images,
                position: 3,
                isActive: true
              }
            ];
          }

          this.product.set(res.data);
          this.selectedImage.set(this.orderedImages()[0] || '');

          // Set first variant if available
          if (res.data.variants?.length) {
            this.selectedVariant.set(res.data.variants[0]);
          }

          // SEO
          const pageTitle = `${res.data.name} — Rajhans Tea`;
          const pageDescription = res.data.shortDescription || res.data.name;
          const pageUrl = `https://rajhanstea.com/product/${res.data.slug}`;

          this.titleService.setTitle(pageTitle);
          this.meta.updateTag({ name: 'description', content: pageDescription });
          this.meta.updateTag({ property: 'og:title', content: res.data.name });
          this.meta.updateTag({ property: 'og:description', content: pageDescription });
          this.meta.updateTag({ property: 'og:type', content: 'product' });
          this.meta.updateTag({ property: 'og:url', content: pageUrl });
          this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
          this.meta.updateTag({ name: 'twitter:title', content: res.data.name });
          this.meta.updateTag({ name: 'twitter:description', content: pageDescription });
          if (res.data.images?.[0]) {
            // Social crawlers require absolute image URLs
            const img = res.data.images[0];
            const absoluteImg = img.startsWith('http') ? img : `https://rajhanstea.com${img.startsWith('/') ? '' : '/'}${img}`;
            this.meta.updateTag({ property: 'og:image', content: absoluteImg });
            this.meta.updateTag({ name: 'twitter:image', content: absoluteImg });
          }

          // Canonical link (Angular's Meta service has no built-in canonical helper)
          let canonical = this.document.querySelector('link[rel="canonical"]');
          if (!canonical) {
            canonical = this.document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            this.document.head.appendChild(canonical);
          }
          canonical.setAttribute('href', pageUrl);

          // Load rating summary
          this.reviewStore.getRatingSummary(res.data._id).subscribe({
            next: (r) => this.ratingSummary.set(r.data),
          });

          // Load reviews
          this.reviewsLoading.set(true);
          this.reviewStore.getProductReviews(res.data._id).subscribe({
            next: (r) => {
              this.reviews.set(r.data);
              this.reviewsLoading.set(false);
            },
            error: () => this.reviewsLoading.set(false),
          });

          // Load related products
          this.catalog
            .getProductsPublic({ categoryId: res.data.category._id, limit: 9 })
            .subscribe({
              next: (r) => {
                const filtered = r.data.filter((p) => p._id !== res.data._id);
                this.relatedProducts.set(filtered.slice(0, 8));
                this.loading.set(false);
                this.loadRelatedSummaries(this.relatedProducts().map((p) => p._id));
              },
            });
        },
        error: () => this.loading.set(false),
      });
    });
  }

  submitReview(): void {
    if (!this.product() || !this.reviewTitle.trim() || !this.reviewBody.trim()) {
      return;
    }

    this.submittingReview.set(true);
    const reviewData = {
      rating: this.reviewRating(),
      title: this.reviewTitle.trim(),
      body: this.reviewBody.trim(),
    };

    this.reviewStore.submitReview(this.product()!._id, reviewData).subscribe({
      next: (res) => {
        this.reviewTitle = '';
        this.reviewBody = '';
        this.reviewRating.set(5);
        this.submittingReview.set(false);
        this.reviews.update(reviews => [res.data, ...reviews]);
      },
      error: () => this.submittingReview.set(false),
    });
  }

  // ─ Image navigation ─
  onImageClick(event: MouseEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    if (clickX < rect.width / 2) {
      this.prevImage();
    } else {
      this.nextImage();
    }
  }

  prevImage(): void {
    const imgs = this.orderedImages();
    if (imgs.length <= 1) return;
    const current = this.selectedImage();
    let idx = imgs.indexOf(current);
    if (idx === -1) idx = 0;
    const prevIdx = (idx - 1 + imgs.length) % imgs.length;
    this.selectedImage.set(imgs[prevIdx]);
  }

  nextImage(): void {
    const imgs = this.orderedImages();
    if (imgs.length <= 1) return;
    const current = this.selectedImage();
    let idx = imgs.indexOf(current);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + 1) % imgs.length;
    this.selectedImage.set(imgs[nextIdx]);
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
      // Add to cart and open the sidebar
      this.cartStore.addItem(this.product()!._id, this.quantity(), this.selectedVariant()?._id, true, this.product()!.slug);
    }
  }

  buyNow(): void {
    if (this.product()) {
      this.cartStore.buyNowItem(this.product()!, this.quantity(), this.selectedVariant());
      // Navigate to checkout; CheckoutService detects temporary cart and uses it
      setTimeout(() => {
        this.router.navigate(['/checkout']);
      }, 400);
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

  // ─ Real rating summaries for recommendation cards ─
  private loadRelatedSummaries(ids: string[]): void {
    if (!ids.length) return;
    this.reviewStore.getSummaries(ids).subscribe({
      next: (res) => {
        const map = new Map(this.relatedSummaries());
        for (const s of res.data || []) map.set(s.productId, s);
        this.relatedSummaries.set(map);
      },
      error: () => { /* ratings are non-critical */ },
    });
  }

  ratingFor(productId: string): number {
    return this.relatedSummaries().get(productId)?.averageRating ?? 0;
  }

  roundedRatingFor(productId: string): number {
    return Math.round(this.ratingFor(productId));
  }

  /** Whole-star fill for the main product's average rating */
  mainRoundedRating(): number {
    return Math.round(this.ratingSummary()?.averageRating ?? 0);
  }

  reviewCountFor(productId: string): number {
    return this.relatedSummaries().get(productId)?.totalReviews ?? 0;
  }

  /** Display name for a review: admin-entered name, else the reviewer's account name */
  reviewerNameFor(review: Review): string {
    if (review.reviewerName) return review.reviewerName;
    const u = review.userId;
    if (u && typeof u === 'object') {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
      if (name) return name;
    }
    return 'Verified Customer';
  }
}
