import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { CartStore } from '../../../../core/services/cart.store';

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './featured-products.html',
  styleUrls: ['./featured-products.scss'],
})
export class FeaturedProductsComponent implements OnInit {
  private catalog = inject(CatalogService);
  readonly cart = inject(CartStore);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly imageIndices = signal<{ [key: string]: number }>({});

  ngOnInit(): void {
    this.catalog.getProductsPublic({ isFeatured: true, limit: 12 }).subscribe({
      next: (res) => {
        this.products.set(res.data);
        const indices: { [key: string]: number } = {};
        res.data.forEach(p => indices[p._id] = 0);
        this.imageIndices.set(indices);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getProductImage(product: Product): string {
    const idx = this.imageIndices()[product._id] || 0;
    return product.images[idx] || product.images[0];
  }

  nextImage(product: Product, e: Event): void {
    e.stopPropagation();
    const idx = this.imageIndices()[product._id] || 0;
    const nextIdx = (idx + 1) % product.images.length;
    this.imageIndices.update(indices => ({
      ...indices,
      [product._id]: nextIdx
    }));
  }

  prevImage(product: Product, e: Event): void {
    e.stopPropagation();
    const idx = this.imageIndices()[product._id] || 0;
    const prevIdx = idx === 0 ? product.images.length - 1 : idx - 1;
    this.imageIndices.update(indices => ({
      ...indices,
      [product._id]: prevIdx
    }));
  }

  selectImage(product: Product, index: number): void {
    this.imageIndices.update(indices => ({
      ...indices,
      [product._id]: index
    }));
  }

  getRating(): number {
    return 4;
  }

  getReviewCount(): number {
    return 0;
  }

  addToCart(product: Product): void {
    this.cart.addItem(product._id, 1);
  }
}
