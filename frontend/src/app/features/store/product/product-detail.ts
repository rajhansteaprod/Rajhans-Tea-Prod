import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { CartStore } from '../../../core/services/cart.store';
import { ReviewStore, RatingSummary } from '../../../core/services/review.store';
import { ProductRailComponent } from '../../../shared/components/product-rail/product-rail';
import { ProductReviewsComponent } from './reviews/product-reviews';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductRailComponent, ProductReviewsComponent],
  templateUrl: './product-detail.html',
  styleUrls: ['./product-detail.scss'],
})
export class ProductDetailComponent implements OnInit {
  readonly cartStore = inject(CartStore);

  private readonly reviewStore = inject(ReviewStore);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly api = environment.apiUrl;
  readonly Math = Math;

  readonly product = signal<any>(null);
  readonly selectedImage = signal<string | null>(null);
  readonly ratingSummary = signal<RatingSummary | null>(null);
  readonly recos = signal<any>(null);
  readonly copied = signal(false);
  readonly quantity = signal(1);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];
      this.http.get<{ data: any }>(`${this.api}/catalog/products/${slug}`).subscribe({
        next: (res) => {
          this.product.set(res.data);
          this.selectedImage.set(res.data.images?.[0] || null);

          // SEO
          this.titleService.setTitle(`${res.data.name} — Rajhans Tea`);
          this.meta.updateTag({ name: 'description', content: res.data.shortDescription || res.data.name });
          this.meta.updateTag({ property: 'og:title', content: res.data.name });
          this.meta.updateTag({ property: 'og:description', content: res.data.shortDescription || '' });
          if (res.data.images?.[0]) this.meta.updateTag({ property: 'og:image', content: res.data.images[0] });

          // Load rating summary
          this.reviewStore.getRatingSummary(res.data._id).subscribe({
            next: (r) => this.ratingSummary.set(r.data),
          });
        },
      });
    });
  }

  incrementQty(): void {
    const max = this.product()?.trackInventory ? this.product().stock : 99;
    if (this.quantity() < max) this.quantity.set(this.quantity() + 1);
  }

  decrementQty(): void {
    if (this.quantity() > 1) this.quantity.set(this.quantity() - 1);
  }

  addToCart(): void {
    if (this.product()) this.cartStore.addItem(this.product()._id, this.quantity());
  }

  buyNow(): void {
    if (this.product()) {
      this.cartStore.addItem(this.product()._id, this.quantity());
      this.router.navigate(['/checkout']);
    }
  }

  shareWhatsApp(): void {
    const url = window.location.href;
    const text = `Check out ${this.product()?.name} on Rajhans Tea: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  copyLink(): void {
    navigator.clipboard.writeText(window.location.href);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
