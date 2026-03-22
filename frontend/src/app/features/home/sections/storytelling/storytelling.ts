import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-storytelling',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './storytelling.html',
  styleUrls: ['./storytelling.scss'],
})
export class StorytellingComponent implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef);
  private ctx: gsap.Context | null = null;

  ngAfterViewInit(): void {
    const root = this.el.nativeElement as HTMLElement;

    this.ctx = gsap.context(() => {
      const section = root.querySelector('.story')!;
      const numberEl = root.querySelector('.story__number');

      // Point 1: Parallax scrub on "03" number
      if (numberEl) {
        gsap.to(numberEl, {
          yPercent: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        });
      }

      // Entrance animation
      ScrollTrigger.create({
        trigger: section,
        start: 'top 70%',
        once: true,
        onEnter: () => {
          const tl = gsap.timeline();

          // Separator draws across
          tl.from(root.querySelector('.story__separator')!, {
            scaleX: 0, transformOrigin: 'left', duration: 0.8, ease: 'expo.out',
          });

          // Ring expands
          const ring = root.querySelector('.story__ring');
          if (ring) {
            tl.from(ring, {
              scale: 0.5, opacity: 0, duration: 0.8, ease: 'expo.out',
            }, '-=0.5');
          }

          // Number fades in with scale
          if (numberEl) {
            tl.from(numberEl, {
              opacity: 0, scale: 0.7, duration: 1, ease: 'expo.out',
            }, '-=0.6');
          }

          // Label
          tl.from(root.querySelector('.story__label')!, {
            opacity: 0, y: 10, duration: 0.5, ease: 'expo.out',
          }, '-=0.6');

          // Headline lines stagger
          tl.from(root.querySelectorAll('.story__line'), {
            opacity: 0, y: 30, duration: 0.8, ease: 'expo.out', stagger: 0.1,
          }, '-=0.4');

          // Vertical rule draws down
          tl.from(root.querySelector('.story__rule')!, {
            scaleY: 0, duration: 0.8, ease: 'expo.out',
          }, '-=0.4');

          // Body text
          tl.from(root.querySelector('.story__body')!, {
            opacity: 0, y: 15, duration: 0.6, ease: 'expo.out',
          }, '-=0.4');

          // CTA
          tl.from(root.querySelector('.story__cta')!, {
            opacity: 0, y: 10, duration: 0.5, ease: 'expo.out',
          }, '-=0.3');

          // Stats stagger in
          tl.from(root.querySelectorAll('.story__stat'), {
            opacity: 0, y: 15, duration: 0.5, ease: 'expo.out', stagger: 0.08,
          }, '-=0.2');

          tl.from(root.querySelectorAll('.story__stat-divider'), {
            scaleY: 0, duration: 0.4, ease: 'expo.out', stagger: 0.06,
          }, '-=0.4');

          // Bottom closer
          tl.from(root.querySelector('.story__closer')!, {
            scaleX: 0, duration: 0.6, ease: 'expo.out',
          }, '-=0.2');
        },
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
