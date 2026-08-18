import { Component, OnInit, inject, signal, computed, effect, PLATFORM_ID } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { CatalogService, Product, ProductVariant } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';
import { ReviewStore, RatingSummary, Review, ProductRatingSummary } from '../../../core/services/review.store';
import { AuthService } from '../../../core/services/auth.service';
import { trackStandardEvent, sendCapiBeacon } from '../../../core/utils/meta-pixel';

/**
 * Colours read along the two edges of an image that end up beside the empty
 * bars in a square frame.
 */
interface AmbientEdges {
  /** 'x' = portrait image, bars left/right. 'y' = landscape, bars top/bottom. */
  axis: 'x' | 'y';
  /** Left (or top) edge colours, in order along that edge. */
  lead: string[];
  /** Right (or bottom) edge colours, in order along that edge. */
  trail: string[];
}

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
  private readonly platformId = inject(PLATFORM_ID);

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
  /** Accordion sections currently expanded (collapsed by default). */
  readonly openSections = signal<Set<string>>(new Set());
  readonly reviews = signal<Review[]>([]);
  readonly reviewsLoading = signal(false);
  readonly reviewRating = signal(5);
  reviewTitle = '';
  reviewBody = '';
  readonly submittingReview = signal(false);

  // ─ Ambient backdrop (blends a non-square image into the 1:1 frame) ─

  /** Number of slices sampled along each edge — enough to follow a soft vignette. */
  private readonly AMBIENT_SLICES = 8;

  /** Edge colours keyed by image URL, so each image is analysed at most once. */
  private readonly ambientCache = new Map<string, AmbientEdges>();

  /** Edges of the image currently on screen; null while it is being read. */
  private readonly ambient = signal<AmbientEdges | null>(null);

  /**
   * Paints each empty bar with the colours of the image edge it touches, so the
   * bar continues the photo's own backdrop and the join becomes invisible. Two
   * gradient layers, each covering its half of the frame — the image sits on
   * top and hides where they meet. Empty until the read resolves, which leaves
   * the neutral CSS background in place.
   */
  readonly ambientBackground = computed(() => {
    const edges = this.ambient();
    if (!edges) return '';

    const direction = edges.axis === 'x' ? 'to bottom' : 'to right';
    const ramp = (colors: string[]) => {
      const stops = colors.map(
        (color, i) => `${color} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`,
      );
      return `linear-gradient(${direction}, ${stops.join(', ')})`;
    };

    // Slight overlap (50.5%) so rounding never leaves a hairline down the middle
    const size = edges.axis === 'x' ? '50.5% 100%' : '100% 50.5%';
    const leadAt = edges.axis === 'x' ? 'left center' : 'center top';
    const trailAt = edges.axis === 'x' ? 'right center' : 'center bottom';

    return (
      `${ramp(edges.lead)} ${leadAt} / ${size} no-repeat, ` +
      `${ramp(edges.trail)} ${trailAt} / ${size} no-repeat`
    );
  });

  constructor() {
    // Re-read the edges whenever the visible image changes.
    effect(() => {
      const url = this.selectedImage();
      if (!url) {
        this.ambient.set(null);
        return;
      }

      const cached = this.ambientCache.get(url);
      if (cached) {
        this.ambient.set(cached);
        return;
      }

      this.ambient.set(null);
      if (isPlatformBrowser(this.platformId)) this.extractAmbient(url);
    });
  }

  /**
   * Reads the outermost pixels of the image from a 64x64 downscale. Only a 2px
   * strip is sampled per slice — roughly 3% of the source width, which stays on
   * the photo's backdrop instead of picking up the product itself. Gives up
   * silently on load or cross-origin failures, leaving the neutral background.
   */
  private extractAmbient(url: string): void {
    const SIZE = 64;
    const EDGE = 2; // strip thickness sampled at the very border
    const slices = this.AMBIENT_SLICES;
    const step = SIZE / slices;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = this.document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);

      // Which pair of bars `object-fit: contain` will leave in the square frame
      const axis: 'x' | 'y' = img.naturalWidth <= img.naturalHeight ? 'x' : 'y';

      try {
        const lead: string[] = [];
        const trail: string[] = [];

        for (let i = 0; i < slices; i++) {
          const offset = i * step;
          if (axis === 'x') {
            lead.push(this.averageColor(ctx, 0, offset, EDGE, step));
            trail.push(this.averageColor(ctx, SIZE - EDGE, offset, EDGE, step));
          } else {
            lead.push(this.averageColor(ctx, offset, 0, step, EDGE));
            trail.push(this.averageColor(ctx, offset, SIZE - EDGE, step, EDGE));
          }
        }

        const edges: AmbientEdges = { axis, lead, trail };
        this.ambientCache.set(url, edges);
        // The shopper may have moved on to another image while this loaded
        if (this.selectedImage() === url) this.ambient.set(edges);
      } catch {
        // Tainted canvas (image served without CORS headers) — keep the neutral
      }
    };

    img.src = url;
  }

  /** Mean rgb() of a canvas rectangle, skipping near-transparent pixels. */
  private averageColor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): string {
    const { data } = ctx.getImageData(x, y, width, height);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      // Transparent PNG margins carry no colour and would wash the average out
      if (data[i + 3] < 16) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    if (count === 0) return 'rgb(249, 250, 251)'; // matches the neutral fallback
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  }

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

  /** Fallback trust points used until settings load / when none are configured. */
  private readonly defaultTrustPoints: string[] = [
    'Free delivery on orders over Rs.649',
    '100% money-back on your first order',
    'FSSAI certified - packed fresh in Bhopal',
    'Prepaid & COD available',
  ];

  /** Trust points shown below the action buttons (from global store settings). */
  readonly trustPoints = signal<string[]>(this.defaultTrustPoints);

  /** Fallback brewing steps shown when a product has none configured. */
  private readonly defaultBrewingGuide: string[] = [
    'Use 1 teaspoon (2g) of tea per 200ml of water',
    'Water temperature: 90-95°C (just off the boil)',
    'Steep for 3-4 minutes for optimal flavor',
    'Can be re-steeped 2-3 times with excellent results',
  ];

  /** Fallback sourcing points shown when a product has none configured. */
  private readonly defaultSourcingInfo: string[] = [
    'Sourced from the finest gardens in India\'s tea regions',
    'Direct partnerships with ethical and sustainable tea farms',
    'Each batch tested for quality, flavor, and purity',
    'Freshly dried and packaged within weeks of harvest',
    'Fair trade practices ensure farmer communities thrive',
    'Commitment to organic and eco-friendly farming methods',
  ];

  /** Admin-configured brewing steps, falling back to the defaults when empty. */
  readonly brewingGuide = computed(() => {
    const configured = this.product()?.brewingGuide;
    return configured && configured.length > 0 ? configured : this.defaultBrewingGuide;
  });

  /** Admin-configured sourcing points, falling back to the defaults when empty. */
  readonly sourcingInfo = computed(() => {
    const configured = this.product()?.sourcingInfo;
    return configured && configured.length > 0 ? configured : this.defaultSourcingInfo;
  });

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

  /** Free delivery threshold (Rs). Hardcoded for now. */
  private readonly FREE_DELIVERY_THRESHOLD = 649;

  /** Admin-configured cost-per-cup line for the selected variant, or '' when unset. */
  readonly costPerCup = computed(() => this.selectedVariant()?.costPerCupText?.trim() ?? '');

  /** Rupees remaining until free delivery; 0 or less means threshold met. */
  readonly freeDeliveryRemaining = computed(() =>
    this.FREE_DELIVERY_THRESHOLD - this.effectivePrice(),
  );

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
    // Global trust strip content (falls back to defaults on error / when empty)
    this.catalog.getPublicStoreSettings().subscribe({
      next: (res) => {
        if (res.data?.trustPoints?.length) {
          this.trustPoints.set(res.data.trustPoints);
        }
      },
    });

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

          // Default to the 1 Kg variant when available (else largest/first)
          if (res.data.variants?.length) {
            this.selectedVariant.set(this.defaultVariant(res.data.variants));
          }

          {
            const vcData = {
              content_ids: [res.data._id],
              content_type: 'product',
              value: this.effectivePrice(),
              currency: 'INR',
            };
            const eid = trackStandardEvent('ViewContent', vcData);
            sendCapiBeacon('ViewContent', eid, vcData);
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
          const toAbsoluteUrl = (path: string) =>
            path.startsWith('http') ? path : `https://rajhanstea.com${path.startsWith('/') ? '' : '/'}${path}`;

          const absoluteImg = res.data.images?.[0] ? toAbsoluteUrl(res.data.images[0]) : undefined;
          if (absoluteImg) {
            // Social crawlers require absolute image URLs
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

          // Load rating summary, then inject Product JSON-LD (includes aggregateRating
          // once known — chained here so prerendering captures the real value, not a
          // placeholder written before the rating summary request resolves)
          this.reviewStore.getRatingSummary(res.data._id).subscribe({
            next: (r) => {
              this.ratingSummary.set(r.data);
              this.injectProductSchema(res.data, pageUrl, absoluteImg, r.data);
            },
            error: () => this.injectProductSchema(res.data, pageUrl, absoluteImg, null),
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
              error: () => this.loading.set(false),
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

  /**
   * Parses a variant weight to grams from its free-text name, tolerating
   * casing/spacing variations ("1kg", "1 Kg", "500 gm", "750g"). Returns null
   * when no weight can be read.
   */
  private variantGrams(variant: ProductVariant | undefined): number | null {
    if (!variant?.name) return null;
    const match = variant.name.toLowerCase().replace(/\s+/g, '').match(/([\d.]+)(kg|gm|g)/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    if (isNaN(value)) return null;
    return match[2] === 'kg' ? Math.round(value * 1000) : Math.round(value);
  }

  /**
   * Chooses the default variant: prefer the 1 kg option, else fall back to the
   * last (typically largest) variant, else the first.
   */
  private defaultVariant(variants: ProductVariant[]): ProductVariant {
    const oneKg = variants.find((v) => this.variantGrams(v) === 1000);
    return oneKg ?? variants[variants.length - 1] ?? variants[0];
  }

  // ─ Accordions ─
  toggleSection(key: string): void {
    const next = new Set(this.openSections());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.openSections.set(next);
  }

  isSectionOpen(key: string): boolean {
    return this.openSections().has(key);
  }

  /** Opens the Reviews accordion and scrolls it into view. */
  scrollToReviews(): void {
    const next = new Set(this.openSections());
    next.add('reviews');
    this.openSections.set(next);
    setTimeout(() => {
      this.document.getElementById('pd-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
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

  /** Injects/updates the schema.org Product JSON-LD block for this page. */
  private injectProductSchema(
    product: Product,
    pageUrl: string,
    absoluteImg: string | undefined,
    rating: RatingSummary | null,
  ): void {
    const price = product.discountedPrice ?? product.basePrice;
    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.shortDescription || product.description || product.name,
      brand: { '@type': 'Brand', name: 'Rajhans Tea' },
      offers: {
        '@type': 'Offer',
        url: pageUrl,
        priceCurrency: 'INR',
        price,
        availability:
          product.inStock === false
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
      },
    };
    if (absoluteImg) schema['image'] = absoluteImg;
    if (rating && rating.totalReviews > 0) {
      schema['aggregateRating'] = {
        '@type': 'AggregateRating',
        ratingValue: rating.averageRating,
        reviewCount: rating.totalReviews,
      };
    }

    const scriptId = 'product-jsonld';
    let script = this.document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.id = scriptId;
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);
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

  /**
   * Display name for a review: the name the reviewer typed, else their account
   * name. Order-token reviews leave the name field blank, so those show as
   * "Anonymous" rather than a generic label.
   */
  reviewerNameFor(review: Review): string {
    if (review.reviewerName?.trim()) return review.reviewerName.trim();
    const u = review.userId;
    if (u && typeof u === 'object') {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
      if (name) return name;
    }
    return 'Anonymous';
  }
}
