import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './wishlist-page.html',
  styleUrls: ['./wishlist-page.scss'],
})
export class WishlistPageComponent implements OnInit {
  readonly cart = inject(CartStore);

  ngOnInit(): void {
    this.cart.loadWishlist();
  }

  addToCart(productId: string): void {
    this.cart.addToCartFromWishlist(productId);
  }
}
