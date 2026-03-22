import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './search-page.html',
  styleUrls: ['./search-page.scss'],
})
export class SearchPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  readonly cartStore = inject(CartStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  priceMin: number | null = null;
  priceMax: number | null = null;

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const q = params['q'] || '';
      const categorySlug = params['category'] || '';
      const filters: any = {};
      if (categorySlug) filters.categorySlug = categorySlug;
      this.store.search(q, filters, params['sort'] || 'relevance', parseInt(params['page'] || '1', 10));
    });
  }

  applyPriceFilter(): void {
    if (this.priceMin !== null) this.store.applyFilter('priceMin', this.priceMin);
    if (this.priceMax !== null) this.store.applyFilter('priceMax', this.priceMax);
  }

  isTagActive(tag: string): boolean {
    return this.store.filters().tags?.includes(tag) ?? false;
  }

  toggleTag(tag: string): void {
    const current = this.store.filters().tags || [];
    if (current.includes(tag)) {
      this.store.applyFilter('tags', current.filter((t) => t !== tag));
    } else {
      this.store.applyFilter('tags', [...current, tag]);
    }
  }

  addToCart(productId: string): void {
    this.cartStore.addItem(productId, 1);
  }

  toggleWishlist(productId: string): void {
    this.cartStore.toggleWishlist(productId);
  }
}
