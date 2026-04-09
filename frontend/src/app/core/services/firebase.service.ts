import { Injectable, inject } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { PlatformService } from './platform.service';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly platform = inject(PlatformService);
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private confirmationResult: ConfirmationResult | null = null;
  private recaptchaVerifier: RecaptchaVerifier | null = null;

  constructor() {
    // Only initialize Firebase in browser environment
    if (this.platform.isBrowser) {
      this.app = initializeApp(environment.firebase);
      this.auth = getAuth(this.app);
      this.auth.useDeviceLanguage();
    }
  }

  initRecaptcha(containerId: string): void {
    // Only initialize in browser
    if (!this.platform.isBrowser || !this.auth) return;

    // Clean up existing verifier
    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch {
        // ignore cleanup errors
      }
    }

    this.recaptchaVerifier = new RecaptchaVerifier(this.auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        this.initRecaptcha(containerId);
      },
    });
  }

  async sendOtp(phoneNumber: string): Promise<void> {
    if (!this.platform.isBrowser || !this.auth) {
      throw new Error('Firebase not initialized');
    }
    if (!this.recaptchaVerifier) {
      throw new Error('reCAPTCHA not initialized');
    }

    const fullNumber = `+91${phoneNumber}`;

    try {
      this.confirmationResult = await signInWithPhoneNumber(
        this.auth,
        fullNumber,
        this.recaptchaVerifier,
      );
    } catch (err: unknown) {

      // Re-init recaptcha after failure
      this.initRecaptcha('recaptcha-container');

      // Provide user-friendly error messages
      const error = err as { code?: string; message?: string };
      switch (error.code) {
        case 'auth/invalid-phone-number':
          throw new Error('Invalid phone number format');
        case 'auth/too-many-requests':
          throw new Error('Too many attempts. Please try again later.');
        case 'auth/captcha-check-failed':
          throw new Error('reCAPTCHA verification failed. Please try again.');
        case 'auth/quota-exceeded':
          throw new Error('SMS quota exceeded. Please try again later.');
        default:
          throw new Error(error.message || 'Failed to send OTP');
      }
    }
  }

  async verifyOtp(otp: string): Promise<string> {
    if (!this.platform.isBrowser) {
      throw new Error('Cannot verify OTP on server');
    }
    if (!this.confirmationResult) {
      throw new Error('No OTP was sent. Please request a new one.');
    }

    try {
      const credential = await this.confirmationResult.confirm(otp);
      const idToken = await credential.user.getIdToken();
      return idToken;
    } catch (err: unknown) {
      const error = err as { code?: string };
      switch (error.code) {
        case 'auth/invalid-verification-code':
          throw new Error('Invalid OTP. Please check and try again.');
        case 'auth/code-expired':
          throw new Error('OTP expired. Please request a new one.');
        default:
          throw new Error('Verification failed. Please try again.');
      }
    }
  }

  cleanup(): void {
    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      this.recaptchaVerifier = null;
    }
    this.confirmationResult = null;
  }
}
