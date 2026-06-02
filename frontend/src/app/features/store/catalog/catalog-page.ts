import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { SearchStore } from '../../../core/services/search.store';
import { CartStore } from '../../../core/services/cart.store';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent, ButtonComponent],
  templateUrl: './catalog-page.html',
  styleUrls: ['./catalog-page.scss'],
})
export class CatalogPageComponent implements OnInit {
  readonly store = inject(SearchStore);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly cart = inject(CartStore);
  private readonly router = inject(Router);

  categoryName = '';
  readonly hoveringProducts = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.categoryName = slug?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || '';
      this.titleService.setTitle(`${this.categoryName || 'Catalog'} — Rajhans Tea`);
      this.store.search('', { categorySlug: slug });
    });
  }

  setHovering(productId: string, isHovering: boolean): void {
    const hoveringSet = new Set(this.hoveringProducts());
    if (isHovering) {
      hoveringSet.add(productId);
    } else {
      hoveringSet.delete(productId);
    }
    this.hoveringProducts.set(hoveringSet);
  }

  isHovering(productId: string): boolean {
    return this.hoveringProducts().has(productId);
  }

  isWishlisted(productId: string): boolean {
    return false;
  }

  getRating = (): number => 4;
  getReviewCount = (): number => 0;

  toggleWishlist(product: any, event: Event): void {
    event.stopPropagation();
  }

  addToCart(product: any, event: { event: Event; variantId?: string }): void {
    this.cart.addItem(product._id, 1, product.variants?.[0]?._id);
  }

  buyNow(product: any, event: { event: Event; variantId?: string }): void {
    event.event.preventDefault();
    event.event.stopPropagation();
    const variant = event.variantId ? product.variants?.find((v: any) => v._id === event.variantId) : undefined;
    this.cart.buyNowItem(product, 1, variant);
    this.router.navigate(['/checkout']);
  }

  goToProduct(product: any): void {
    this.router.navigate(['/product', product.slug]);
  }

  goToAllProducts(): void {
    this.router.navigate(['/products']);
  }
}
