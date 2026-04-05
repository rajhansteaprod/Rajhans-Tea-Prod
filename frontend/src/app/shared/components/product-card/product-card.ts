import { Component, Input, inject, signal, OnDestroy } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Product } from '../../../core/services/catalog.service';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './product-card.html',
  styleUrls: ['./product-card.scss'],
})
export class ProductCardComponent implements OnDestroy {
  @Input({ required: true }) product!: Product;
  @Input() variant: 'default' | 'compact' = 'default';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  readonly cart = inject(CartStore);
  private readonly router = inject(Router);

  readonly hovered = signal(false);
  readonly activeImage = signal(0);
  private slideTimer: ReturnType<typeof setInterval> | null = null;

  onMouseEnter(): void {
    this.hovered.set(true);
    if (this.product.images && this.product.images.length > 1) {
      this.slideTimer = setInterval(() => {
        this.activeImage.update(i => (i + 1) % this.product.images.length);
      }, 800);
    }
  }

  onMouseLeave(): void {
    this.hovered.set(false);
    this.activeImage.set(0);
    if (this.slideTimer) clearInterval(this.slideTimer);
  }

  onAddToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    // Regular cart - add item to cart
    this.cart.addItem(this.product._id, 1);
  }

  onBuyNow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    // Navigate to checkout with Buy Now flow - product ID and quantity as params
    this.router.navigate(['/checkout'], {
      queryParams: {
        buyNow: this.product._id,
        qty: 1,
      },
    });
  }

  onWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cart.toggleWishlist(this.product._id);
  }

  ngOnDestroy(): void {
    if (this.slideTimer) clearInterval(this.slideTimer);
  }
}
