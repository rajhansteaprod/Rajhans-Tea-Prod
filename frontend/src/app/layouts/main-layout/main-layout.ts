import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from './header/header';
import { CartSidebarComponent } from '../../features/store/cart/cart-sidebar';
import { NewsletterService } from '../../core/services/newsletter.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, FormsModule, HeaderComponent, CartSidebarComponent],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss'],
})
export class MainLayoutComponent {
  private readonly newsletter = inject(NewsletterService);

  readonly newsletterEmail = signal<string>('');
  readonly newsletterLoading = signal<boolean>(false);
  readonly newsletterMessage = signal<string>('');
  readonly newsletterError = signal<boolean>(false);

  onNewsletterSubmit(event: Event): void {
    event.preventDefault();

    const email = this.newsletterEmail().trim();
    if (!email) return;

    this.newsletterLoading.set(true);
    this.newsletterMessage.set('');
    this.newsletterError.set(false);

    this.newsletter.subscribe(email).subscribe({
      next: () => {
        this.newsletterMessage.set('✓ Thank you for subscribing!');
        this.newsletterEmail.set('');
        this.newsletterLoading.set(false);

        // Clear message after 5 seconds
        setTimeout(() => {
          this.newsletterMessage.set('');
        }, 5000);
      },
      error: (err) => {
        this.newsletterMessage.set(err.message || 'Failed to subscribe. Please try again.');
        this.newsletterError.set(true);
        this.newsletterLoading.set(false);
      },
    });
  }
}
