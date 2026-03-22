import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
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
    <header class="nav" [class.scrolled]="scrolled()" [class.transparent]="isTransparent()" [class.hidden]="navHidden()" [class.mega-active]="megaOpen()">
      <div class="nav-inner">
        <a routerLink="/" class="logo" (click)="closeMega()">
          <img [src]="isTransparent() ? '/logo-white.png' : '/logo.png'" alt="Rajhans Tea" class="logo-icon" />
          <span class="logo-name">Rajhans Tea</span>
        </a>

        <nav class="nav-links" [class.open]="mobileOpen()">
          <button class="nav-link" [class.active]="megaOpen()" (click)="navigateTo('/products')" (mouseenter)="onNavHover()">
            All Products
            <svg class="nav-chevron" [class.flip]="megaOpen()" width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <a routerLink="/page/about-us" class="nav-link" (click)="closeAll()">Our Story</a>
          <a routerLink="/page/blog" class="nav-link" (click)="closeAll()">Journal</a>

          <div class="mobile-links">
            <a routerLink="/products" class="nav-link" (click)="closeAll()">Products</a>
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
        <div class="mega-content" [style.top.px]="scrolled() ? 60 : 72" (click)="$event.stopPropagation()" (mouseleave)="closeMega()">
          <div class="mega-layout">
            <!-- LEFT SIDEBAR: Categories -->
            <aside class="mega-sidebar">
              <h3 class="mega-heading">Categories</h3>
              <!-- All (default) -->
              <button class="mega-cat" [class.mega-cat--active]="!activeCatId()" (mouseenter)="onCatHover(null)" (click)="navigateTo('/products')" [style.--i]="0">
                <div class="mega-cat-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <span class="mega-cat-name">All Products</span>
                <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              @for (cat of categories(); track cat._id; let i = $index) {
                <button class="mega-cat" [class.mega-cat--active]="activeCatId() === cat._id" (mouseenter)="onCatHover(cat._id)" (click)="navigateTo('/catalog/' + cat.slug)" [style.--i]="i + 1">
                  @if (cat.image) {
                    <img [src]="cat.image" class="mega-cat-thumb" />
                  } @else {
                    <div class="mega-cat-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                    </div>
                  }
                  <span class="mega-cat-name">{{ cat.name }}</span>
                  <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              }
              <div class="mega-sidebar-divider"></div>
              <button class="mega-cat mega-cat--browse" (click)="navigateTo('/collections')" [style.--i]="categories().length + 2">
                <div class="mega-cat-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </div>
                <span class="mega-cat-name">Collections</span>
                <svg class="mega-cat-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
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
                  <button class="btn-buy" (click)="navigateTo('/products')">Browse All</button>
                </div>
              }
              <div class="mega-products" [class.loading]="megaLoading()">
                @for (p of featuredProducts(); track p._id; let i = $index) {
                  <div class="mega-card" [style.--i]="i">
                    <a [routerLink]="'/product/' + p.slug" class="mega-card-image" (click)="closeMegaDelayed()">
                      @if (p.images?.[0]) {
                        <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                      }
                      @if (p.inStock === false) {
                        <span class="mega-card-badge mega-card-badge--oos">Sold Out</span>
                      }
                    </a>
                    <div class="mega-card-info">
                      <span class="mega-card-cat">{{ p.category?.name || 'Tea' }}</span>
                      <a [routerLink]="'/product/' + p.slug" class="mega-card-name" (click)="closeMegaDelayed()">{{ p.name }}</a>
                      @if (p.shortDescription) {
                        <p class="mega-card-desc">{{ p.shortDescription }}</p>
                      }
                      <span class="mega-card-price">&#8377;{{ p.basePrice }}</span>
                      <div class="mega-card-actions">
                        <button class="btn-add-cart" (click)="addToCart(p._id, $event)" [disabled]="p.inStock === false">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.8"/></svg>
                          Add to Cart
                        </button>
                        <a [routerLink]="'/product/' + p.slug" class="btn-buy" (click)="closeMegaDelayed()">Buy Now</a>
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

    <!-- ══════ SEARCH OVERLAY (Spotlight-style) ══════ -->
    @if (searchOpen()) {
      <div class="search-overlay" (click)="closeSearch()">
        <div class="search-modal" (click)="$event.stopPropagation()">
          <!-- Search Input -->
          <div class="search-header">
            <svg class="search-header-icon" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="1.8"/>
              <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <input
              class="search-input"
              placeholder="What are you looking for?"
              [(ngModel)]="searchQuery"
              (input)="searchStore.autocomplete(searchQuery)"
              (keyup.enter)="doSearch()"
              (keyup.escape)="closeSearch()"
              #searchInput
            />
            @if (searchQuery) {
              <button class="search-clear" (click)="searchQuery = ''; searchStore.closeSuggestions()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            }
            <kbd class="search-esc" (click)="closeSearch()">ESC</kbd>
          </div>

          <!-- Quick Links (no query) -->
          @if (!searchQuery) {
            <div class="search-body">
              <div class="search-section">
                <span class="search-section-label">Quick Links</span>
                <div class="search-quick-links">
                  <button class="quick-link" (click)="navigateFromSearch('/products')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
                    All Products
                  </button>
                  <button class="quick-link" (click)="navigateFromSearch('/collections')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                    Collections
                  </button>
                  <button class="quick-link" (click)="navigateFromSearch('/page/about-us')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    Our Story
                  </button>
                </div>
              </div>
              @if (featuredProducts().length > 0) {
                <div class="search-section">
                  <span class="search-section-label">Popular Products</span>
                  @for (p of featuredProducts().slice(0, 3); track p._id) {
                    <button class="search-product-item" (click)="navigateFromSearch('/product/' + p.slug)">
                      <div class="search-product-thumb">
                        @if (p.images?.[0]) { <img [src]="p.images[0]" [alt]="p.name" /> }
                      </div>
                      <div class="search-product-info">
                        <span class="search-product-name">{{ p.name }}</span>
                        <span class="search-product-price">&#8377;{{ p.basePrice }}</span>
                      </div>
                      <svg class="search-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  }
                </div>
              }
            </div>
          }

          <!-- Search Results (grouped by type) -->
          @if (searchQuery && searchStore.suggestionsOpen()) {
            <div class="search-body">
              <!-- Products -->
              @if (productSuggestions().length > 0) {
                <div class="search-section">
                  <span class="search-section-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="1.5"/></svg>
                    Products
                  </span>
                  @for (s of productSuggestions(); track s.slug) {
                    <button class="search-product-item" (click)="navigateFromSearch('/product/' + s.slug)">
                      <div class="search-product-thumb">
                        @if (s.image) { <img [src]="s.image" [alt]="s.name" /> }
                      </div>
                      <div class="search-product-info">
                        <span class="search-product-name">{{ s.name }}</span>
                        <span class="search-product-meta">Product</span>
                      </div>
                      <svg class="search-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  }
                </div>
              }
              <!-- Categories -->
              @if (categorySuggestions().length > 0) {
                <div class="search-section">
                  <span class="search-section-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.5"/></svg>
                    Categories
                  </span>
                  @for (s of categorySuggestions(); track s.slug) {
                    <button class="search-cat-item" (click)="navigateFromSearch('/catalog/' + s.slug)">
                      <div class="search-cat-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                      </div>
                      <span class="search-cat-name">{{ s.name }}</span>
                      <svg class="search-item-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  }
                </div>
              }
              <!-- Blogs (coming soon) -->
              <div class="search-section search-section--muted">
                <span class="search-section-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.5"/></svg>
                  Journal
                </span>
                <p class="search-coming-soon">Blog search coming soon</p>
              </div>
            </div>
          }

          <!-- Loading -->
          @if (searchQuery && searchStore.suggestionsLoading() && !searchStore.suggestionsOpen()) {
            <div class="search-body">
              <div class="search-loading">
                <div class="search-spinner"></div>
                <span>Searching...</span>
              </div>
            </div>
          }

          <!-- No results -->
          @if (searchQuery && !searchStore.suggestionsLoading() && searchStore.suggestions().length === 0 && searchQuery.length >= 2) {
            <div class="search-body">
              <div class="search-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  <path d="M8 11h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
                <span class="search-empty-text">No results for "{{ searchQuery }}"</span>
                <span class="search-empty-hint">Try a different search term</span>
              </div>
            </div>
          }

          <!-- Footer -->
          <div class="search-footer">
            <span class="search-footer-hint">
              <kbd>&#8593;</kbd><kbd>&#8595;</kbd> Navigate
              <kbd>&#8629;</kbd> Search
              <kbd>esc</kbd> Close
            </span>
          </div>
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
      &.transparent {
        background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none;
        .logo-name { color: rgba(255,255,255,0.95); }
        .nav-link { color: rgba(255,255,255,0.75);
          &:hover, &.active { color: white; background: rgba(255,255,255,0.1); }
          &::after { background: white; }
        }
        .action-icon { color: rgba(255,255,255,0.8);
          &:hover { color: white; background: rgba(255,255,255,0.1); }
        }
        .badge { border: 2px solid rgba(0,0,0,0.3); }
        .burger span { background: white; }
      }
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
      position: absolute; left: 0; right: 0;
      background: $color-bg-tertiary; border-top: 1px solid $color-border-light;
      border-bottom: 3px solid $color-primary;
      box-shadow: 0 40px 100px rgba(58,45,50,0.12);
      overflow-y: auto;
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

    // ═══════════════════════════════════════
    // SEARCH OVERLAY (Apple Spotlight-style)
    // ═══════════════════════════════════════
    .search-overlay {
      position: fixed; inset: 0; z-index: $z-modal;
      background: rgba(58,45,50,0.4); backdrop-filter: blur(12px);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 12vh; padding-left: $space-md; padding-right: $space-md;
      animation: fadeIn 0.2s ease;

      @include respond-to(md) { padding-top: 8vh; }
    }

    .search-modal {
      width: 680px; max-width: 100%; max-height: 75vh;
      background: $color-bg-tertiary;
      border-radius: $radius-xxl;
      box-shadow: 0 40px 120px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04);
      display: flex; flex-direction: column;
      animation: searchDrop 0.35s $ease-expo-out;
      overflow: hidden;
    }

    @keyframes searchDrop {
      from { opacity: 0; transform: translateY(-16px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    // ── Search Header ──
    .search-header {
      display: flex; align-items: center; gap: $space-sm;
      padding: $space-lg $space-xl;
      border-bottom: 1px solid $color-border-light;
      flex-shrink: 0;
    }
    .search-header-icon { color: $color-primary; flex-shrink: 0; }
    .search-input {
      flex: 1; border: none; outline: none; background: none;
      font-size: 20px; font-family: $font-family; color: $color-text-primary;
      font-weight: 500; letter-spacing: -0.01em;
      &::placeholder { color: $color-text-disabled; font-weight: 400; }
    }
    .search-clear {
      @include flex-center; width: 28px; height: 28px; border: none;
      background: none; color: $color-text-tertiary; cursor: pointer;
      border-radius: $radius-full; transition: all 0.2s;
      &:hover { color: $color-text-primary; background: $color-bg-secondary; }
    }
    .search-esc {
      padding: 3px 8px; border: 1px solid $color-border;
      border-radius: $radius-sm; font-size: 10px; font-weight: 700;
      color: $color-text-disabled; cursor: pointer; font-family: $font-family;
      letter-spacing: 0.04em; transition: all 0.2s; flex-shrink: 0;
      &:hover { background: $color-bg-secondary; color: $color-text-tertiary; }
    }

    // ── Search Body ──
    .search-body {
      flex: 1; overflow-y: auto; padding: $space-sm $space-md;
    }

    .search-section {
      padding: $space-sm 0;
      &:not(:last-child) { border-bottom: 1px solid $color-border-light; }
    }
    .search-section--muted { opacity: 0.5; }
    .search-section-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: $color-text-tertiary;
      padding: $space-xs $space-sm; margin-bottom: $space-xxs;

      svg { color: $color-text-disabled; }
    }

    // Quick Links
    .search-quick-links {
      display: flex; gap: $space-xs; padding: $space-xs $space-sm;
      flex-wrap: wrap;
    }
    .quick-link {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border: 1px solid $color-border-light;
      border-radius: $radius-full; background: $color-bg-primary;
      font-size: 13px; font-weight: 500; color: $color-text-secondary;
      cursor: pointer; font-family: $font-family;
      transition: all 0.25s $ease-expo-out;
      &:hover {
        border-color: $color-primary; color: $color-primary;
        background: rgba(204,88,3,0.04); transform: translateY(-1px);
      }
      &:active { transform: scale(0.97); }
      svg { color: $color-text-tertiary; }
      &:hover svg { color: $color-primary; }
    }

    // Product Items
    .search-product-item {
      display: flex; align-items: center; gap: $space-sm; width: 100%;
      padding: $space-sm; border: none; background: none;
      border-radius: $radius-lg; cursor: pointer; text-align: left;
      font-family: $font-family; transition: all 0.2s $ease-expo-out;
      &:hover {
        background: $color-bg-secondary;
        .search-item-arrow { opacity: 1; transform: translateX(0); }
      }
    }
    .search-product-thumb {
      width: 44px; height: 44px; border-radius: $radius-md;
      overflow: hidden; background: $color-bg-secondary; flex-shrink: 0;
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .search-product-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .search-product-name {
      font-size: 14px; font-weight: 600; color: $color-text-primary;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-product-price { font-size: 13px; font-weight: 600; color: $color-primary; }
    .search-product-meta { font-size: 11px; color: $color-text-tertiary; }
    .search-item-arrow {
      color: $color-text-disabled; flex-shrink: 0;
      opacity: 0; transform: translateX(-4px);
      transition: all 0.2s $ease-expo-out;
    }

    // Category Items
    .search-cat-item {
      display: flex; align-items: center; gap: $space-sm; width: 100%;
      padding: $space-sm; border: none; background: none;
      border-radius: $radius-lg; cursor: pointer; text-align: left;
      font-family: $font-family; transition: all 0.2s $ease-expo-out;
      &:hover {
        background: $color-bg-secondary;
        .search-item-arrow { opacity: 1; transform: translateX(0); }
      }
    }
    .search-cat-icon {
      width: 36px; height: 36px; border-radius: $radius-md;
      background: rgba(87,136,108,0.08); color: $color-secondary;
      @include flex-center; flex-shrink: 0;
    }
    .search-cat-name { flex: 1; font-size: 14px; font-weight: 500; color: $color-text-primary; }

    // Coming Soon
    .search-coming-soon {
      font-size: 13px; color: $color-text-disabled;
      padding: $space-xs $space-sm; margin: 0;
    }

    // Loading
    .search-loading {
      @include flex-center; gap: $space-sm; padding: $space-xxl;
      color: $color-text-tertiary; font-size: 13px;
    }
    .search-spinner {
      width: 20px; height: 20px; border: 2px solid $color-border-light;
      border-top-color: $color-primary; border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    // Empty
    .search-empty {
      @include flex-center; flex-direction: column; gap: $space-sm;
      padding: $space-xxl; color: $color-text-disabled;
    }
    .search-empty-text { font-size: 15px; font-weight: 600; color: $color-text-secondary; }
    .search-empty-hint { font-size: 13px; color: $color-text-tertiary; }

    // Footer
    .search-footer {
      padding: $space-sm $space-xl;
      border-top: 1px solid $color-border-light;
      background: $color-bg-secondary; flex-shrink: 0;
    }
    .search-footer-hint {
      font-size: 11px; color: $color-text-disabled;
      display: flex; align-items: center; gap: $space-xs;
      kbd {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 20px; height: 18px; padding: 0 4px;
        border: 1px solid $color-border; border-radius: 3px;
        font-size: 10px; font-weight: 600; font-family: $font-family;
        color: $color-text-tertiary; background: $color-bg-tertiary;
      }
    }

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
  private isHomePage = signal(false);

  /** Transparent header: only on homepage AND above the fold (hero visible) */
  readonly isTransparent = computed(() =>
    this.isHomePage() && !this.scrolled() && !this.megaOpen() && !this.searchOpen(),
  );

  readonly productSuggestions = computed(() =>
    this.searchStore.suggestions().filter((s) => s.type === 'product'),
  );
  readonly categorySuggestions = computed(() =>
    this.searchStore.suggestions().filter((s) => s.type === 'category'),
  );

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
    // Track if we're on the homepage for transparent header
    this.isHomePage.set(this.router.url === '/');
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.isHomePage.set((e as NavigationEnd).urlAfterRedirects === '/');
    });

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

  /** Delay close so routerLink navigation fires before @if destroys the DOM */
  closeMegaDelayed(): void {
    setTimeout(() => this.closeMega(), 50);
  }

  /** Navigate programmatically then close — for buttons without routerLink */
  navigateTo(path: string): void {
    this.router.navigate([path]);
    this.closeMega();
  }

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

  navigateFromSearch(path: string): void {
    this.closeSearch();
    this.router.navigate([path]);
  }

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
