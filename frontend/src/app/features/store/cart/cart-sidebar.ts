import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/services/cart.store';

@Component({
  selector: 'app-cart-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cart-sidebar.html',
  styleUrls: ['./cart-sidebar.scss'],
})
export class CartSidebarComponent {
  readonly cart = inject(CartStore);
}
