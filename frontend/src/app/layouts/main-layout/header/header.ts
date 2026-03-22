import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CartStore } from '../../../core/services/cart.store';
import { SearchStore } from '../../../core/services/search.store';
import { CatalogService, Product } from '../../../core/services/catalog.service';
import gsap from 'gsap';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="nav" [class.scrolled]="scrolled()" [class.hidden]="navHidden()">
      <div class="nav-inner">
        <!-- ── LEFT: Logo ── -->
        <a routerLink="/" class="logo-link">
          <img src="/logo.png" alt="Rajhans Tea" class="logo-img" />
          <span class="logo-text">Rajhans Tea</span>
        </a>

        <!-- ── CENTER: Navigation ── -->
        <nav class="nav-center" [class.open]="mobileMenuOpen()">
          <!-- All Products with Mega Dropdown -->
          <div
            class="nav-item has-dropdown"
            (mouseenter)="openDropdown()"
            (mouseleave)="closeDropdown()"
          >
            <button class="nav-link" [class.active]="dropdownOpen()">
              <span>All Products</span>
              <svg
                class="chevron"
                [class.rotated]="dropdownOpen()"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <!-- Mega Dropdown -->
            @if (dropdownOpen()) {
              <div class="mega-dropdown" #megaDropdown>
                <div class="mega-inner">
                  <div class="mega-left">
                    <span class="mega-label">Featured Products</span>
                    <div class="mega-products">
                      @for (p of featuredProducts(); track p._id) {
                        <a
                          [routerLink]="'/product/' + p.slug"
                          class="mega-product-card"
                          (click)="closeDropdown()"
                        >
                          <div class="mega-product-img">
                            @if (p.images?.[0]) {
                              <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                            }
                          </div>
                          <div class="mega-product-info">
                            <span class="mega-product-cat">{{ p.category?.name || 'Tea' }}</span>
                            <span class="mega-product-name">{{ p.name }}</span>
                            <span class="mega-product-price">&#8377;{{ p.basePrice }}</span>
                          </div>
                        </a>
                      }
                    </div>
                  </div>
                  <div class="mega-right">
                    <a
                      routerLink="/search"
                      class="mega-browse-card"
                      (click)="closeDropdown()"
                    >
                      <span class="mega-browse-text">
                        <span class="mega-browse-title">Browse All</span>
                        <span class="mega-browse-sub">Explore our complete collection</span>
                      </span>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 12h14M12 5l7 7-7 7"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </a>
                    <a
                      routerLink="/collections"
                      class="mega-browse-card"
                      (click)="closeDropdown()"
                    >
                      <span class="mega-browse-text">
                        <span class="mega-browse-title">Collections</span>
                        <span class="mega-browse-sub">Curated tea selections</span>
                      </span>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 12h14M12 5l7 7-7 7"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Our Story -->
          <a routerLink="/page/about-us" class="nav-link" (click)="closeMobileMenu()">Our Story</a>

          <!-- Blog / Journal -->
          <a routerLink="/page/blog" class="nav-link" (click)="closeMobileMenu()">Journal</a>

          <!-- Mobile-only links -->
          @if (mobileMenuOpen()) {
            <div class="mobile-extra">
              @if (authService.isLoggedIn()) {
                <a routerLink="/dashboard" class="nav-link" (click)="closeMobileMenu()">Dashboard</a>
                <a routerLink="/orders" class="nav-link" (click)="closeMobileMenu()">Orders</a>
                @if (authService.isAdmin()) {
                  <a routerLink="/admin" class="nav-link" (click)="closeMobileMenu()">Admin Panel</a>
                }
                <button class="nav-link logout-link" (click)="authService.logout(); closeMobileMenu()">Sign Out</button>
              } @else {
                <a routerLink="/auth/login" class="nav-link" (click)="closeMobileMenu()">Sign In</a>
              }
            </div>
          }
        </nav>

        <!-- ── RIGHT: Actions ── -->
        <div class="nav-right">
          <!-- Search -->
          <button class="action-btn" (click)="toggleSearch()" title="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Wishlist -->
          <a routerLink="/wishlist" class="action-btn" title="Wishlist">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
            @if (cartStore.wishlistIds().size > 0) {
              <span class="action-badge">{{ cartStore.wishlistIds().size }}</span>
            }
          </a>

          <!-- Cart -->
          <button class="action-btn" (click)="cartStore.toggleSidebar()" title="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.8" />
              <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.8" />
            </svg>
            @if (cartStore.cartCount() > 0) {
              <span class="action-badge">{{ cartStore.cartCount() }}</span>
            }
          </button>

          <!-- Account -->
          @if (authService.isLoggedIn()) {
            <a routerLink="/dashboard" class="action-btn account-btn" title="Account">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </a>
          } @else {
            <a routerLink="/auth/login" class="action-btn account-btn" title="Sign In">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </a>
          }

          <!-- Mobile Hamburger -->
          <button class="hamburger" (click)="toggleMobileMenu()" [class.active]="mobileMenuOpen()">
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
          </button>
        </div>
      </div>

      <!-- ── Search Overlay ── -->
      @if (searchOpen()) {
        <div class="search-overlay" (click)="closeSearch()">
          <div class="search-modal" (click)="$event.stopPropagation()">
            <div class="search-input-wrap">
              <svg class="search-modal-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              <input
                class="search-modal-input"
                placeholder="Search for teas, collections..."
                [(ngModel)]="searchQuery"
                (input)="searchStore.autocomplete(searchQuery)"
                (keyup.enter)="doSearch()"
                (keyup.escape)="closeSearch()"
                #searchInput
              />
              <button class="search-close" (click)="closeSearch()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            @if (searchStore.suggestionsOpen()) {
              <div class="search-suggestions">
                @for (s of searchStore.suggestions(); track s.slug) {
                  <a class="search-suggestion" (click)="selectSuggestion(s)">
                    @if (s.type === 'product' && s.image) {
                      <img [src]="s.image" class="suggestion-thumb" />
                    } @else {
                      <div class="suggestion-icon-wrap">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" />
                        </svg>
                      </div>
                    }
                    <div class="suggestion-info">
                      <span class="suggestion-name">{{ s.name }}</span>
                      <span class="suggestion-type">{{ s.type }}</span>
                    </div>
                  </a>
                }
              </div>
            }
          </div>
        </div>
      }
    </header>

    <!-- Mobile menu backdrop -->
    @if (mobileMenuOpen()) {
      <div class="mobile-backdrop" (click)="closeMobileMenu()"></div>
    }
  `,
  styles: [
    `
      @use '../../../core/design-tokens/tokens' as *;
      @use '../../../core/design-tokens/mixins' as *;

      // ═══════════════════════════════════════════════
      // NAVBAR
      // ═══════════════════════════════════════════════
      .nav {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: $z-sticky;
        height: 72px;
        display: flex;
        align-items: center;
        padding: 0 $space-xxl;
        transition: all 0.4s $ease-expo-out;
        background: rgba(252, 255, 247, 0);

        &.scrolled {
          background: rgba(252, 255, 247, 0.92);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
          height: 64px;

          .logo-img {
            width: 32px;
            height: 32px;
          }
        }

        &.hidden {
          transform: translateY(-100%);
        }

        @include respond-to(md) {
          padding: 0 $space-md;
        }
      }

      .nav-inner {
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      // ═══ LOGO ═══
      .logo-link {
        display: flex;
        align-items: center;
        gap: $space-sm;
        text-decoration: none;
        flex-shrink: 0;
        z-index: 2;
      }

      .logo-img {
        width: 40px;
        height: 40px;
        object-fit: contain;
        transition: all 0.4s $ease-expo-out;
      }

      .logo-text {
        font-family: $font-family-display;
        font-size: 22px;
        font-weight: 500;
        color: $color-text-primary;
        letter-spacing: $letter-spacing-tight;

        @include respond-to(md) {
          display: none;
        }
      }

      // ═══ CENTER NAV ═══
      .nav-center {
        display: flex;
        align-items: center;
        gap: $space-xxs;

        @include respond-to(md) {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 320px;
          max-width: 85vw;
          background: $color-bg-tertiary;
          flex-direction: column;
          align-items: flex-start;
          padding: 88px $space-xl $space-xl;
          gap: 0;
          transform: translateX(100%);
          transition: transform 0.5s $ease-expo-out;
          z-index: $z-fixed;
          box-shadow: -16px 0 48px rgba(0, 0, 0, 0.12);
          overflow-y: auto;

          &.open {
            transform: translateX(0);
          }

          .nav-link {
            width: 100%;
            padding: $space-md 0;
            font-size: $font-size-lg;
            border-bottom: 1px solid $color-border-light;
          }

          .nav-item {
            width: 100%;
          }
        }
      }

      .nav-item {
        position: relative;
      }

      .nav-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: $space-sm $space-md;
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        color: $color-text-secondary;
        text-decoration: none;
        border: none;
        background: none;
        cursor: pointer;
        border-radius: $radius-full;
        transition: all $transition-normal;
        letter-spacing: 0.01em;
        white-space: nowrap;

        &:hover,
        &.active {
          color: $color-text-primary;
          background: rgba(58, 45, 50, 0.04);
        }
      }

      .chevron {
        transition: transform 0.3s $ease-expo-out;
        &.rotated {
          transform: rotate(180deg);
        }
      }

      // ═══ MEGA DROPDOWN ═══
      .mega-dropdown {
        position: absolute;
        top: calc(100% + 12px);
        left: 50%;
        transform: translateX(-50%);
        width: 720px;
        background: $color-bg-tertiary;
        border-radius: $radius-xl;
        box-shadow: 0 24px 80px rgba(58, 45, 50, 0.12),
          0 0 0 1px rgba(58, 45, 50, 0.04);
        overflow: hidden;
        z-index: $z-dropdown;

        @include respond-to(md) {
          position: static;
          transform: none;
          width: 100%;
          box-shadow: none;
          border-radius: 0;
          border: none;
          background: $color-bg-secondary;
          margin-top: $space-xs;
          border-radius: $radius-lg;
        }
      }

      .mega-inner {
        display: grid;
        grid-template-columns: 1fr auto;

        @include respond-to(md) {
          grid-template-columns: 1fr;
        }
      }

      .mega-left {
        padding: $space-xl;
      }

      .mega-label {
        display: block;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: $color-text-tertiary;
        margin-bottom: $space-md;
      }

      .mega-products {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: $space-md;

        @include respond-to(md) {
          grid-template-columns: repeat(2, 1fr);
          gap: $space-sm;
        }
      }

      .mega-product-card {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        border-radius: $radius-lg;
        overflow: hidden;
        transition: all $transition-normal;
        background: $color-bg-primary;

        &:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(58, 45, 50, 0.08);

          .mega-product-img img {
            transform: scale(1.06);
          }
        }
      }

      .mega-product-img {
        aspect-ratio: 1;
        overflow: hidden;
        background: $color-bg-secondary;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s $ease-expo-out;
        }
      }

      .mega-product-info {
        padding: $space-sm;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mega-product-cat {
        font-size: 10px;
        font-weight: $font-weight-semibold;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: $color-secondary;
      }

      .mega-product-name {
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        color: $color-text-primary;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mega-product-price {
        font-family: $font-family-display;
        font-size: $font-size-md;
        font-weight: 600;
        color: $color-primary;
      }

      .mega-right {
        width: 220px;
        padding: $space-xl;
        background: $color-bg-secondary;
        display: flex;
        flex-direction: column;
        gap: $space-sm;

        @include respond-to(md) {
          width: 100%;
          flex-direction: row;
          padding: $space-md;
        }
      }

      .mega-browse-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: $space-md;
        border-radius: $radius-lg;
        text-decoration: none;
        transition: all $transition-normal;
        background: $color-bg-tertiary;
        color: $color-text-secondary;

        &:hover {
          background: $color-bg-tertiary;
          box-shadow: 0 4px 12px rgba(58, 45, 50, 0.06);
          color: $color-primary;
          transform: translateX(2px);
        }

        @include respond-to(md) {
          flex: 1;
        }
      }

      .mega-browse-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mega-browse-title {
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        color: $color-text-primary;
      }

      .mega-browse-sub {
        font-size: $font-size-xs;
        color: $color-text-tertiary;
      }

      // ═══ RIGHT ACTIONS ═══
      .nav-right {
        display: flex;
        align-items: center;
        gap: $space-xxs;
        z-index: 2;
      }

      .action-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: $radius-full;
        border: none;
        background: transparent;
        color: $color-text-secondary;
        cursor: pointer;
        transition: all $transition-normal;
        text-decoration: none;

        &:hover {
          background: rgba(58, 45, 50, 0.06);
          color: $color-text-primary;
        }

        @include respond-to(sm) {
          width: 36px;
          height: 36px;
        }
      }

      .account-btn {
        @include respond-to(md) {
          display: none;
        }
      }

      .action-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        background: $color-primary;
        color: $color-text-inverse;
        border-radius: $radius-full;
        font-size: 9px;
        font-weight: $font-weight-bold;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        pointer-events: none;
        animation: badgePop 0.3s $ease-expo-out;
      }

      @keyframes badgePop {
        0% {
          transform: scale(0);
        }
        100% {
          transform: scale(1);
        }
      }

      // ═══ HAMBURGER ═══
      .hamburger {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        width: 40px;
        height: 40px;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 8px;
        border-radius: $radius-full;
        transition: background $transition-fast;

        &:hover {
          background: rgba(58, 45, 50, 0.06);
        }

        @include respond-to(md) {
          display: flex;
        }
      }

      .hamburger-line {
        display: block;
        width: 18px;
        height: 1.5px;
        background: $color-text-primary;
        border-radius: 2px;
        transition: all 0.3s $ease-expo-out;
        transform-origin: center;
      }

      .hamburger.active {
        .hamburger-line:nth-child(1) {
          transform: translateY(6.5px) rotate(45deg);
        }
        .hamburger-line:nth-child(2) {
          opacity: 0;
          transform: scaleX(0);
        }
        .hamburger-line:nth-child(3) {
          transform: translateY(-6.5px) rotate(-45deg);
        }
      }

      .mobile-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(4px);
        z-index: #{$z-fixed - 1};
        animation: fadeIn 0.3s ease;

        @include respond-to(md) {
          display: block;
        }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .mobile-extra {
        display: flex;
        flex-direction: column;
        width: 100%;
        margin-top: $space-md;
        padding-top: $space-md;
        border-top: 1px solid $color-border-light;
      }

      .logout-link {
        color: $color-error !important;
        font-family: $font-family;
      }

      // ═══ SEARCH OVERLAY ═══
      .search-overlay {
        position: fixed;
        inset: 0;
        z-index: $z-modal;
        background: rgba(58, 45, 50, 0.4);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 120px;
        animation: fadeIn 0.25s ease;

        @include respond-to(md) {
          padding-top: 80px;
          padding-left: $space-md;
          padding-right: $space-md;
        }
      }

      .search-modal {
        width: 640px;
        max-width: 100%;
        background: $color-bg-tertiary;
        border-radius: $radius-xl;
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        animation: slideUp 0.35s $ease-expo-out;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .search-input-wrap {
        display: flex;
        align-items: center;
        gap: $space-sm;
        padding: $space-lg $space-xl;
        border-bottom: 1px solid $color-border-light;
      }

      .search-modal-icon {
        color: $color-text-tertiary;
        flex-shrink: 0;
      }

      .search-modal-input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        font-size: $font-size-lg;
        font-family: $font-family;
        color: $color-text-primary;
        font-weight: $font-weight-medium;

        &::placeholder {
          color: $color-text-disabled;
          font-weight: $font-weight-regular;
        }
      }

      .search-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: $color-bg-secondary;
        border-radius: $radius-md;
        color: $color-text-tertiary;
        cursor: pointer;
        transition: all $transition-fast;

        &:hover {
          background: $color-border-light;
          color: $color-text-primary;
        }
      }

      .search-suggestions {
        max-height: 360px;
        overflow-y: auto;
        padding: $space-sm;
      }

      .search-suggestion {
        display: flex;
        align-items: center;
        gap: $space-sm;
        padding: $space-sm $space-md;
        border-radius: $radius-lg;
        cursor: pointer;
        text-decoration: none;
        color: $color-text-primary;
        transition: background $transition-fast;

        &:hover {
          background: $color-bg-secondary;
        }
      }

      .suggestion-thumb {
        width: 40px;
        height: 40px;
        border-radius: $radius-md;
        object-fit: cover;
      }

      .suggestion-icon-wrap {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: $color-bg-secondary;
        border-radius: $radius-md;
        color: $color-text-tertiary;
      }

      .suggestion-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .suggestion-name {
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
      }

      .suggestion-type {
        font-size: 10px;
        color: $color-text-tertiary;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
    `,
  ],
})
export class HeaderComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly cartStore = inject(CartStore);
  readonly searchStore = inject(SearchStore);
  private readonly catalogService = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);

  readonly scrolled = signal(false);
  readonly navHidden = signal(false);
  readonly dropdownOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly featuredProducts = signal<Product[]>([]);

  searchQuery = '';
  private lastScrollY = 0;
  private dropdownTimeout: ReturnType<typeof setTimeout> | null = null;

  @HostListener('window:scroll')
  onScroll(): void {
    const y = window.scrollY;
    this.scrolled.set(y > 40);
    // Auto-hide on scroll down, show on scroll up
    if (y > 200 && y > this.lastScrollY && !this.dropdownOpen() && !this.searchOpen()) {
      this.navHidden.set(true);
    } else {
      this.navHidden.set(false);
    }
    this.lastScrollY = y;
  }

  ngOnInit(): void {
    this.catalogService
      .getProducts({ isFeatured: true, limit: 3, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({
        next: (res) => this.featuredProducts.set(res.data),
      });
  }

  ngAfterViewInit(): void {
    // Subtle entry animation
    gsap.from('.logo-link', { opacity: 0, x: -20, duration: 0.6, delay: 0.1, ease: 'expo.out' });
    gsap.from('.nav-center .nav-link, .nav-center .nav-item', {
      opacity: 0,
      y: -10,
      duration: 0.5,
      stagger: 0.08,
      delay: 0.2,
      ease: 'expo.out',
    });
    gsap.from('.nav-right .action-btn', {
      opacity: 0,
      x: 20,
      duration: 0.5,
      stagger: 0.06,
      delay: 0.3,
      ease: 'expo.out',
    });
  }

  ngOnDestroy(): void {
    if (this.dropdownTimeout) clearTimeout(this.dropdownTimeout);
  }

  openDropdown(): void {
    if (this.dropdownTimeout) {
      clearTimeout(this.dropdownTimeout);
      this.dropdownTimeout = null;
    }
    this.dropdownOpen.set(true);
  }

  closeDropdown(): void {
    this.dropdownTimeout = setTimeout(() => {
      this.dropdownOpen.set(false);
    }, 150);
  }

  toggleSearch(): void {
    this.searchOpen.set(!this.searchOpen());
    if (this.searchOpen()) {
      this.searchQuery = '';
      setTimeout(() => {
        const input = this.elRef.nativeElement.querySelector('.search-modal-input');
        input?.focus();
      }, 100);
    }
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.searchStore.closeSuggestions();
  }

  doSearch(): void {
    if (this.searchQuery.trim()) {
      this.searchStore.closeSuggestions();
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
      this.closeSearch();
    }
  }

  selectSuggestion(s: { type: string; name: string; slug: string }): void {
    this.searchStore.closeSuggestions();
    if (s.type === 'category') {
      this.router.navigate(['/search'], { queryParams: { category: s.slug } });
    } else {
      this.router.navigate(['/product/' + s.slug]);
    }
    this.closeSearch();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.set(!this.mobileMenuOpen());
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
    document.body.style.overflow = '';
  }
}
