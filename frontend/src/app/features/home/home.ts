import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="home">
      <div class="hero">
        <div class="hero-badge">New Collection 2026</div>
        <h1 class="hero-title">
          <span>Premium Shopping,</span>
          <span class="accent">Reimagined.</span>
        </h1>
        <p class="hero-desc">
          Discover curated collections crafted for the modern lifestyle.
          Quality meets elegance at Rajhans.
        </p>
        <div class="hero-actions">
          @if (authService.isLoggedIn()) {
            <a routerLink="/dashboard" class="btn-primary">Go to Dashboard</a>
          } @else {
            <a routerLink="/auth/login" class="btn-primary">Get Started</a>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    @use '../../core/design-tokens/tokens' as *;

    .home {
      padding: $space-xxxl 0;
    }

    .hero {
      text-align: center;
      max-width: 640px;
      margin: 0 auto;
    }

    .hero-badge {
      display: inline-block;
      background: $color-primary-light;
      color: $color-primary;
      padding: $space-xs $space-md;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-wide;
      text-transform: uppercase;
      margin-bottom: $space-lg;
    }

    .hero-title {
      font-family: $font-family-display;
      font-size: $font-size-display;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      line-height: $line-height-tight;
      letter-spacing: $letter-spacing-tight;
      margin-bottom: $space-lg;

      span { display: block; }

      .accent {
        color: $color-primary;
      }
    }

    .hero-desc {
      font-size: $font-size-lg;
      color: $color-text-tertiary;
      line-height: $line-height-relaxed;
      margin-bottom: $space-xl;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      padding: $space-md $space-xl;
      background: $color-primary;
      color: $color-text-inverse;
      border-radius: $radius-lg;
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      text-decoration: none;
      transition: all $transition-normal;

      &:hover {
        background: $color-primary-hover;
        color: $color-text-inverse;
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(204, 88, 3, 0.25);
      }
    }
  `],
})
export class HomeComponent {
  constructor(public authService: AuthService) {}
}
