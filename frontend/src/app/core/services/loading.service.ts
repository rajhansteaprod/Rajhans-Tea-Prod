import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  readonly loading = signal(false);

  start(): void {
    this.activeRequests++;
    this.loading.set(true);
  }

  stop(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      // Small delay to prevent flicker on fast requests
      setTimeout(() => {
        if (this.activeRequests === 0) this.loading.set(false);
      }, 200);
    }
  }
}
