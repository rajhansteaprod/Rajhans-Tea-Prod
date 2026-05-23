import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Product } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
  @Output() addToCartClick = new EventEmitter<Event>();
  @Output() buyNowClick = new EventEmitter<Event>();
  @Output() cardClick = new EventEmitter<void>();
  ngOnInit(): void {
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
    this.addToCartClick.emit(event);
  }

  onBuyNow(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.buyNowClick.emit(event);
  }

  onCardClick(): void {
    this.cardClick.emit();
  }
}
