import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import { CartStore } from '../../../../core/services/cart.store';
import { ProductCardComponent } from '../../../../shared/components/product-card/product-card';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-featured-products',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductCardComponent],
  templateUrl: './featured-products.html',
  styleUrls: ['./featured-products.scss'],
})
export class FeaturedProductsComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartStore);
  private readonly el = inject(ElementRef);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);

  private ctx: gsap.Context | null = null;

  ngOnInit(): void {
    this.catalog
      .getProductsPublic({ limit: 3, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({
        next: (res) => {
          this.products.set(res.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  addToCart(productId: string): void {
    this.cart.addItem(productId);
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    this.ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.querySelector('.featured')!,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.featured__header')!, {
            opacity: 0, y: 20, duration: 0.6, ease: 'expo.out',
          });

          gsap.from(root.querySelectorAll('.card'), {
            opacity: 0, y: 40, duration: 0.7, ease: 'expo.out',
            stagger: 0.12, delay: 0.2,
          });
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
