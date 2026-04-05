import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { ProductCardComponent } from '../../../../shared/components/product-card/product-card';

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule, ProductCardComponent],
  templateUrl: './featured-products.html',
  styleUrls: ['./featured-products.scss'],
})
export class FeaturedProductsComponent implements OnInit {
  private catalog = inject(CatalogService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly currentIndex = signal(0);

  readonly showArrows = computed(() => this.products().length > 3);
  readonly canPrev = computed(() => this.currentIndex() > 0);
  readonly canNext = computed(() => this.currentIndex() + 3 < this.products().length);

  private startX = 0;
  private isDragging = false;

  ngOnInit(): void {
    this.catalog.getProductsPublic({ isFeatured: true, limit: 12 }).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  prev(): void {
    if (this.canPrev()) this.currentIndex.update(i => i - 1);
  }

  next(): void {
    if (this.canNext()) this.currentIndex.update(i => i + 1);
  }

  readonly visibleProducts = computed(() =>
    this.products().slice(this.currentIndex(), this.currentIndex() + 3)
  );

  onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.startX = e.clientX;
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const diff = this.startX - e.clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) this.next();
      else this.prev();
      this.isDragging = false;
    }
  }

  onMouseUp(): void {
    this.isDragging = false;
  }

  onTouchStart(e: TouchEvent): void {
    this.isDragging = true;
    this.startX = e.touches[0].clientX;
  }

  onTouchMove(e: TouchEvent): void {
    if (!this.isDragging) return;

    const diff = this.startX - e.touches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) this.next();
      else this.prev();
      this.isDragging = false;
    }
  }

  onTouchEnd(): void {
    this.isDragging = false;
  }
}
