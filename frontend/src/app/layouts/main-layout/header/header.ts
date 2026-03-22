import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CartStore } from '../../../core/services/cart.store';
import { SearchStore } from '../../../core/services/search.store';
import {
  CatalogService,
  Product,
  Category,
} from '../../../core/services/catalog.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="nav" [class.scrolled]="scrolled()" [class.hidden]="navHidden()" [class.mega-active]="megaOpen()">
      <div class="nav-inner">
        <a routerLink="/" class="logo" (click)="closeMega()">
          <img src="/logo.png" alt="Rajhans Tea" class="logo-icon" />
          <span class="logo-name">Rajhans Tea</span>
        </a>

        <nav class="nav-links" [class.open]="mobileOpen()">
          <button class="nav-link" [class.active]="megaOpen()" (click)="toggleMega()" (mouseenter)="onNavHover()">
            All Products
            <svg class="nav-chevron" [class.flip]="megaOpen()" width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <a routerLink="/page/about-us" class="nav-link" (click)="closeAll()">Our Story</a>
          <a routerLink="/page/blog" class="nav-link" (click)="closeAll()">Journal</a>

          <div class="mobile-links">
            <a routerLink="/search" class="nav-link" (click)="closeAll()">Search</a>
            <a routerLink="/wishlist" class="nav-link" (click)="closeAll()">Wishlist</a>
            @if (auth.isLoggedIn()) {
              <a routerLink="/dashboard" class="nav-link" (click)="closeAll()">Account</a>
              <a routerLink="/orders" class="nav-link" (click)="closeAll()">Orders</a>
              @if (auth.isAdmin()) {
                <a routerLink="/admin" class="nav-link" (click)="closeAll()">Admin</a>
              }
              <button class="nav-link nav-link--danger" (click)="auth.logout(); closeAll()">Sign Out</button>
            } @else {
              <a routerLink="/auth/login" class="nav-link" (click)="closeAll()">Sign In</a>
            }
          </div>
        </nav>

        <div class="nav-actions">
          <button class="action-icon" (click)="toggleSearch()" aria-label="Search">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
          <a routerLink="/wishlist" class="action-icon" aria-label="Wishlist">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            @if (cart.wishlistIds().size > 0) { <span class="badge">{{ cart.wishlistIds().size }}</span> }
          </a>
          <button class="action-icon" (click)="cart.toggleSidebar()" aria-label="Cart">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.8"/><path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.8"/></svg>
            @if (cart.cartCount() > 0) { <span class="badge">{{ cart.cartCount() }}</span> }
          </button>
          @if (auth.isLoggedIn()) {
            <a routerLink="/dashboard" class="action-icon hide-mobile" aria-label="Account">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/></svg>
            </a>
          } @else {
            <a routerLink="/auth/login" class="action-icon hide-mobile" aria-label="Sign In">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/></svg>
            </a>
          }
          <button class="burger" [class.active]="mobileOpen()" (click)="toggleMobile()" aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <!-- ══════ FULL-PAGE MEGA MENU ══════ -->
    @if (megaOpen()) {
      <div class="mega" (click)="closeMega()">
        <div class="mega-content" (click)="$event.stopPropagation()" (mouseleave)="closeMega()">
          <div class="mega-layout">
            <!-- LEFT SIDEBAR: Categories -->
            <aside class="mega-sidebar">
              <h3 class="mega-heading">Categories</h3>
              <!-- All (default) -->
              <a routerLink="/products" class="mega-cat" [class.mega-cat--active]="!activeCatId()" (mouseenter)="onCatHover(null)" (click)="closeMega()" [style.--i]="0">
                <div class="mega-cat-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <span class="mega-cat-name">All Products</span>
                <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
              @for (cat of categories(); track cat._id; let i = $index) {
                <a [routerLink]="'/catalog/' + cat.slug" class="mega-cat" [class.mega-cat--active]="activeCatId() === cat._id" (mouseenter)="onCatHover(cat._id)" (click)="closeMega()" [style.--i]="i + 1">
                  @if (cat.image) {
                    <img [src]="cat.image" class="mega-cat-thumb" />
                  } @else {
                    <div class="mega-cat-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                    </div>
                  }
                  <span class="mega-cat-name">{{ cat.name }}</span>
                  <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
              }
              <div class="mega-sidebar-divider"></div>
              <a routerLink="/collections" class="mega-cat mega-cat--browse" (click)="closeMega()" [style.--i]="categories().length + 2">
                <div class="mega-cat-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </div>
                <span class="mega-cat-name">Collections</span>
                <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
            </aside>

            <!-- RIGHT: Products -->
            <section class="mega-main">
              <h3 class="mega-heading">{{ activeCatId() ? 'Products' : 'All Products' }}</h3>
              @if (megaLoading()) {
                <div class="mega-loading">
                  <div class="mega-spinner"></div>
                </div>
              }
              @if (!megaLoading() && featuredProducts().length === 0) {
                <div class="mega-empty">
                  <p>No products found in this category.</p>
                  <a routerLink="/search" class="btn-buy" (click)="closeMega()">Browse All</a>
                </div>
              }
              <div class="mega-products" [class.loading]="megaLoading()">
                @for (p of featuredProducts(); track p._id; let i = $index) {
                  <div class="mega-card" [style.--i]="i">
                    <a [routerLink]="'/product/' + p.slug" class="mega-card-image" (click)="closeMega()">
                      @if (p.images?.[0]) {
                        <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                      }
                      @if (p.inStock === false) {
                        <span class="mega-card-badge mega-card-badge--oos">Sold Out</span>
                      }
                    </a>
                    <div class="mega-card-info">
                      <span class="mega-card-cat">{{ p.category?.name || 'Tea' }}</span>
                      <a [routerLink]="'/product/' + p.slug" class="mega-card-name" (click)="closeMega()">{{ p.name }}</a>
                      @if (p.shortDescription) {
                        <p class="mega-card-desc">{{ p.shortDescription }}</p>
                      }
                      <span class="mega-card-price">&#8377;{{ p.basePrice }}</span>
                      <div class="mega-card-actions">
                        <button class="btn-add-cart" (click)="addToCart(p._id, $event)" [disabled]="p.inStock === false">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.8"/></svg>
                          Add to Cart
                        </button>
                        <a [routerLink]="'/product/' + p.slug" class="btn-buy" (click)="closeMega()">Buy Now</a>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </section>
          </div>
        </div>
      </div>
    }

    <!-- ══════ SEARCH OVERLAY ══════ -->
    @if (searchOpen()) {
      <div class="search-overlay" (click)="closeSearch()">
        <div class="search-box" (click)="$event.stopPropagation()">
          <div class="search-field">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <input class="search-input" placeholder="Search teas, collections..." [(ngModel)]="searchQuery"
              (input)="searchStore.autocomplete(searchQuery)" (keyup.enter)="doSearch()" (keyup.escape)="closeSearch()" #searchInput />
            <kbd class="search-kbd" (click)="closeSearch()">ESC</kbd>
          </div>
          @if (searchStore.suggestionsOpen()) {
            <div class="search-results">
              @for (s of searchStore.suggestions(); track s.slug) {
                <a class="search-result" (click)="selectSuggestion(s)">
                  @if (s.type === 'product' && s.image) { <img [src]="s.image" class="result-thumb" /> }
                  @else {
                    <div class="result-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
                  }
                  <div class="result-info">
                    <span class="result-name">{{ s.name }}</span>
                    <span class="result-type">{{ s.type }}</span>
                  </div>
                </a>
              }
            </div>
          }
        </div>
      </div>
    }

    @if (mobileOpen()) { <div class="mobile-backdrop" (click)="closeMobile()"></div> }
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    @use '../../../core/design-tokens/mixins' as *;

    // ═══ NAVBAR ═══
    .nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: $z-sticky;
      height: 72px; display: flex; align-items: center;
      padding: 0 clamp($space-md, 4vw, $space-xxl);
      background: rgba(252, 255, 247, 0.96);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      transition: all 0.5s $ease-expo-out;
      animation: navReveal 0.7s $ease-expo-out both;
      &.scrolled {
        height: 60px; background: rgba(255,255,255,0.98);
        box-shadow: 0 1px 0 rgba(0,0,0,0.06);
        .logo-icon { width: 30px; height: 30px; }
      }
      &.hidden { transform: translateY(-100%); }
      &.mega-active { background: rgba(255,255,255,1); }
      @include respond-to(md) { height: 60px; }
    }
    @keyframes navReveal { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }

    .nav-inner { max-width: 1400px; margin: 0 auto; width: 100%; display: flex; align-items: center; justify-content: space-between; }

    // ═══ LOGO ═══
    .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; z-index: 2; flex-shrink: 0; }
    .logo-icon { width: 36px; height: 36px; object-fit: contain; transition: all 0.4s $ease-expo-out; }
    .logo-name {
      font-family: $font-family-display; font-size: 21px; font-weight: 500;
      color: $color-text-primary; letter-spacing: -0.02em;
      @include respond-to(sm) { display: none; }
    }

    // ═══ NAV LINKS ═══
    .nav-links {
      display: flex; align-items: center; gap: 2px;
      @include respond-to(md) {
        position: fixed; top: 0; right: 0; bottom: 0; width: 300px;
        background: $color-bg-tertiary; flex-direction: column; align-items: stretch;
        padding: 80px $space-lg $space-lg; transform: translateX(100%);
        transition: transform 0.5s $ease-expo-out; z-index: $z-fixed;
        box-shadow: -12px 0 40px rgba(0,0,0,0.08); overflow-y: auto; gap: 0;
        &.open { transform: translateX(0); }
      }
    }
    .nav-link {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 8px 16px; font-size: 14px; font-weight: 500;
      color: $color-text-secondary; background: none; border: none;
      border-radius: $radius-full; cursor: pointer; text-decoration: none;
      transition: all 0.25s $ease-expo-out; position: relative; white-space: nowrap;
      font-family: $font-family;
      &::after {
        content: ''; position: absolute; bottom: 4px; left: 16px; right: 16px;
        height: 1.5px; background: $color-primary; border-radius: 1px;
        transform: scaleX(0); transform-origin: left; transition: transform 0.35s $ease-expo-out;
      }
      &:hover, &.active { color: $color-text-primary; &::after { transform: scaleX(1); } }
      @include respond-to(md) {
        padding: 14px 0; font-size: 16px; border-radius: 0;
        border-bottom: 1px solid $color-border-light; &::after { display: none; }
      }
    }
    .nav-link--danger { color: $color-error; }
    .nav-chevron { transition: transform 0.35s $ease-expo-out; &.flip { transform: rotate(180deg); } }
    .mobile-links {
      display: none;
      @include respond-to(md) { display: flex; flex-direction: column; margin-top: $space-md; padding-top: $space-md; border-top: 1px solid $color-border; }
    }

    // ═══ RIGHT ACTIONS ═══
    .nav-actions { display: flex; align-items: center; gap: 2px; z-index: 2; }
    .action-icon {
      position: relative; @include flex-center; width: 38px; height: 38px;
      border-radius: $radius-full; border: none; background: transparent;
      color: $color-text-secondary; cursor: pointer; text-decoration: none;
      transition: all 0.3s $ease-expo-out;
      &:hover { color: $color-text-primary; background: rgba(58,45,50,0.05); transform: scale(1.08); }
      &:active { transform: scale(0.95); }
    }
    .hide-mobile { @include respond-to(md) { display: none; } }
    .badge {
      position: absolute; top: 2px; right: 2px; min-width: 15px; height: 15px; padding: 0 3px;
      background: $color-primary; color: white; border-radius: $radius-full;
      font-size: 9px; font-weight: 700; @include flex-center; line-height: 1;
      animation: pop 0.3s $ease-expo-out;
    }
    @keyframes pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }

    // ═══ HAMBURGER ═══
    .burger {
      display: none; width: 38px; height: 38px; align-items: center; justify-content: center;
      flex-direction: column; gap: 5px; border: none; background: none; cursor: pointer;
      border-radius: $radius-full; padding: 10px; transition: background 0.2s;
      &:hover { background: rgba(58,45,50,0.05); }
      @include respond-to(md) { display: flex; }
      span { display: block; width: 16px; height: 1.5px; background: $color-text-primary; border-radius: 2px; transition: all 0.35s $ease-expo-out; transform-origin: center; }
      &.active span {
        &:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
        &:nth-child(2) { opacity: 0; transform: scaleX(0); }
        &:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }
      }
    }
    .mobile-backdrop {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.25);
      backdrop-filter: blur(3px); z-index: #{$z-fixed - 1}; animation: fadeIn 0.3s ease;
      @include respond-to(md) { display: block; }
    }

    // ═══════════════════════════════════════
    // FULL-PAGE MEGA MENU
    // ═══════════════════════════════════════
    .mega {
      position: fixed; inset: 0; z-index: #{$z-sticky - 1};
      background: rgba(58,45,50,0.12); backdrop-filter: blur(2px);
      animation: fadeIn 0.2s ease;
    }
    .mega-content {
      position: absolute; top: 72px; left: 0; right: 0;
      background: $color-bg-tertiary; border-top: 1px solid $color-border-light;
      border-bottom: 3px solid $color-primary;
      box-shadow: 0 40px 100px rgba(58,45,50,0.12);
      max-height: calc(100vh - 72px); overflow-y: auto;
      animation: megaSlide 0.4s $ease-expo-out both;
    }
    @keyframes megaSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

    .mega-layout {
      max-width: 1400px; margin: 0 auto; display: grid;
      grid-template-columns: 260px 1fr; min-height: 420px;
      @include respond-to(md) { grid-template-columns: 1fr; }
    }

    .mega-heading {
      font-family: $font-family-display; font-size: 12px; font-weight: 600;
      letter-spacing: 0.14em; text-transform: uppercase;
      color: $color-text-tertiary; margin: 0 0 $space-md; padding-bottom: $space-sm;
      border-bottom: 1px solid $color-border-light;
    }

    // ── Sidebar: Categories ──
    .mega-sidebar {
      padding: $space-xl $space-lg; background: $color-bg-secondary;
      border-right: 1px solid $color-border-light;
      @include respond-to(md) { border-right: none; border-bottom: 1px solid $color-border-light; padding: $space-lg $space-md; }
    }

    .mega-cat {
      display: flex; align-items: center; gap: $space-sm; width: 100%;
      padding: 10px $space-sm; border-radius: $radius-md; border: none;
      text-decoration: none; color: $color-text-primary; background: none;
      font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: $font-family; text-align: left;
      transition: all 0.3s $ease-expo-out;
      animation: catSlideIn 0.35s $ease-expo-out both;
      animation-delay: calc(var(--i) * 0.04s);

      .mega-cat-arrow { opacity: 0; transform: translateX(-6px); transition: all 0.25s $ease-expo-out; margin-left: auto; }
      &:hover, &.mega-cat--active {
        background: rgba(204,88,3,0.06); color: $color-primary; padding-left: 14px;
        .mega-cat-arrow { opacity: 1; transform: translateX(0); color: $color-primary; }
        .mega-cat-icon { background: rgba(204,88,3,0.15); }
      }
      &.mega-cat--active { font-weight: 600; }
    }
    @keyframes catSlideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

    .mega-cat-thumb {
      width: 32px; height: 32px; border-radius: $radius-md;
      object-fit: cover; flex-shrink: 0;
    }
    .mega-cat-icon {
      width: 32px; height: 32px; border-radius: $radius-md;
      background: rgba(204,88,3,0.08); color: $color-primary;
      @include flex-center; flex-shrink: 0;
    }
    .mega-cat-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mega-cat--browse { color: $color-primary; font-weight: 600;
      .mega-cat-arrow { opacity: 1; transform: translateX(0); }
      &:hover .mega-cat-arrow { transform: translateX(4px); }
    }
    .mega-sidebar-divider {
      height: 1px; background: $color-border-light; margin: $space-sm 0;
    }

    // ── Main: Featured Products ──
    .mega-main {
      padding: $space-xl $space-xxl;
      @include respond-to(md) { padding: $space-lg $space-md; }
    }

    .mega-products {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: $space-lg;
      @include respond-to(xs) { grid-template-columns: 1fr; }
    }

    .mega-card {
      display: flex; flex-direction: column;
      border-radius: $radius-xl; overflow: hidden;
      border: 1px solid $color-border-light;
      background: $color-bg-primary;
      transition: all 0.4s $ease-expo-out;
      animation: cardReveal 0.5s $ease-expo-out both;
      animation-delay: calc(var(--i) * 0.08s + 0.1s);

      &:hover {
        border-color: rgba(204,88,3,0.2);
        box-shadow: 0 16px 48px rgba(58,45,50,0.1);
        transform: translateY(-4px);
        .mega-card-image img { transform: scale(1.06); }
      }
    }
    @keyframes cardReveal { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .mega-card-image {
      position: relative; aspect-ratio: 4/3; overflow: hidden; background: $color-bg-secondary;
      display: block; text-decoration: none;
      img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s $ease-expo-out; }
    }

    .mega-card-badge {
      position: absolute; top: $space-sm; left: $space-sm;
      padding: 4px 10px; border-radius: $radius-full;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      &--oos { background: $color-text-primary; color: white; }
    }

    .mega-card-info {
      padding: $space-md $space-lg $space-lg; display: flex; flex-direction: column; gap: 4px; flex: 1;
    }
    .mega-card-cat {
      font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: $color-secondary;
    }
    .mega-card-name {
      font-family: $font-family-display; font-size: 20px; font-weight: 500;
      color: $color-text-primary; text-decoration: none; letter-spacing: -0.01em;
      transition: color 0.2s;
      &:hover { color: $color-primary; }
    }
    .mega-card-desc {
      font-size: 13px; color: $color-text-tertiary; line-height: 1.5;
      margin: 2px 0 4px; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .mega-card-price {
      font-family: $font-family-display; font-size: 22px; font-weight: 600;
      color: $color-primary; margin-top: auto; padding-top: $space-xs;
    }

    .mega-card-actions {
      display: flex; gap: $space-xs; margin-top: $space-sm;
    }

    .btn-add-cart {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 16px; border: 1.5px solid $color-border;
      border-radius: $radius-full; background: transparent;
      font-size: 13px; font-weight: 600; color: $color-text-primary;
      cursor: pointer; font-family: $font-family;
      transition: all 0.25s $ease-expo-out;
      &:hover { border-color: $color-primary; color: $color-primary; transform: translateY(-1px); }
      &:active { transform: scale(0.97); }
      &:disabled { opacity: 0.4; cursor: not-allowed; &:hover { transform: none; border-color: $color-border; color: $color-text-primary; } }
    }

    .btn-buy {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 20px; border: none; border-radius: $radius-full;
      background: $color-primary; color: white;
      font-size: 13px; font-weight: 600; cursor: pointer;
      text-decoration: none; font-family: $font-family;
      transition: all 0.25s $ease-expo-out;
      &:hover { background: $color-primary-hover; color: white; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(204,88,3,0.25); }
      &:active { transform: scale(0.97); }
    }

    // ═══ SEARCH OVERLAY ═══
    .search-overlay {
      position: fixed; inset: 0; z-index: $z-modal;
      background: rgba(58,45,50,0.35); backdrop-filter: blur(6px);
      @include flex-center; padding: 0 $space-md; animation: fadeIn 0.2s ease;
    }
    .search-box {
      width: 580px; max-width: 100%; background: $color-bg-tertiary;
      border-radius: $radius-xl; box-shadow: 0 32px 80px rgba(0,0,0,0.15);
      overflow: hidden; animation: searchPop 0.35s $ease-expo-out;
    }
    @keyframes searchPop { from { opacity: 0; transform: scale(0.96) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .search-field {
      display: flex; align-items: center; gap: $space-sm;
      padding: 18px $space-xl; border-bottom: 1px solid $color-border-light; color: $color-text-tertiary;
    }
    .search-input {
      flex: 1; border: none; outline: none; background: none;
      font-size: 18px; font-family: $font-family; color: $color-text-primary; font-weight: 500;
      &::placeholder { color: $color-text-disabled; font-weight: 400; }
    }
    .search-kbd {
      padding: 3px 8px; border: 1px solid $color-border; border-radius: 4px;
      font-size: 10px; font-weight: 600; color: $color-text-tertiary;
      cursor: pointer; font-family: $font-family; transition: all 0.2s;
      &:hover { background: $color-bg-secondary; }
    }
    .search-results { max-height: 320px; overflow-y: auto; padding: $space-xs; }
    .search-result {
      display: flex; align-items: center; gap: $space-sm;
      padding: 10px $space-md; border-radius: $radius-lg;
      cursor: pointer; text-decoration: none; color: $color-text-primary; transition: all 0.2s;
      &:hover { background: $color-bg-secondary; }
    }
    .result-thumb { width: 40px; height: 40px; border-radius: $radius-md; object-fit: cover; }
    .result-icon { width: 40px; height: 40px; @include flex-center; background: $color-bg-secondary; border-radius: $radius-md; color: $color-text-tertiary; }
    .result-info { display: flex; flex-direction: column; gap: 1px; }
    .result-name { font-size: 14px; font-weight: 500; }
    .result-type { font-size: 10px; color: $color-text-tertiary; text-transform: uppercase; letter-spacing: 0.06em; }

    .mega-loading { @include flex-center; padding: $space-xxxl; }
    .mega-spinner {
      width: 28px; height: 28px; border: 2px solid $color-border-light;
      border-top-color: $color-primary; border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .mega-empty {
      @include flex-center; flex-direction: column; gap: $space-md;
      padding: $space-xxxl; color: $color-text-tertiary; font-size: 14px;
    }
    .mega-products.loading { opacity: 0.3; pointer-events: none; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class HeaderComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartStore);
  readonly searchStore = inject(SearchStore);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);

  readonly scrolled = signal(false);
  readonly navHidden = signal(false);
  readonly megaOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly mobileOpen = signal(false);
  readonly featuredProducts = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly activeCatId = signal<string | null>(null);
  readonly megaLoading = signal(false);

  private allProducts: Product[] = [];
  searchQuery = '';
  private lastY = 0;

  @HostListener('window:scroll')
  onScroll(): void {
    const y = window.scrollY;
    this.scrolled.set(y > 32);
    if (y > 160 && y > this.lastY && !this.megaOpen() && !this.searchOpen()) {
      this.navHidden.set(true);
    } else {
      this.navHidden.set(false);
    }
    this.lastY = y;
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.closeMega(); this.closeSearch(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.toggleSearch(); }
  }

  ngOnInit(): void {
    // Load all products (no isFeatured filter — show everything)
    this.catalog.getProductsPublic({ limit: 8, sortOrder: 'desc' }).subscribe({
      next: (res) => {
        this.allProducts = res.data;
        this.featuredProducts.set(res.data);
      },
    });
    this.catalog.getCategoriesPublic().subscribe({
      next: (res) => this.categories.set(res.data),
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  onNavHover(): void {
    if (window.innerWidth > 768) this.megaOpen.set(true);
  }

  onCatHover(catId: string | null): void {
    this.activeCatId.set(catId);
    if (!catId) {
      // "All" — show all products
      this.featuredProducts.set(this.allProducts);
    } else {
      // Filter by category from cached products first
      const filtered = this.allProducts.filter((p) => p.category?._id === catId);
      if (filtered.length > 0) {
        this.featuredProducts.set(filtered);
      } else {
        // Fetch from API if no cached results
        this.megaLoading.set(true);
        this.catalog.getProductsPublic({ categoryId: catId, limit: 8 }).subscribe({
          next: (res) => { this.featuredProducts.set(res.data); this.megaLoading.set(false); },
          error: () => this.megaLoading.set(false),
        });
      }
    }
  }

  toggleMega(): void { this.megaOpen.set(!this.megaOpen()); this.lockScroll(this.megaOpen()); }
  closeMega(): void { this.megaOpen.set(false); this.lockScroll(false); this.activeCatId.set(null); }

  addToCart(productId: string, event: Event): void {
    event.stopPropagation();
    this.cart.addItem(productId, 1);
  }

  toggleSearch(): void {
    this.searchOpen.set(!this.searchOpen());
    this.searchQuery = '';
    if (this.searchOpen()) {
      this.closeMega();
      setTimeout(() => this.elRef.nativeElement.querySelector('.search-input')?.focus(), 80);
    }
  }
  closeSearch(): void { this.searchOpen.set(false); this.searchStore.closeSuggestions(); }

  doSearch(): void {
    if (this.searchQuery.trim()) {
      this.searchStore.closeSuggestions();
      this.router.navigate(['/products'], { queryParams: { q: this.searchQuery.trim() } });
      this.closeSearch();
    }
  }

  selectSuggestion(s: { type: string; name: string; slug: string }): void {
    this.searchStore.closeSuggestions();
    this.router.navigate(s.type === 'category' ? ['/products'] : ['/product/' + s.slug],
      s.type === 'category' ? { queryParams: { category: s.slug } } : undefined);
    this.closeSearch();
  }

  toggleMobile(): void { this.mobileOpen.set(!this.mobileOpen()); this.lockScroll(this.mobileOpen()); }
  closeMobile(): void { this.mobileOpen.set(false); this.lockScroll(false); }
  closeAll(): void { this.closeMega(); this.closeMobile(); this.closeSearch(); }
  private lockScroll(lock: boolean): void { document.body.style.overflow = lock ? 'hidden' : ''; }
}
