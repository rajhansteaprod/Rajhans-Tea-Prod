import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.html',
  styleUrls: ['./product-card.scss'],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() layout: 'vertical' | 'horizontal' = 'vertical';
  @Input() wishlisted = false;
  @Output() addToCart = new EventEmitter<string>();
  @Output() toggleWishlist = new EventEmitter<string>();

  onAddToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addToCart.emit(this.product._id);
  }

  onToggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleWishlist.emit(this.product._id);
  }
}
