import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color: string };
  handler?: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class RazorpayService {
  private scriptLoaded = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Loads Razorpay checkout.js script (once).
   */
  private loadScript(): Promise<void> {
    if (this.scriptLoaded) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Razorpay script'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  /**
   * Opens Razorpay checkout modal.
   * Resolves with payment response on success, rejects on dismiss/failure.
   */
  async openCheckout(options: {
    orderId: string;
    amountPaise: number;
    currency: string;
    keyId: string;
    prefill?: { name?: string; contact?: string };
  }): Promise<RazorpayResponse> {
    await this.loadScript();

    return new Promise<RazorpayResponse>((resolve, reject) => {
      console.log('[Razorpay] Opening checkout with:', {
        key: options.keyId,
        amount: options.amountPaise,
        currency: options.currency,
        order_id: options.orderId,
      });
      const rzp = new window.Razorpay({
        key: options.keyId,
        amount: options.amountPaise,
        currency: options.currency,
        order_id: options.orderId,
        name: 'RnD Ecommerce',
        description: 'Order Payment',
        prefill: options.prefill,
        theme: { color: '#CC5803' },
        handler: (response: RazorpayResponse) => {
          resolve(response);
        },
        modal: {
          ondismiss: () => {
            reject(new Error('Payment cancelled by user'));
          },
        },
      });
      rzp.open();
    });
  }
}
