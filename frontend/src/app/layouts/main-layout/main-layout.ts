import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header';
import { FooterComponent } from './footer/footer';
import { CartSidebarComponent } from '../../features/store/cart/cart-sidebar';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HeaderComponent, FooterComponent, CartSidebarComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss'],
})
export class MainLayoutComponent {
  private readonly router = inject(Router);

  isCheckout = computed(() => {
    const url = this.router.url;
    return url.startsWith('/checkout') || url.includes('/checkout?');
  });
}
