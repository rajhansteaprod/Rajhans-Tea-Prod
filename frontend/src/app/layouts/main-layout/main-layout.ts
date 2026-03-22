import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { HeaderComponent } from './header/header';
import { CartSidebarComponent } from '../../features/store/cart/cart-sidebar';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, HeaderComponent, CartSidebarComponent],
  template: `
    <div class="layout">
      <app-header />
      <main class="content">
        <div class="content-inner">
          <router-outlet />
        </div>
      </main>
      <footer class="footer">
        <div class="footer-inner">
          <div class="footer-grid">
            <div class="footer-col">
              <h4>Shop</h4>
              <a routerLink="/search">All Products</a>
              <a routerLink="/collections">Collections</a>
              <a routerLink="/search?sort=newest">New Arrivals</a>
            </div>
            <div class="footer-col">
              <h4>Company</h4>
              <a routerLink="/page/about-us">About Us</a>
              <a routerLink="/page/contact-us">Contact Us</a>
            </div>
            <div class="footer-col">
              <h4>Support</h4>
              <a routerLink="/page/terms-and-conditions">Terms & Conditions</a>
              <a routerLink="/page/privacy-policy">Privacy Policy</a>
              <a routerLink="/page/shipping-policy">Shipping Policy</a>
            </div>
            <div class="footer-col">
              <h4>Connect</h4>
              <p class="footer-text">Rajhans Tea</p>
              <p class="footer-text">Bhopal, Madhya Pradesh</p>
              <p class="footer-text">support&#64;rajhanstea.com</p>
            </div>
          </div>
          <div class="footer-bottom">
            <span>&copy; 2026 Rajhans Tea. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
    <app-cart-sidebar />
  `,
  styles: [`
    @use '../../core/design-tokens/tokens' as *;

    .layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: $color-bg-primary;
    }

    .content {
      flex: 1;
      padding: $space-lg $space-xxl;
    }

    .content-inner {
      max-width: 1200px;
      margin: 0 auto;
      min-height: 280px;
    }

    .footer {
      background: $color-bg-dark;
      color: rgba(252, 255, 247, 0.7);
      padding: $space-xxl $space-xxl $space-lg;
    }

    .footer-inner {
      max-width: 1200px;
      margin: 0 auto;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: $space-xxl;
      margin-bottom: $space-xxl;
    }

    @media (max-width: 768px) {
      .footer-grid { grid-template-columns: repeat(2, 1fr); gap: $space-lg; }
    }

    .footer-col {
      display: flex;
      flex-direction: column;
      gap: $space-xs;

      h4 {
        font-size: $font-size-sm;
        font-weight: $font-weight-bold;
        color: rgba(252, 255, 247, 0.9);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin: 0 0 $space-sm;
      }

      a {
        font-size: $font-size-sm;
        color: rgba(252, 255, 247, 0.6);
        text-decoration: none;
        transition: color $transition-fast;

        &:hover { color: $color-primary; }
      }
    }

    .footer-text {
      font-size: $font-size-sm;
      margin: 0;
      color: rgba(252, 255, 247, 0.5);
    }

    .footer-bottom {
      border-top: 1px solid rgba(252, 255, 247, 0.1);
      padding-top: $space-lg;
      text-align: center;
      font-size: $font-size-xs;
      color: rgba(252, 255, 247, 0.4);
    }
  `],
})
export class MainLayoutComponent {}
