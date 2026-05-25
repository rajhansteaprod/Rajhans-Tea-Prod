import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Product, ProductVariant } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './product-card.html',
  styleUrls: ['./product-card.scss'],
})
export class ProductCardComponent {
  @Input() product!: Product;
  @Input() isHovering = false;
  @Input() isWishlisted = false;
  @Input() getRating: () => number = () => 5;
  @Input() getReviewCount: () => number = () => 0;

  @Output() imageHover = new EventEmitter<boolean>();
  @Output() toggleWishlistClick = new EventEmitter<Event>();
  @Output() addToCartClick = new EventEmitter<{ event: Event; variantId?: string }>();
  @Output() buyNowClick = new EventEmitter<{ event: Event; variantId?: string }>();
  @Output() cardClick = new EventEmitter<void>();

  // Variant selection
  selectedVariantId = signal<string | undefined>(undefined);

  ngOnInit(): void {
    // Default to first variant if available
    if (this.product.variants && this.product.variants.length > 0) {
      this.selectedVariantId.set(this.product.variants[0]._id);
    }
  }

  getSelectedVariant(): ProductVariant | undefined {
    if (!this.selectedVariantId() || !this.product.variants) return undefined;
    return this.product.variants.find(v => v._id === this.selectedVariantId());
  }

  getDisplayPrice(): number {
    const variant = this.getSelectedVariant();
    if (variant) {
      return variant.discountedPrice ?? variant.price;
    }
    return this.product.discountedPrice ?? this.product.basePrice;
  }

  getOriginalPrice(): number | undefined {
    const variant = this.getSelectedVariant();
    if (variant && variant.discountedPrice && variant.discountedPrice < variant.price) {
      return variant.price;
    }
    if (!variant && this.product.discountedPrice && this.product.discountedPrice < this.product.basePrice) {
      return this.product.basePrice;
    }
    return undefined;
  }

  onHover(isHovering: boolean): void {
    this.imageHover.emit(isHovering);
  }

  onToggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleWishlistClick.emit(event);
  }

  onAddToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addToCartClick.emit({ event, variantId: this.selectedVariantId() });
  }

  onBuyNow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.buyNowClick.emit({ event, variantId: this.selectedVariantId() });
  }

  onCardClick(): void {
    this.cardClick.emit();
  }

  onVariantChange(variantId: string): void {
    this.selectedVariantId.set(variantId);
  }
}
