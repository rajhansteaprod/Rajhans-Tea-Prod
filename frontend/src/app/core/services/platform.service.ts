import { Injectable, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';

/**
 * Platform Detection Service
 * Provides utilities to determine if code is running in browser or server environment
 * Essential for SSR-safe component development
 */
@Injectable({
  providedIn: 'root',
})
export class PlatformService {
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Check if code is running in browser environment
   */
  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Check if code is running in server environment
   */
  get isServer(): boolean {
    return isPlatformServer(this.platformId);
  }

  /**
   * Safe access to window object (returns undefined on server)
   */
  get window(): Window | undefined {
    return this.isBrowser ? window : undefined;
  }

  /**
   * Safe access to document object (returns undefined on server)
   */
  get document(): Document | undefined {
    return this.isBrowser ? document : undefined;
  }

  /**
   * Safe access to localStorage (returns mock on server)
   */
  get localStorage(): Storage {
    if (this.isBrowser) {
      return window.localStorage;
    }
    // Return a no-op storage implementation for server
    return new MockStorage();
  }

  /**
   * Safe access to sessionStorage (returns mock on server)
   */
  get sessionStorage(): Storage {
    if (this.isBrowser) {
      return window.sessionStorage;
    }
    // Return a no-op storage implementation for server
    return new MockStorage();
  }

  /**
   * Check if browser supports a specific API
   */
  supportsLocalStorage(): boolean {
    if (!this.isBrowser) return false;
    try {
      const test = '__localStorage_test__';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute code only in browser
   */
  runInBrowser(callback: () => void): void {
    if (this.isBrowser) {
      callback();
    }
  }

  /**
   * Execute code only on server
   */
  runOnServer(callback: () => void): void {
    if (this.isServer) {
      callback();
    }
  }

  /**
   * Execute code based on platform
   */
  runOnPlatform(browserCallback: () => void, serverCallback?: () => void): void {
    if (this.isBrowser) {
      browserCallback();
    } else if (serverCallback) {
      serverCallback();
    }
  }
}

/**
 * Mock Storage implementation for server-side rendering
 * Prevents errors when code tries to access localStorage/sessionStorage on server
 */
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
