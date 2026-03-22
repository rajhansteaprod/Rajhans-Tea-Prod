import { Component, signal, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class LoginComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('phoneInput') phoneInputEl!: ElementRef<HTMLInputElement>;

  step = signal<'phone' | 'otp'>('phone');
  phone = signal('');
  otp = signal('');
  otpDigits = signal<string[]>(['', '', '', '', '', '']);
  loading = signal(false);
  error = signal<string | null>(null);
  resendCooldown = signal(0);
  entered = signal(false);

  particles = [0, 1, 2, 3, 4, 5, 6, 7];
  otpSlots = [0, 1, 2, 3, 4, 5];

  private cooldownInterval: ReturnType<typeof setInterval> | null = null;
  private otpInputElements: HTMLInputElement[] = [];

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.firebaseService.initRecaptcha('recaptcha-container');
    setTimeout(() => this.entered.set(true), 100);

    if (this.route.snapshot.queryParamMap.get('reason') === 'banned') {
      this.error.set('Your account has been suspended. Contact support for assistance.');
    }
  }

  ngAfterViewInit(): void {
    if (this.phoneInputEl) {
      setTimeout(() => this.phoneInputEl.nativeElement.focus(), 800);
    }
  }

  ngOnDestroy(): void {
    this.clearCooldown();
    this.firebaseService.cleanup();
  }

  particleX(i: number): string {
    return (10 + i * 12) + '%';
  }

  particleSize(i: number): string {
    return (3 + (i % 3) * 2) + 'px';
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '').slice(0, 10);
    this.phone.set(cleaned);
    input.value = cleaned;
  }

  async onSendOtp(): Promise<void> {
    if (this.phone().length !== 10 || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      await this.firebaseService.sendOtp(this.phone());
      this.step.set('otp');
      this.startCooldown(60);
      // Focus first OTP input after transition
      setTimeout(() => this.focusOtpInput(0), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      this.error.set(msg);
      // Re-init recaptcha on failure
      this.firebaseService.initRecaptcha('recaptcha-container');
    } finally {
      this.loading.set(false);
    }
  }

  onOtpDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');

    const digits = [...this.otpDigits()];
    digits[index] = value.slice(-1);
    this.otpDigits.set(digits);
    this.otp.set(digits.join(''));

    if (value && index < 5) {
      this.focusOtpInput(index + 1);
    }

    // Auto-verify when all 6 digits entered
    if (digits.every((d) => d) && digits.join('').length === 6) {
      setTimeout(() => this.onVerifyOtp(), 150);
    }
  }

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.otpDigits()[index] && index > 0) {
      this.focusOtpInput(index - 1);
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || '';
    const digits = pasted.split('').concat(Array(6).fill('')).slice(0, 6);
    this.otpDigits.set(digits);
    this.otp.set(digits.join(''));

    const lastFilledIndex = Math.min(pasted.length - 1, 5);
    this.focusOtpInput(lastFilledIndex);

    if (pasted.length === 6) {
      setTimeout(() => this.onVerifyOtp(), 150);
    }
  }

  async onVerifyOtp(): Promise<void> {
    if (this.otp().length !== 6 || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      // Step 1: Verify OTP with Firebase → get ID token
      const idToken = await this.firebaseService.verifyOtp(this.otp());

      // Step 2: Send ID token to our backend → get JWT tokens
      this.authService.verifyFirebaseToken(idToken).subscribe({
        next: (res) => {
          this.loading.set(false);
          // Redirect to returnUrl (from auth guard) or default
          const returnUrl = this.route.snapshot.queryParams['returnUrl'];
          if (returnUrl) {
            this.router.navigateByUrl(returnUrl);
          } else {
            const redirectTo = res.data.user.role === 'admin' ? '/dashboard' : '/';
            this.router.navigate([redirectTo]);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Authentication failed');
        },
      });
    } catch (err: unknown) {
      this.loading.set(false);
      const msg = err instanceof Error ? err.message : 'Invalid OTP. Please try again.';
      this.error.set(msg);
      // Reset OTP fields
      this.otpDigits.set(['', '', '', '', '', '']);
      this.otp.set('');
      this.focusOtpInput(0);
    }
  }

  changePhone(): void {
    this.step.set('phone');
    this.otp.set('');
    this.otpDigits.set(['', '', '', '', '', '']);
    this.error.set(null);
    this.clearCooldown();
    this.firebaseService.initRecaptcha('recaptcha-container');
    setTimeout(() => this.phoneInputEl?.nativeElement.focus(), 100);
  }

  private focusOtpInput(index: number): void {
    if (!this.otpInputElements.length) {
      this.otpInputElements = Array.from(
        document.querySelectorAll('.otp-box'),
      ) as HTMLInputElement[];
    }
    this.otpInputElements[index]?.focus();
  }

  private startCooldown(seconds: number): void {
    this.clearCooldown();
    this.resendCooldown.set(seconds);
    this.cooldownInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current <= 1) {
        this.clearCooldown();
      } else {
        this.resendCooldown.set(current - 1);
      }
    }, 1000);
  }

  private clearCooldown(): void {
    this.resendCooldown.set(0);
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
  }
}
