import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title, Meta, DomSanitizer, SafeHtml } from '@angular/platform-browser';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface Value {
  title: string;
  desc: string;
  icon: SafeHtml;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './about.html',
  styleUrls: ['./about.scss'],
})
export class AboutComponent implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly sanitizer = inject(DomSanitizer);
  private ctx: gsap.Context | null = null;

  readonly values: Value[] = [
    {
      title: 'Purity',
      desc: 'No artificial flavours, no chemicals. Just tea, the way nature intended.',
      icon: this.svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    },
    {
      title: 'Freshness',
      desc: 'Sealed within hours of processing. Every packet is as fresh as the garden.',
      icon: this.svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'),
    },
    {
      title: 'Consistency',
      desc: 'Same bold taste, same rich colour, same aroma — cup after cup, packet after packet.',
      icon: this.svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
    },
    {
      title: 'Accessibility',
      desc: 'Premium quality at honest prices. Great chai shouldn\'t be a luxury.',
      icon: this.svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
    },
  ];

  private svg(paths: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    );
  }

  constructor() {
    this.titleService.setTitle('About Us — Rajhans Tea');
    this.metaService.updateTag({
      name: 'description',
      content: 'Learn about Rajhans Tea — our story, our values, and our commitment to delivering fresh, authentic chai to every Indian household.',
    });
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    this.ctx = gsap.context(() => {
      // Hero entrance
      const heroTl = gsap.timeline({ delay: 0.15 });
      heroTl.from(root.querySelector('.about-hero__eyebrow')!, {
        opacity: 0, y: 10, duration: 0.5, ease: 'expo.out',
      });
      heroTl.from(root.querySelectorAll('.about-hero__line'), {
        opacity: 0, y: 30, duration: 0.7, ease: 'expo.out', stagger: 0.1,
      }, '-=0.3');
      heroTl.from(root.querySelector('.about-hero__sub')!, {
        opacity: 0, y: 15, duration: 0.5, ease: 'expo.out',
      }, '-=0.3');
      heroTl.from(root.querySelector('.about-hero__divider')!, {
        scaleX: 0, duration: 0.6, ease: 'expo.out',
      }, '-=0.2');

      // Origin section
      ScrollTrigger.create({
        trigger: root.querySelector('.origin')!,
        start: 'top 70%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.origin__frame')!, {
            opacity: 0, scale: 0.9, duration: 0.7, ease: 'expo.out',
          });
          gsap.from(root.querySelector('.origin__content')!, {
            opacity: 0, x: 30, duration: 0.7, ease: 'expo.out', delay: 0.15,
          });
        },
      });

      // Mission quote
      ScrollTrigger.create({
        trigger: root.querySelector('.mission')!,
        start: 'top 70%',
        once: true,
        onEnter: () => {
          const tl = gsap.timeline();
          tl.from(root.querySelector('.mission__quote-mark')!, {
            opacity: 0, scale: 0.5, duration: 0.5, ease: 'expo.out',
          });
          tl.from(root.querySelector('.mission__quote')!, {
            opacity: 0, y: 20, duration: 0.7, ease: 'expo.out',
          }, '-=0.2');
          tl.from(root.querySelector('.mission__attr')!, {
            opacity: 0, duration: 0.5, ease: 'expo.out',
          }, '-=0.2');
        },
      });

      // Values cards
      ScrollTrigger.create({
        trigger: root.querySelector('.values__grid')!,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelectorAll('.values__card'), {
            opacity: 0, y: 30, duration: 0.6, ease: 'expo.out', stagger: 0.1,
          });
        },
      });

      // Proof stats
      ScrollTrigger.create({
        trigger: root.querySelector('.proof')!,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelectorAll('.proof__item'), {
            opacity: 0, y: 20, duration: 0.5, ease: 'expo.out', stagger: 0.1,
          });
        },
      });

      // Founder
      ScrollTrigger.create({
        trigger: root.querySelector('.founder')!,
        start: 'top 70%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.founder__content')!, {
            opacity: 0, y: 25, duration: 0.7, ease: 'expo.out',
          });
        },
      });

      // CTA
      ScrollTrigger.create({
        trigger: root.querySelector('.about-cta')!,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.about-cta__headline')!, {
            opacity: 0, y: 20, duration: 0.6, ease: 'expo.out',
          });
          gsap.from(root.querySelector('.about-cta__btn')!, {
            y: 15, scale: 0.95, duration: 0.5, ease: 'expo.out', delay: 0.2,
          });
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
