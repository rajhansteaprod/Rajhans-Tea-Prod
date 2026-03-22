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
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
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
    // Transparent → solid transition at 100px scroll (hero still visible above)
    this.scrolled.set(y > 100);
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
