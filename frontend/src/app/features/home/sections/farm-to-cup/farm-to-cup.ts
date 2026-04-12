import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface JourneyStep {
  id: number;
  num: string;
  title: string;
  desc: string;
  icon: SafeHtml;
}

@Component({
  selector: 'app-farm-to-cup',
  standalone: true,
  imports: [],
  templateUrl: './farm-to-cup.html',
  styleUrls: ['./farm-to-cup.scss'],
})
export class FarmToCupComponent implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);
  private ctx: gsap.Context | null = null;

  readonly steps: JourneyStep[] = [
    {
      id: 1,
      num: '01',
      title: 'Sourced from the Hills',
      desc: 'Our CTC leaves come from high-altitude farms in Assam, where the climate creates naturally bold flavour.',
      icon: this.icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    },
    {
      id: 2,
      num: '02',
      title: 'Handpicked with Care',
      desc: 'Skilled farmers hand-select only the finest leaves — no machine harvesting, no compromise on quality.',
      icon: this.icon('<path d="M18 11V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v5M12 17v4M8 21h8"/><path d="M7 11a5 5 0 0 0 10 0"/>'),
    },
    {
      id: 3,
      num: '03',
      title: 'Naturally Processed',
      desc: 'No artificial flavouring. No chemicals. Just orthodox and CTC processing that preserves the leaf\'s natural oils.',
      icon: this.icon('<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>'),
    },
    {
      id: 4,
      num: '04',
      title: 'Sealed Fresh',
      desc: 'Packed within hours of processing in airtight pouches to lock in aroma, colour, and strength.',
      icon: this.icon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'),
    },
    {
      id: 5,
      num: '05',
      title: 'Delivered to Your Door',
      desc: 'Pan-India delivery, tracked and insured. From our warehouse to your kitchen — fast and reliable.',
      icon: this.icon('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8zM5 19a2 2 0 1 0 4 0M15 19a2 2 0 1 0 4 0"/>'),
    },
  ];

  private icon(paths: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    );
  }

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    this.ctx = gsap.context(() => {
      const section = root.querySelector('.ftc')!;
      const lineFill = root.querySelector('.ftc__line-fill');

      // Line fill on scroll
      if (lineFill) {
        gsap.to(lineFill, {
          height: '100%',
          ease: 'none',
          scrollTrigger: {
            trigger: root.querySelector('.ftc__journey')!,
            start: 'top 60%',
            end: 'bottom 40%',
            scrub: 0.8,
          },
        });
      }

      // Intro reveal
      ScrollTrigger.create({
        trigger: root.querySelector('.ftc__intro')!,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          const tl = gsap.timeline();
          tl.from(root.querySelector('.ftc__eyebrow')!, {
            opacity: 0, y: 12, duration: 0.5, ease: 'expo.out',
          });
          tl.from(root.querySelectorAll('.ftc__headline-line'), {
            opacity: 0, y: 25, duration: 0.7, ease: 'expo.out', stagger: 0.1,
          }, '-=0.3');
          tl.from(root.querySelector('.ftc__subtitle')!, {
            opacity: 0, y: 15, duration: 0.6, ease: 'expo.out',
          }, '-=0.3');
        },
      });

      // Each step reveals on scroll
      root.querySelectorAll('.ftc__step').forEach((step) => {
        ScrollTrigger.create({
          trigger: step,
          start: 'top 72%',
          once: true,
          onEnter: () => {
            const isReverse = step.classList.contains('ftc__step--reverse');
            const xFrom = isReverse ? 40 : -40;

            gsap.from(step.querySelector('.ftc__icon-wrap')!, {
              scale: 0.5, opacity: 0, duration: 0.6, ease: 'expo.out',
            });

            gsap.from(step.querySelector('.ftc__content')!, {
              x: xFrom, opacity: 0, duration: 0.7, ease: 'expo.out', delay: 0.15,
            });
          },
        });
      });

      // Closing
      ScrollTrigger.create({
        trigger: root.querySelector('.ftc__close')!,
        start: 'top 80%',
        once: true,
        onEnter: () => {
          gsap.from(root.querySelector('.ftc__close-icon')!, {
            scale: 0.6, opacity: 0, duration: 0.7, ease: 'expo.out',
          });
          gsap.from(root.querySelector('.ftc__close-text')!, {
            opacity: 0, y: 15, duration: 0.6, ease: 'expo.out', delay: 0.2,
          });
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
