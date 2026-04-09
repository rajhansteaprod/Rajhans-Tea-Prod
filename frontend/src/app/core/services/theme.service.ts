import { Injectable, signal, effect, inject } from '@angular/core';
import { PlatformService } from './platform.service';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platform = inject(PlatformService);
  readonly theme = signal<Theme>(this.getInitialTheme());

  constructor() {
    effect(() => {
      const t = this.theme();
      // Only update DOM in browser
      if (this.platform.document) {
        this.platform.document.documentElement.setAttribute('data-theme', t);
      }
      this.platform.localStorage.setItem('theme', t);
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  private getInitialTheme(): Theme {
    const saved = this.platform.localStorage.getItem('theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;

    // Default to light theme on server, check system preference on browser
    if (!this.platform.isBrowser) return 'light';
    return this.platform.window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
