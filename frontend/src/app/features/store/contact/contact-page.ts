import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1 class="page-title">Contact Us</h1>
      <p class="page-sub">We'd love to hear from you</p>

      <div class="contact-layout">
        <div class="contact-info">
          <div class="info-card">
            <h3>Rajhans Ecommerce</h3>
            <p>Bhopal, Madhya Pradesh, India</p>
            <p>support&#64;rajhans.com</p>
            <p>+91 98765 43210</p>
          </div>
          <div class="info-card">
            <h3>Business Hours</h3>
            <p>Mon — Sat: 10:00 AM — 7:00 PM</p>
            <p>Sunday: Closed</p>
          </div>
        </div>

        <form class="contact-form" (ngSubmit)="submit()">
          <div class="form-field"><label>Name</label><input [(ngModel)]="form.name" name="name" required /></div>
          <div class="form-field"><label>Email</label><input [(ngModel)]="form.email" name="email" type="email" required /></div>
          <div class="form-field"><label>Subject</label><input [(ngModel)]="form.subject" name="subject" required /></div>
          <div class="form-field"><label>Message</label><textarea [(ngModel)]="form.message" name="message" rows="5" required></textarea></div>
          <button class="btn-submit" type="submit" [disabled]="submitted()">
            {{ submitted() ? 'Thank you!' : 'Send Message' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:900px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; text-align:center; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; text-align:center; margin:0 0 $space-xxl; }
    .contact-layout { display:grid; grid-template-columns: 1fr 1fr; gap: $space-xxl; }
    @media(max-width:768px) { .contact-layout { grid-template-columns:1fr; } }
    .info-card { padding: $space-xl; background: $color-bg-secondary; border-radius: $radius-xl; margin-bottom: $space-md;
      h3 { font-size: $font-size-md; font-weight: $font-weight-bold; margin:0 0 $space-sm; }
      p { font-size: $font-size-sm; color: $color-text-secondary; margin: $space-xxs 0; }
    }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, textarea { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; resize:vertical; &:focus { border-color: $color-primary; box-shadow: $shadow-glow; } }
    }
    .btn-submit { width:100%; padding: $space-md; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-lg; font-size: $font-size-md; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast;
      &:hover:not(:disabled) { background: $color-primary-hover; }
      &:disabled { background: $color-success; }
    }
  `],
})
export class ContactPageComponent {
  readonly submitted = signal(false);
  form = { name: '', email: '', subject: '', message: '' };

  submit(): void {
    // For now, just show success (future: POST to backend)
    this.submitted.set(true);
    setTimeout(() => this.submitted.set(false), 3000);
  }
}
