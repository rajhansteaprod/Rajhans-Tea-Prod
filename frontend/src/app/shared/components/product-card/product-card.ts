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
  /** Real computed average rating for this product (0 when no reviews) */
  @Input() averageRating = 0;
  /** Real review count for this product (0 when no reviews) */
  @Input() reviewCount = 0;

  @Output() imageHover = new EventEmitter<boolean>();
  @Output() toggleWishlistClick = new EventEmitter<Event>();
  @Output() addToCartClick = new EventEmitter<{ event: Event; variantId?: string }>();
  @Output() buyNowClick = new EventEmitter<{ event: Event; variantId?: string }>();
  @Output() cardClick = new EventEmitter<void>();

  // Variant selection
  selectedVariantId = signal<string | undefined>(undefined);

  // Carousel state
  currentImageIndex = signal<number>(0);

  /** Whole-star fill count (nearest whole; the star icons don't support half fills) */
  roundedRating(): number {
    return Math.round(this.averageRating);
  }

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

  getImages(): string[] {
    const images = this.product.images && this.product.images.length > 0 ? [...this.product.images] : [];
    if (this.product.primaryImage && !images.includes(this.product.primaryImage)) {
      images.unshift(this.product.primaryImage);
    } else if (this.product.primaryImage) {
      const idx = images.indexOf(this.product.primaryImage);
      if (idx > 0) {
        images.splice(idx, 1);
        images.unshift(this.product.primaryImage);
      }
    }
    return images.length > 0 ? images : ['/static/placeholder.png'];
  }

  getSecondaryImage(): string {
    const images = this.getImages();
    const currentIndex = this.currentImageIndex();
    
    // If user has navigated the carousel, preserve the current image on hover
    if (currentIndex > 0) {
      return `url('${images[currentIndex]}')`;
    }

    // Default hover logic when looking at the primary cover image
    if (this.product.reflectedImage && this.product.reflectedImage !== images[0]) {
      return `url('${this.product.reflectedImage}')`;
    } 
    if (images.length > 1) {
      return `url('${images[1]}')`;
    }
    
    // Fallback: stay on the primary image
    return `url('${images[0]}')`;
  }

  nextImage(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const images = this.getImages();
    if (images.length <= 1) return;
    this.currentImageIndex.update(i => (i + 1) % images.length);
  }

  prevImage(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const images = this.getImages();
    if (images.length <= 1) return;
    this.currentImageIndex.update(i => (i - 1 + images.length) % images.length);
  }

  setImage(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.currentImageIndex.set(index);
  }

  onHover(isHovering: boolean): void {
    this.imageHover.emit(isHovering);
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
