import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CartStore } from '../../../core/services/cart.store';
import { CatalogService, Product, Category } from '../../../core/services/catalog.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProductCardComponent],
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartStore);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);

  readonly mobileOpen = signal(false);
  readonly shopSectionOpen = signal(true); // Drawer shop section - expanded by default
  readonly searchFocused = signal(false);
  readonly searchResults = signal<Product[]>([]);
  readonly recentSearches = signal<string[]>([]);
  readonly shopOpen = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly featuredProducts = signal<Product[]>([]);
  readonly activeCatId = signal<string | null>(null);
  private allFeaturedProducts: Product[] = [];

  searchQuery = '';
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private shopTimer: ReturnType<typeof setTimeout> | null = null;

  readonly searchSuggestions = computed(() =>
    this.searchResults().slice(0, 6),
  );

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const input = document.querySelector('.nav-search__input') as HTMLInputElement;
      input?.focus();
    }
    if (e.key === 'Escape') {
      this.closeSearch();
      this.closeShop();
    }
  }

  ngOnInit(): void {
    this.loadRecentSearches();
    this.loadCategories();
    this.loadFeaturedProducts();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  // ── SEARCH ──

  onSearchFocus(): void {
    this.searchFocused.set(true);
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchFocused.set(false), 200);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (this.searchQuery.trim().length > 0) {
      this.searchTimeout = setTimeout(() => {
        this.catalog.getProductsPublic({
          search: this.searchQuery.trim(),
          limit: 6,
        }).subscribe({
          next: (res) => this.searchResults.set(res.data),
          error: () => this.searchResults.set([]),
        });
      }, 300);
    } else {
      this.searchResults.set([]);
    }
  }

  onSuggestionClick(productName: string): void {
    this.addRecentSearch(productName);
  }

  setSearch(query: string): void {
    this.searchQuery = query;
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  closeSearch(): void {
    this.searchFocused.set(false);
  }

  doSearch(): void {
    if (this.searchQuery.trim()) {
      this.addRecentSearch(this.searchQuery.trim());
      this.router.navigate(['/products'], {
        queryParams: { q: this.searchQuery.trim() },
      });
      this.closeAll();
    }
  }

  // ── SHOP MEGA MENU ──

  openShop(): void {
    this.clearTimer();
    if (window.innerWidth <= 768) return;
    this.shopTimer = setTimeout(() => {
      this.shopOpen.set(true);
    }, 100);
  }

  closeShop(): void {
    this.clearTimer();
    this.shopTimer = setTimeout(() => {
      this.shopOpen.set(false);
      this.activeCatId.set(null);
    }, 80);
  }

  onNavEnter(): void {
    if (this.shopTimer) clearTimeout(this.shopTimer);
  }

  onNavLeave(): void {
    this.closeShop();
  }

  cancelNavTimer(): void {
    if (this.shopTimer) clearTimeout(this.shopTimer);
  }

  onCatHover(catId: string | null): void {
    this.activeCatId.set(catId);
    if (!catId) {
      this.featuredProducts.set(this.allFeaturedProducts);
    } else {
      const filtered = this.allFeaturedProducts.filter(p => p.category?._id === catId);
      if (filtered.length > 0) {
        this.featuredProducts.set(filtered);
      }
    }
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
    this.closeAll();
  }

  // ── MOBILE ──

  toggleMobile(): void {
    this.mobileOpen.set(!this.mobileOpen());
    this.lockScroll(this.mobileOpen());
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
    this.lockScroll(false);
  }

  toggleShopSection(): void {
    this.shopSectionOpen.set(!this.shopSectionOpen());
  }

  closeAll(): void {
    this.closeMobile();
    this.closeSearch();
    this.closeShop();
  }

  // ── PRIVATE HELPERS ──

  private loadCategories(): void {
    this.catalog.getCategoriesPublic().subscribe({
      next: (res) => this.categories.set(res.data),
      error: () => this.categories.set([]),
    });
  }

  private loadFeaturedProducts(): void {
    this.catalog.getProductsPublic({ limit: 12, sortOrder: 'desc' }).subscribe({
      next: (res) => {
        this.allFeaturedProducts = res.data;
        this.featuredProducts.set(res.data);
      },
      error: () => {
        this.allFeaturedProducts = [];
        this.featuredProducts.set([]);
      },
    });
  }

  private addRecentSearch(query: string): void {
    const recent = this.recentSearches();
    const filtered = recent.filter(s => s.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...filtered].slice(0, 5);
    this.recentSearches.set(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  }

  private loadRecentSearches(): void {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try {
        this.recentSearches.set(JSON.parse(saved));
      } catch {
        this.recentSearches.set([]);
      }
    }
  }

  private clearTimer(): void {
    if (this.shopTimer) clearTimeout(this.shopTimer);
  }

  private lockScroll(lock: boolean): void {
    document.body.style.overflow = lock ? 'hidden' : '';
  }
}
