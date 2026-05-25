import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { CartStore } from '../../../../core/services/cart.store';
import { ProductCardComponent } from '../../../../shared/components/product-card/product-card';

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule, ProductCardComponent],
  templateUrl: './featured-products.html',
  styleUrls: ['./featured-products.scss'],
})
export class FeaturedProductsComponent implements OnInit {
  private catalog = inject(CatalogService);
  private router = inject(Router);
  readonly cart = inject(CartStore);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly hoveringProducts = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.catalog.getProductsPublic({ isFeatured: true, limit: 12 }).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
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

  getRating(): number {
    return 4;
  }

  getReviewCount(): number {
    return 0;
  }

  addToCart(product: Product, payload: { event: Event; variantId?: string }): void {
    payload.event.preventDefault();
    payload.event.stopPropagation();
    this.cart.addItem(product._id, 1, payload.variantId);
  }

  buyNow(product: Product, payload: { event: Event; variantId?: string }): void {
    payload.event.preventDefault();
    payload.event.stopPropagation();
    const variant = payload.variantId ? product.variants?.find(v => v._id === payload.variantId) : undefined;
    this.cart.buyNowItem(product, 1, variant);
    this.router.navigate(['/checkout']);
  }

  goToProduct(product: Product): void {
    
    // Navigate to product detail page using product slug
    this.router.navigate(['/product', product.slug]);
  }

  toggleWishlist(product: Product, event: Event): void {
    
    event.preventDefault();
    event.stopPropagation();
    
    this.cart.toggleWishlist(product._id);
  }

  isWishlisted(productId: string): boolean {
    return this.cart.isWishlisted(productId)();
  }
}
