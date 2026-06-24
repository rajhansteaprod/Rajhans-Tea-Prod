import { Directive, ElementRef, Input, OnInit, OnDestroy, Inject, PLATFORM_ID, Renderer2 } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements OnInit, OnDestroy {
  @Input('appScrollReveal') appScrollReveal: number = 0;
  @Input() revealDelayStep: number = 120; // 120ms delay per card index for visible left-to-right stagger

  // Shared static observer instance and element callbacks
  private static observer: IntersectionObserver | null = null;
  private static elementsMap = new WeakMap<Element, () => void>();

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const element = this.el.nativeElement;

    // Apply the initial fade-out/down CSS class
    this.renderer.addClass(element, 'reveal-init');

    // Calculate staggered delay based on card index
    const delay = this.appScrollReveal * this.revealDelayStep;

    // Set transition styles inline with !important level weight by setting them on the element's style attribute
    this.renderer.setStyle(element, 'transition-property', 'opacity, transform');
    this.renderer.setStyle(element, 'transition-duration', '840ms');
    this.renderer.setStyle(element, 'transition-timing-function', 'cubic-bezier(0.16, 1, 0.3, 1)');
    this.renderer.setStyle(element, 'transition-delay', `${delay}ms`);

    // Register with the shared IntersectionObserver after a layout settling delay
    setTimeout(() => {
      this.registerWithObserver(element);
    }, 150);
  }

  private registerWithObserver(element: Element): void {
    const callback = () => {
      this.renderer.addClass(element, 'reveal-active');
      ScrollRevealDirective.unobserve(element);
    };

    ScrollRevealDirective.elementsMap.set(element, callback);

    if (!ScrollRevealDirective.observer) {
      ScrollRevealDirective.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const cb = ScrollRevealDirective.elementsMap.get(entry.target);
              if (cb) {
                cb();
              }
            }
          });
        },
        {
          root: null, // use viewport
          rootMargin: '0px 0px -40px 0px', // trigger 40px inside the bottom viewport fold
          threshold: 0.05, // trigger when 5% visible
        }
      );
    }

    ScrollRevealDirective.observer.observe(element);
  }

  private static unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element);
    }
    this.elementsMap.delete(element);
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      ScrollRevealDirective.unobserve(this.el.nativeElement);
    }
  }
}
