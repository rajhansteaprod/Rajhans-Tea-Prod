import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  template: `
    <div class="layout">
      <app-header />
      <main class="content">
        <div class="content-inner">
          <router-outlet />
        </div>
      </main>
      <footer class="footer">
        Rajhans Ecommerce &copy; 2026
      </footer>
    </div>
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
      text-align: center;
      padding: $space-lg;
      color: $color-text-tertiary;
      font-size: $font-size-sm;
      border-top: 1px solid $color-border-light;
    }
  `],
})
export class MainLayoutComponent {}
