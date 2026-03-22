import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService, Product } from '../../../../core/services/catalog.service';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-explore-cta',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './explore-cta.html',
  styleUrls: ['./explore-cta.scss'],
})
export class ExploreCtaComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly catalogService = inject(CatalogService);
  private ctx: gsap.Context | null = null;

  readonly products = signal<Product[]>([]);

  ngOnInit(): void {
    this.catalogService
      .getProductsPublic({ limit: 10, sortBy: 'createdAt', sortOrder: 'desc' })
      .subscribe({ next: (res) => this.products.set(res.data) });
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    this.ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.querySelector('.explore')!,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          const tl = gsap.timeline();

          tl.from(root.querySelector('.explore__eyebrow')!, {
            opacity: 0, y: 10, duration: 0.5, ease: 'expo.out',
          });

          tl.from(root.querySelectorAll('.explore__h-line'), {
            opacity: 0, y: 30, duration: 0.7, ease: 'expo.out', stagger: 0.12,
          }, '-=0.3');

          tl.from(root.querySelector('.explore__sub')!, {
            opacity: 0, y: 15, duration: 0.5, ease: 'expo.out',
          }, '-=0.3');

          // CTA: only animate y + scale, NOT opacity — CTA must always be visible
          tl.from(root.querySelector('.explore__cta')!, {
            y: 20, scale: 0.95, duration: 0.6, ease: 'expo.out',
          }, '-=0.2');
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
