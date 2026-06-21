import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a [routerLink]="href" class="logo-link">
      <span class="logo-text">{{ text }}</span>
    </a>
  `,
  styles: [`
    .logo-link {
      display: flex;
      align-items: center;
      text-decoration: none;
    }

    .logo-text {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 32px;
      font-weight: 900;
      color: #b35c3e;
      letter-spacing: -0.3px;
      line-height: 1;
      -webkit-text-stroke: 0.5px currentColor;
    }

    @media (max-width: 640px) {
      .logo-text {
        font-size: 30px;
      }
    }
  `]
})
export class LogoComponent {
  @Input() href: string = '/';
  @Input() text: string = 'Rajhans Tea';
}
