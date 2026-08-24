import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Single source of truth for the <link rel="canonical"> tag.
 *
 * Previously the canonical was a static homepage URL hardcoded in index.html, and
 * only a handful of components overrode it — so every other indexable route
 * declared the homepage as its canonical (a site-wide "duplicate of homepage"
 * signal). This service sets a self-referential canonical for the current route
 * on every navigation, so it is correct for ALL indexable pages without touching
 * each component. It runs during build-time prerendering (the root component is
 * rendered for each route) and on client-side navigation.
 *
 * Private / non-indexable route trees are skipped so their existing strategy is
 * left untouched. Components that intentionally set a specific canonical still win
 * because their ngOnInit runs after NavigationEnd — this only provides the correct
 * self-canonical default.
 */
@Injectable({ providedIn: 'root' })
export class CanonicalService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  private readonly origin = 'https://rajhanstea.com';

  /** Route prefixes that are non-indexable/private — leave their canonical alone. */
  private readonly skipPrefixes = [
    '/auth', '/checkout', '/cart', '/order-confirmation', '/orders', '/dashboard',
    '/admin', '/wishlist', '/track-order', '/error', '/404', '/review',
  ];

  init(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.apply(e.urlAfterRedirects));
  }

  private apply(url: string): void {
    const path = (url.split('#')[0].split('?')[0]) || '/';
    if (this.skipPrefixes.some((p) => path === p || path.startsWith(`${p}/`))) return;

    // Self-canonical with the site's trailing-slash convention.
    const canonicalPath = path === '/' ? '/' : path.endsWith('/') ? path : `${path}/`;
    this.setCanonical(`${this.origin}${canonicalPath}`);
  }

  private setCanonical(href: string): void {
    let link = this.doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
