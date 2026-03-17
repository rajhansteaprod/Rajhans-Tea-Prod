import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ViewChildren, QueryList,
  signal, ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-product-preview',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="preview-root" #root>

      <!-- Navigation bar -->
      <nav class="preview-nav" #navBar>
        <button class="nav-back" onclick="window.close(); history.back();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back to Admin
        </button>
        <a class="nav-logo" href="/admin">
          <span class="logo-r">R</span>
          <span>Rajhans</span>
        </a>
        <div class="nav-right">
          @if (product()?.status === 'draft') {
            <span class="draft-pill">Draft</span>
          } @else if (product()?.status === 'archived') {
            <span class="archived-pill">Archived</span>
          }
          <a [href]="'/admin/products'" class="nav-edit-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Edit Product
          </a>
        </div>
      </nav>

      @if (loading()) {
        <div class="page-loader">
          <div class="loader-ring"></div>
        </div>
      } @else if (error()) {
        <div class="error-state">
          <h2>Product not found</h2>
          <p>{{ error() }}</p>
        </div>
      } @else if (product()) {
        <div class="product-layout">

          <!-- LEFT: Sticky image gallery -->
          <div class="gallery-panel" #galleryPanel>
            <div class="main-image-wrapper" #mainImageWrapper>
              @if (activeImage()) {
                <img class="main-image" #mainImage [src]="activeImage()" [alt]="product()!.name" />
              } @else {
                <div class="no-image-placeholder">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1"/>
                    <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1"/>
                    <polyline points="21 15 16 10 5 21" stroke="currentColor" stroke-width="1"/>
                  </svg>
                  <span>No images</span>
                </div>
              }
              <!-- Grain overlay -->
              <div class="grain-overlay"></div>
              <!-- Featured badge -->
              @if (product()!.isFeatured) {
                <div class="featured-badge" #featuredBadge>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  Featured
                </div>
              }
            </div>

            @if (product()!.images.length > 1) {
              <div class="thumbnail-strip" #thumbStrip>
                @for (img of product()!.images; track img; let i = $index) {
                  <button
                    class="thumb"
                    [class.active]="activeIdx() === i"
                    (click)="switchImage(i)"
                  >
                    <img [src]="img" [alt]="product()!.name + ' ' + (i+1)" />
                  </button>
                }
              </div>
            }
          </div>

          <!-- RIGHT: Scrolling product info -->
          <div class="info-panel" #infoPanel>

            <!-- Breadcrumb -->
            <div class="breadcrumb" #breadcrumb>
              <span class="breadcrumb-cat">{{ product()!.category.name }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <polyline points="9 18 15 12 9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="breadcrumb-current">{{ product()!.name }}</span>
            </div>

            <!-- Product title - word by word animation -->
            <h1 class="product-title" #productTitle>
              @for (word of titleWords(); track word + $index) {
                <span class="word">{{ word }}</span>
              }
            </h1>

            <!-- Tags row -->
            @if (product()!.tags.length > 0) {
              <div class="tags-row" #tagsRow>
                @for (tag of product()!.tags; track tag) {
                  <span class="tag"># {{ tag }}</span>
                }
              </div>
            }

            <!-- Price -->
            <div class="price-block" #priceBlock>
              <span class="price-currency">₹</span>
              <span class="price-value">{{ animatedPrice() }}</span>
              <span class="price-label">Base price</span>
            </div>

            <!-- Divider -->
            <div class="divider" #divider></div>

            <!-- Short description -->
            @if (product()!.shortDescription) {
              <p class="short-desc" #shortDesc>{{ product()!.shortDescription }}</p>
            }

            <!-- Full description -->
            @if (product()!.description) {
              <div class="description-section" #descSection>
                <h3 class="section-heading">About this product</h3>
                <p class="description-text">{{ product()!.description }}</p>
              </div>
            }

            <!-- Attributes -->
            @if (attrEntries().length > 0) {
              <div class="attributes-section" #attrsSection>
                <h3 class="section-heading">Specifications</h3>
                <div class="attr-grid">
                  @for (attr of attrEntries(); track attr.key) {
                    <div class="attr-item">
                      <span class="attr-key">{{ attr.key }}</span>
                      <span class="attr-val">{{ attr.value }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Collections -->
            @if (product()!.collections.length > 0) {
              <div class="collections-section" #collectionsSection>
                <h3 class="section-heading">Part of</h3>
                <div class="collection-chips">
                  @for (col of product()!.collections; track col._id) {
                    <span class="collection-chip">{{ col.name }}</span>
                  }
                </div>
              </div>
            }

            <!-- CTA -->
            <div class="cta-section" #ctaSection>
              <button class="cta-btn" #ctaBtn>
                <span class="cta-text">Add to Cart</span>
                <span class="cta-arrow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <p class="cta-note">Preview only · Not functional in admin panel</p>
            </div>

            <!-- Bottom spacing -->
            <div style="height: 120px"></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #FCFFF7;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #3A2D32;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    // =========================================================
    // NAVIGATION
    // =========================================================
    .preview-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      height: 64px; padding: 0 48px;
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(252, 255, 247, 0.88);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-bottom: 1px solid rgba(58, 45, 50, 0.06);
    }

    .nav-back {
      display: flex; align-items: center; gap: 8px;
      background: none; border: none; cursor: pointer;
      font-size: 14px; font-weight: 500; color: #5C4F53;
      transition: color 0.15s; padding: 0;
      &:hover { color: #CC5803; }
    }

    .nav-logo {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: #3A2D32; font-weight: 700; font-size: 18px;
    }

    .logo-r {
      width: 30px; height: 30px; background: #CC5803; color: white;
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800;
    }

    .nav-right { display: flex; align-items: center; gap: 12px; }

    .draft-pill, .archived-pill {
      font-size: 11px; font-weight: 600; padding: 3px 10px;
      border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .draft-pill    { background: rgba(162,126,142,0.12); color: #A27E8E; }
    .archived-pill { background: rgba(58,45,50,0.08);    color: #8A7D81; }

    .nav-edit-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border: 1px solid rgba(58,45,50,0.15);
      border-radius: 8px; text-decoration: none;
      font-size: 13px; font-weight: 500; color: #3A2D32;
      transition: all 0.15s;
      &:hover { background: #3A2D32; color: white; border-color: #3A2D32; }
    }

    // =========================================================
    // PAGE LOADER
    // =========================================================
    .page-loader {
      position: fixed; inset: 0; display: flex;
      align-items: center; justify-content: center;
    }
    .loader-ring {
      width: 40px; height: 40px;
      border: 3px solid rgba(204,88,3,0.15);
      border-top-color: #CC5803; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-state {
      padding-top: 120px; text-align: center;
      h2 { font-size: 24px; margin-bottom: 8px; }
      p  { color: #8A7D81; }
    }

    // =========================================================
    // PRODUCT LAYOUT — two column sticky
    // =========================================================
    .product-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-height: 100vh;
      padding-top: 64px;
    }

    // =========================================================
    // GALLERY PANEL — sticky left
    // =========================================================
    .gallery-panel {
      position: sticky; top: 64px;
      height: calc(100vh - 64px);
      display: flex; flex-direction: column;
      background: #F5F8F2;
      padding: 48px 40px 32px;
      gap: 20px;
      overflow: hidden;
    }

    .main-image-wrapper {
      position: relative; flex: 1; overflow: hidden;
      border-radius: 20px; background: white;
    }

    .main-image {
      width: 100%; height: 100%; object-fit: cover;
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                  transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .no-image-placeholder {
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 12px; color: #B8ADB1;
      span { font-size: 13px; }
    }

    .grain-overlay {
      position: absolute; inset: 0; pointer-events: none;
      border-radius: 20px;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    }

    .featured-badge {
      position: absolute; top: 16px; left: 16px;
      display: flex; align-items: center; gap: 5px;
      background: #CC5803; color: white;
      padding: 5px 12px; border-radius: 999px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }

    .thumbnail-strip {
      display: flex; gap: 10px; flex-shrink: 0;
    }

    .thumb {
      width: 64px; height: 64px; border-radius: 12px; overflow: hidden;
      border: 2px solid transparent; cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      background: none; padding: 0; flex-shrink: 0;

      img { width: 100%; height: 100%; object-fit: cover; }

      &:hover { transform: scale(1.06); border-color: rgba(204,88,3,0.4); }

      &.active {
        border-color: #CC5803;
        box-shadow: 0 0 0 2px rgba(204,88,3,0.15);
        transform: scale(1.04);
      }
    }

    // =========================================================
    // INFO PANEL — scrolling right
    // =========================================================
    .info-panel {
      padding: 72px 64px 48px 56px;
      overflow-y: auto;
    }

    .breadcrumb {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #8A7D81; margin-bottom: 20px;
    }
    .breadcrumb-cat { color: #CC5803; font-weight: 500; }
    .breadcrumb-current { color: #5C4F53; }

    .product-title {
      font-size: clamp(32px, 4vw, 52px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: #3A2D32;
      margin-bottom: 20px;
      display: flex; flex-wrap: wrap; gap: 0 0.25em;

      .word {
        display: inline-block;
        will-change: transform, opacity;
      }
    }

    .tags-row {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 32px;
    }

    .tag {
      font-size: 12px; font-weight: 500;
      padding: 4px 12px; border-radius: 999px;
      background: rgba(162,126,142,0.1); color: #A27E8E;
      border: 1px solid rgba(162,126,142,0.2);
      transition: all 0.15s;
      &:hover { background: rgba(162,126,142,0.2); }
    }

    .price-block {
      display: flex; align-items: baseline; gap: 6px;
      margin-bottom: 32px; will-change: transform, opacity;
    }
    .price-currency {
      font-size: 24px; font-weight: 700; color: #CC5803; align-self: flex-start; padding-top: 4px;
    }
    .price-value {
      font-size: 56px; font-weight: 800; letter-spacing: -0.04em;
      color: #3A2D32; line-height: 1;
    }
    .price-label {
      font-size: 12px; color: #8A7D81; align-self: flex-end; padding-bottom: 8px;
      margin-left: 4px;
    }

    .divider {
      height: 1px; background: rgba(58,45,50,0.08);
      margin-bottom: 32px; transform-origin: left;
    }

    .short-desc {
      font-size: 18px; line-height: 1.65;
      color: #5C4F53; margin-bottom: 40px;
      font-weight: 400;
    }

    .section-heading {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #8A7D81; margin-bottom: 16px;
    }

    .description-section { margin-bottom: 48px; }
    .description-text {
      font-size: 15px; line-height: 1.8; color: #5C4F53; white-space: pre-wrap;
    }

    .attributes-section { margin-bottom: 48px; }
    .attr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .attr-item {
      padding: 14px 16px; border-radius: 12px;
      background: rgba(245,248,242,0.8); border: 1px solid rgba(58,45,50,0.06);
      display: flex; flex-direction: column; gap: 4px;
      will-change: transform, opacity;
    }
    .attr-key { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #8A7D81; }
    .attr-val { font-size: 15px; font-weight: 600; color: #3A2D32; }

    .collections-section { margin-bottom: 48px; }
    .collection-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .collection-chip {
      padding: 6px 16px; border-radius: 999px;
      background: rgba(87,136,108,0.1); color: #57886C;
      border: 1px solid rgba(87,136,108,0.2);
      font-size: 13px; font-weight: 500;
      will-change: transform, opacity;
    }

    .cta-section {
      display: flex; flex-direction: column; gap: 12px;
      will-change: transform, opacity;
    }

    .cta-btn {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; padding: 20px 32px;
      background: #3A2D32; color: white; border: none;
      border-radius: 16px; cursor: pointer;
      font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
      transition: background 0.2s;
      position: relative; overflow: hidden;
      will-change: transform;

      &:hover { background: #CC5803; }

      &::before {
        content: ''; position: absolute; inset: 0;
        background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.08) 0%, transparent 70%);
        pointer-events: none;
      }
    }

    .cta-arrow { display: flex; align-items: center; transition: transform 0.2s; }
    .cta-btn:hover .cta-arrow { transform: translateX(4px); }

    .cta-note { font-size: 12px; color: #B8ADB1; text-align: center; }

    // =========================================================
    // RESPONSIVE
    // =========================================================
    @media (max-width: 900px) {
      .preview-nav { padding: 0 24px; }
      .product-layout { grid-template-columns: 1fr; }
      .gallery-panel { position: relative; top: 0; height: 60vw; min-height: 300px; max-height: 480px; padding: 24px; }
      .info-panel { padding: 40px 24px; }
      .product-title { font-size: 32px; }
      .price-value { font-size: 40px; }
    }
  `],
})
export class ProductPreviewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('navBar')            navBar!:            ElementRef<HTMLElement>;
  @ViewChild('galleryPanel')      galleryPanel!:      ElementRef<HTMLElement>;
  @ViewChild('mainImageWrapper')  mainImageWrapper!:  ElementRef<HTMLElement>;
  @ViewChild('productTitle')      productTitle!:      ElementRef<HTMLElement>;
  @ViewChild('breadcrumb')        breadcrumb!:        ElementRef<HTMLElement>;
  @ViewChild('tagsRow')           tagsRow!:           ElementRef<HTMLElement>;
  @ViewChild('priceBlock')        priceBlock!:        ElementRef<HTMLElement>;
  @ViewChild('divider')           divider!:           ElementRef<HTMLElement>;
  @ViewChild('shortDesc')         shortDesc!:         ElementRef<HTMLElement>;
  @ViewChild('descSection')       descSection!:       ElementRef<HTMLElement>;
  @ViewChild('attrsSection')      attrsSection!:      ElementRef<HTMLElement>;
  @ViewChild('collectionsSection') collectionsSection!: ElementRef<HTMLElement>;
  @ViewChild('ctaSection')        ctaSection!:        ElementRef<HTMLElement>;
  @ViewChild('ctaBtn')            ctaBtn!:            ElementRef<HTMLButtonElement>;
  @ViewChild('thumbStrip')        thumbStrip!:        ElementRef<HTMLElement>;

  product       = signal<Product | null>(null);
  loading       = signal(true);
  error         = signal<string | null>(null);
  activeIdx     = signal(0);
  activeImage   = signal<string | null>(null);
  animatedPrice = signal('0');

  titleWords  = signal<string[]>([]);
  attrEntries = signal<{ key: string; value: string }[]>([]);

  private scrollTriggers: ScrollTrigger[] = [];
  private ctaMouseMove: ((e: MouseEvent) => void) | null = null;
  private ctaMouseLeave: (() => void) | null = null;

  constructor(
    private route: ActivatedRoute,
    private catalog: CatalogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.catalog.getProduct(id).subscribe({
      next: (res) => {
        const p = res.data;
        this.product.set(p);
        this.titleWords.set(p.name.split(' '));
        this.attrEntries.set(
          Object.entries(p.attributes).map(([key, value]) => ({ key, value })),
        );
        if (p.images.length > 0) {
          this.activeImage.set(p.images[0]);
        }
        this.loading.set(false);
        this.cdr.detectChanges();
        // Run animations after view updates
        setTimeout(() => this.initAnimations(), 80);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load product');
        this.loading.set(false);
        this.cdr.detectChanges();
      },
    });
  }

  ngAfterViewInit() {
    // Animations init after product loads (handled in subscribe)
  }

  ngOnDestroy() {
    this.scrollTriggers.forEach((t) => t.kill());
    if (this.ctaBtn?.nativeElement) {
      if (this.ctaMouseMove)  this.ctaBtn.nativeElement.removeEventListener('mousemove', this.ctaMouseMove);
      if (this.ctaMouseLeave) this.ctaBtn.nativeElement.removeEventListener('mouseleave', this.ctaMouseLeave);
    }
  }

  switchImage(i: number) {
    if (i === this.activeIdx()) return;
    const p = this.product();
    if (!p) return;

    // Crossfade animation
    if (this.mainImageWrapper?.nativeElement) {
      const img = this.mainImageWrapper.nativeElement.querySelector('.main-image');
      if (img) {
        gsap.to(img, {
          opacity: 0, scale: 1.04, duration: 0.25, ease: 'power2.in',
          onComplete: () => {
            this.activeIdx.set(i);
            this.activeImage.set(p.images[i]);
            this.cdr.detectChanges();
            gsap.fromTo(img,
              { opacity: 0, scale: 1.04 },
              { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' },
            );
          },
        });
      } else {
        this.activeIdx.set(i);
        this.activeImage.set(p.images[i]);
      }
    }
  }

  private initAnimations() {
    const p = this.product();
    if (!p) return;

    // ── Entry Timeline ────────────────────────────────────────
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Nav
    if (this.navBar?.nativeElement) {
      tl.from(this.navBar.nativeElement, { y: -64, opacity: 0, duration: 0.5 });
    }

    // Gallery panel
    if (this.galleryPanel?.nativeElement) {
      tl.from(this.galleryPanel.nativeElement, { x: -48, opacity: 0, duration: 0.7 }, '-=0.3');
    }

    // Breadcrumb
    if (this.breadcrumb?.nativeElement) {
      tl.from(this.breadcrumb.nativeElement, { x: -20, opacity: 0, duration: 0.4 }, '-=0.4');
    }

    // Title words — stagger each word
    const words = this.productTitle?.nativeElement?.querySelectorAll('.word');
    if (words?.length) {
      tl.from(words, { y: 48, opacity: 0, duration: 0.65, stagger: 0.07, ease: 'power4.out' }, '-=0.3');
    }

    // Tags stagger
    const tags = document.querySelectorAll('.tag');
    if (tags.length) {
      tl.from(tags, { y: 16, opacity: 0, stagger: 0.05, duration: 0.35 }, '-=0.3');
    }

    // Divider — expand width
    if (this.divider?.nativeElement) {
      tl.from(this.divider.nativeElement, { scaleX: 0, duration: 0.6, ease: 'power2.inOut' }, '-=0.2');
    }

    // Price — spring scale + count-up
    if (this.priceBlock?.nativeElement) {
      tl.from(this.priceBlock.nativeElement, {
        scale: 0.82, opacity: 0, duration: 0.6, ease: 'back.out(1.7)',
      }, '-=0.4');
    }

    // Count-up the price
    const countObj = { val: 0 };
    const targetPrice = p.basePrice;
    gsap.to(countObj, {
      val: targetPrice, duration: 1.4, ease: 'power2.out', delay: 0.6,
      onUpdate: () => {
        this.animatedPrice.set(Math.round(countObj.val).toLocaleString('en-IN'));
        this.cdr.detectChanges();
      },
    });

    // Short desc
    if (this.shortDesc?.nativeElement) {
      tl.from(this.shortDesc.nativeElement, { y: 20, opacity: 0, duration: 0.4 }, '-=0.3');
    }

    // Thumbnail strip
    if (this.thumbStrip?.nativeElement) {
      const thumbs = this.thumbStrip.nativeElement.querySelectorAll('.thumb');
      tl.from(thumbs, { y: 20, opacity: 0, stagger: 0.06, duration: 0.4 }, '-=0.5');
    }

    // ── ScrollTrigger Reveals ─────────────────────────────────

    // Description
    if (this.descSection?.nativeElement) {
      const st = gsap.from(this.descSection.nativeElement, {
        scrollTrigger: {
          trigger: this.descSection.nativeElement,
          start: 'top 82%',
          scroller: this.descSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 32, opacity: 0, duration: 0.6,
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // Attributes — stagger grid items
    if (this.attrsSection?.nativeElement) {
      const attrItems = this.attrsSection.nativeElement.querySelectorAll('.attr-item');
      gsap.from(attrItems, {
        scrollTrigger: {
          trigger: this.attrsSection.nativeElement,
          start: 'top 82%',
          scroller: this.attrsSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 24, opacity: 0, scale: 0.96, stagger: 0.07, duration: 0.5, ease: 'power3.out',
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // Collections — stagger from left
    if (this.collectionsSection?.nativeElement) {
      const chips = this.collectionsSection.nativeElement.querySelectorAll('.collection-chip');
      gsap.from(chips, {
        scrollTrigger: {
          trigger: this.collectionsSection.nativeElement,
          start: 'top 85%',
          scroller: this.collectionsSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        x: -24, opacity: 0, stagger: 0.08, duration: 0.45,
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // CTA — spring bounce
    if (this.ctaSection?.nativeElement) {
      gsap.from(this.ctaSection.nativeElement, {
        scrollTrigger: {
          trigger: this.ctaSection.nativeElement,
          start: 'top 90%',
          scroller: this.ctaSection.nativeElement.closest('.info-panel') ?? undefined,
        },
        y: 40, opacity: 0, duration: 0.6, ease: 'back.out(1.4)',
      });
      if (ScrollTrigger.getAll().at(-1)) this.scrollTriggers.push(ScrollTrigger.getAll().at(-1)!);
    }

    // ── CTA Magnetic Hover ────────────────────────────────────
    if (this.ctaBtn?.nativeElement) {
      const btn = this.ctaBtn.nativeElement;

      this.ctaMouseMove = (e: MouseEvent) => {
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width  / 2) * 0.25;
        const y = (e.clientY - rect.top  - rect.height / 2) * 0.25;
        const mx = ((e.clientX - rect.left) / rect.width)  * 100;
        const my = ((e.clientY - rect.top)  / rect.height) * 100;
        btn.style.setProperty('--mx', `${mx}%`);
        btn.style.setProperty('--my', `${my}%`);
        gsap.to(btn, { x, y, duration: 0.4, ease: 'power2.out' });
      };

      this.ctaMouseLeave = () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
      };

      btn.addEventListener('mousemove', this.ctaMouseMove);
      btn.addEventListener('mouseleave', this.ctaMouseLeave);
    }
  }
}
