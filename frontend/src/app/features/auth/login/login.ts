import { Component, signal, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { FirebaseService } from '../../../core/services/firebase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="login-scene">
      <!-- Animated background shapes -->
      <div class="bg-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
        <div class="shape shape-4"></div>
        <div class="shape shape-5"></div>
      </div>

      <!-- Floating particles -->
      <div class="particles">
        @for (i of particles; track i) {
          <div class="particle" [style.--delay]="i * 0.4 + 's'" [style.--x]="particleX(i)" [style.--size]="particleSize(i)"></div>
        }
      </div>

      <div class="login-container" [class.entered]="entered()">
        <!-- Left panel — brand showcase -->
        <div class="brand-panel">
          <div class="brand-content">
            <div class="brand-badge">
              <span class="badge-dot"></span>
              Premium Shopping
            </div>
            <h1 class="brand-title">
              <span class="title-line">Discover</span>
              <span class="title-line accent">Rajhans</span>
              <span class="title-line">Collection</span>
            </h1>
            <p class="brand-desc">
              Curated luxury meets modern convenience. Experience shopping reimagined for the discerning buyer.
            </p>
            <div class="brand-stats">
              <div class="stat">
                <span class="stat-value">10K+</span>
                <span class="stat-label">Products</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat">
                <span class="stat-value">50K+</span>
                <span class="stat-label">Happy Customers</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat">
                <span class="stat-value">4.9</span>
                <span class="stat-label">Rating</span>
              </div>
            </div>
          </div>
          <div class="brand-pattern"></div>
        </div>

        <!-- Right panel — auth form -->
        <div class="auth-panel">
          <div class="auth-inner">
            <!-- Step indicator -->
            <div class="step-indicator">
              <div class="step-dot" [class.active]="true" [class.done]="step() === 'otp'"></div>
              <div class="step-line" [class.active]="step() === 'otp'"></div>
              <div class="step-dot" [class.active]="step() === 'otp'"></div>
            </div>

            <div class="auth-header" [class.slide-up]="step() === 'otp'">
              <h2 class="auth-title">
                {{ step() === 'phone' ? 'Welcome' : 'Verify OTP' }}
              </h2>
              <p class="auth-subtitle">
                {{ step() === 'phone'
                  ? 'Sign in with your mobile number to continue'
                  : 'Enter the 6-digit code sent to' }}
              </p>
              @if (step() === 'otp') {
                <p class="auth-phone-display">+91 {{ phone() }}</p>
              }
            </div>

            @if (error()) {
              <div class="error-toast" (click)="error.set(null)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="#C0392B"/>
                  <path d="M5 5L11 11M11 5L5 11" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>{{ error() }}</span>
              </div>
            }

            <!-- Phone Step -->
            @if (step() === 'phone') {
              <div class="form-section animate-in">
                <label class="input-label">Mobile Number</label>
                <div class="phone-input-group">
                  <div class="country-code">
                    <span class="flag">&#127470;&#127475;</span>
                    <span>+91</span>
                  </div>
                  <input
                    #phoneInput
                    type="tel"
                    class="phone-input"
                    placeholder="Enter 10-digit number"
                    [value]="phone()"
                    (input)="onPhoneInput($event)"
                    maxlength="10"
                    (keyup.enter)="onSendOtp()"
                    autocomplete="tel"
                  />
                </div>
                <button
                  class="btn-primary"
                  [class.loading]="loading()"
                  [disabled]="phone().length !== 10 || loading()"
                  (click)="onSendOtp()"
                >
                  @if (loading()) {
                    <div class="spinner"></div>
                    <span>Sending...</span>
                  } @else {
                    <span>Continue</span>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  }
                </button>
              </div>
            }

            <!-- OTP Step -->
            @if (step() === 'otp') {
              <div class="form-section animate-in">
                <label class="input-label">Verification Code</label>
                <div class="otp-inputs">
                  @for (i of otpSlots; track i) {
                    <input
                      #otpInput
                      type="text"
                      inputmode="numeric"
                      class="otp-box"
                      maxlength="1"
                      [value]="otpDigits()[i]"
                      (input)="onOtpDigitInput($event, i)"
                      (keydown)="onOtpKeydown($event, i)"
                      (paste)="onOtpPaste($event)"
                      [class.filled]="otpDigits()[i]"
                    />
                  }
                </div>

                <button
                  class="btn-primary"
                  [class.loading]="loading()"
                  [disabled]="otp().length !== 6 || loading()"
                  (click)="onVerifyOtp()"
                >
                  @if (loading()) {
                    <div class="spinner"></div>
                    <span>Verifying...</span>
                  } @else {
                    <span>Verify & Sign In</span>
                  }
                </button>

                <div class="otp-actions">
                  <button
                    class="btn-link"
                    [disabled]="resendCooldown() > 0"
                    (click)="onSendOtp()"
                  >
                    {{ resendCooldown() > 0 ? 'Resend in ' + resendCooldown() + 's' : 'Resend Code' }}
                  </button>
                  <button class="btn-link" (click)="changePhone()">
                    Change Number
                  </button>
                </div>
              </div>
            }

            <p class="terms">
              By continuing, you agree to our
              <a href="#">Terms of Service</a> &
              <a href="#">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>

      <!-- Invisible reCAPTCHA container -->
      <div id="recaptcha-container"></div>
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    @use '../../../core/design-tokens/mixins' as *;

    // === Scene ===
    .login-scene {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: $color-bg-primary;
      position: relative;
      overflow: hidden;
      padding: $space-lg;
    }

    // === Background Shapes ===
    .bg-shapes {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    .shape {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.4;
      animation: float 20s ease-in-out infinite;
    }

    .shape-1 {
      width: 500px;
      height: 500px;
      background: rgba(204, 88, 3, 0.08);
      top: -10%;
      right: -5%;
      animation-delay: 0s;
    }

    .shape-2 {
      width: 400px;
      height: 400px;
      background: rgba(87, 136, 108, 0.06);
      bottom: -10%;
      left: -5%;
      animation-delay: -5s;
    }

    .shape-3 {
      width: 300px;
      height: 300px;
      background: rgba(162, 126, 142, 0.06);
      top: 50%;
      left: 30%;
      animation-delay: -10s;
    }

    .shape-4 {
      width: 200px;
      height: 200px;
      background: rgba(204, 88, 3, 0.05);
      bottom: 20%;
      right: 20%;
      animation-delay: -15s;
    }

    .shape-5 {
      width: 250px;
      height: 250px;
      background: rgba(87, 136, 108, 0.05);
      top: 20%;
      left: 10%;
      animation-delay: -8s;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      25% { transform: translate(30px, -30px) scale(1.05); }
      50% { transform: translate(-20px, 20px) scale(0.95); }
      75% { transform: translate(15px, 15px) scale(1.02); }
    }

    // === Particles ===
    .particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    .particle {
      position: absolute;
      width: var(--size);
      height: var(--size);
      background: $color-primary;
      border-radius: 50%;
      opacity: 0;
      left: var(--x);
      bottom: -10px;
      animation: rise 12s ease-in-out infinite;
      animation-delay: var(--delay);
    }

    @keyframes rise {
      0% { opacity: 0; transform: translateY(0) scale(0); }
      10% { opacity: 0.3; }
      50% { opacity: 0.15; }
      100% { opacity: 0; transform: translateY(-100vh) scale(1); }
    }

    // === Container ===
    .login-container {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      max-width: 1000px;
      width: 100%;
      min-height: 600px;
      border-radius: $radius-xxl;
      overflow: hidden;
      box-shadow: $shadow-xl, 0 0 0 1px rgba(58, 45, 50, 0.04);
      opacity: 0;
      transform: translateY(30px) scale(0.98);
      animation: containerEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;

      @include respond-to(md) {
        grid-template-columns: 1fr;
        max-width: 460px;
        min-height: auto;
      }
    }

    @keyframes containerEnter {
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    // === Brand Panel ===
    .brand-panel {
      background: $color-bg-dark;
      padding: $space-xxl;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;

      @include respond-to(md) {
        display: none;
      }
    }

    .brand-pattern {
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(circle at 20% 80%, rgba(204, 88, 3, 0.12) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(87, 136, 108, 0.08) 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, rgba(162, 126, 142, 0.06) 0%, transparent 70%);
      pointer-events: none;
    }

    .brand-content {
      position: relative;
      z-index: 1;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: $space-xs;
      background: rgba(204, 88, 3, 0.12);
      color: $color-primary;
      padding: $space-xs $space-md;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-wide;
      text-transform: uppercase;
      margin-bottom: $space-xl;
      opacity: 0;
      animation: slideIn 0.6s ease 0.5s forwards;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: $color-primary;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }

    .brand-title {
      margin-bottom: $space-lg;
    }

    .title-line {
      display: block;
      font-family: $font-family-display;
      font-size: $font-size-display;
      font-weight: $font-weight-bold;
      line-height: $line-height-tight;
      letter-spacing: $letter-spacing-tight;
      color: $color-text-inverse;
      opacity: 0;
      transform: translateY(20px);

      &:nth-child(1) { animation: slideIn 0.6s ease 0.6s forwards; }
      &:nth-child(2) { animation: slideIn 0.6s ease 0.75s forwards; }
      &:nth-child(3) { animation: slideIn 0.6s ease 0.9s forwards; }

      &.accent {
        color: $color-primary;
        background: linear-gradient(135deg, $color-primary, #E8752B);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      @include respond-to(lg) {
        font-size: $font-size-xxxl;
      }
    }

    .brand-desc {
      color: rgba(252, 255, 247, 0.55);
      font-size: $font-size-md;
      line-height: $line-height-relaxed;
      max-width: 340px;
      margin-bottom: $space-xl;
      opacity: 0;
      animation: slideIn 0.6s ease 1s forwards;
    }

    .brand-stats {
      display: flex;
      align-items: center;
      gap: $space-lg;
      opacity: 0;
      animation: slideIn 0.6s ease 1.1s forwards;
    }

    .stat-value {
      display: block;
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: $color-text-inverse;
      letter-spacing: $letter-spacing-tight;
    }

    .stat-label {
      font-size: $font-size-xs;
      color: rgba(252, 255, 247, 0.4);
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    .stat-divider {
      width: 1px;
      height: 32px;
      background: rgba(252, 255, 247, 0.1);
    }

    @keyframes slideIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    // === Auth Panel ===
    .auth-panel {
      background: $color-bg-tertiary;
      padding: $space-xxl;
      display: flex;
      align-items: center;
      justify-content: center;

      @include respond-to(md) {
        padding: $space-xl $space-lg;
      }
    }

    .auth-inner {
      width: 100%;
      max-width: 360px;
    }

    // === Step Indicator ===
    .step-indicator {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: $space-xl;
    }

    .step-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: $color-border;
      transition: all $transition-normal;
      flex-shrink: 0;

      &.active {
        background: $color-primary;
        box-shadow: 0 0 0 4px $color-primary-light;
      }

      &.done {
        background: $color-success;
        box-shadow: 0 0 0 4px rgba(87, 136, 108, 0.12);
      }
    }

    .step-line {
      height: 2px;
      flex: 1;
      background: $color-border;
      transition: background $transition-normal;

      &.active {
        background: linear-gradient(90deg, $color-success, $color-primary);
      }
    }

    // === Auth Header ===
    .auth-header {
      margin-bottom: $space-xl;
    }

    .auth-title {
      font-family: $font-family-display;
      font-size: $font-size-xxl;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      letter-spacing: $letter-spacing-tight;
      margin-bottom: $space-xs;
    }

    .auth-subtitle {
      font-size: $font-size-sm;
      color: $color-text-tertiary;
      line-height: $line-height-relaxed;
    }

    .auth-phone-display {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-primary;
      margin-top: $space-xxs;
    }

    // === Error ===
    .error-toast {
      display: flex;
      align-items: center;
      gap: $space-sm;
      background: rgba(192, 57, 43, 0.06);
      border: 1px solid rgba(192, 57, 43, 0.15);
      border-radius: $radius-lg;
      padding: $space-sm $space-md;
      margin-bottom: $space-lg;
      font-size: $font-size-sm;
      color: $color-error;
      cursor: pointer;
      animation: shakeIn 0.5s ease;
    }

    @keyframes shakeIn {
      0% { transform: translateX(-10px); opacity: 0; }
      25% { transform: translateX(5px); }
      50% { transform: translateX(-3px); }
      75% { transform: translateX(1px); }
      100% { transform: translateX(0); opacity: 1; }
    }

    // === Form ===
    .form-section {
      display: flex;
      flex-direction: column;
      gap: $space-lg;
    }

    .animate-in {
      animation: fadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeSlideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
    }

    .input-label {
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      color: $color-text-secondary;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
    }

    // === Phone Input ===
    .phone-input-group {
      display: flex;
      border: 1.5px solid $color-border;
      border-radius: $radius-lg;
      overflow: hidden;
      transition: all $transition-fast;
      background: $color-bg-tertiary;

      &:focus-within {
        border-color: $color-primary;
        box-shadow: $shadow-glow;
      }
    }

    .country-code {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: 0 $space-md;
      background: $color-bg-secondary;
      border-right: 1.5px solid $color-border;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-secondary;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .flag {
      font-size: 18px;
      line-height: 1;
    }

    .phone-input {
      flex: 1;
      border: none;
      outline: none;
      padding: $space-md $space-md;
      font-size: $font-size-md;
      font-family: $font-family;
      color: $color-text-primary;
      background: transparent;
      letter-spacing: 0.5px;
      min-width: 0;

      &::placeholder {
        color: $color-text-disabled;
      }
    }

    // === OTP Inputs ===
    .otp-inputs {
      display: flex;
      gap: $space-sm;
    }

    .otp-box {
      width: 100%;
      aspect-ratio: 1;
      max-width: 52px;
      border: 1.5px solid $color-border;
      border-radius: $radius-lg;
      text-align: center;
      font-size: $font-size-xl;
      font-weight: $font-weight-semibold;
      font-family: $font-family;
      color: $color-text-primary;
      background: $color-bg-tertiary;
      outline: none;
      transition: all $transition-fast;
      caret-color: $color-primary;

      &:focus {
        border-color: $color-primary;
        box-shadow: $shadow-glow;
        transform: translateY(-2px);
      }

      &.filled {
        border-color: $color-success;
        background: rgba(87, 136, 108, 0.04);
      }
    }

    // === Button ===
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $space-xs;
      width: 100%;
      padding: $space-md $space-lg;
      background: $color-primary;
      color: $color-text-inverse;
      border: none;
      border-radius: $radius-lg;
      font-size: $font-size-md;
      font-weight: $font-weight-semibold;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-normal;
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
        transform: translateX(-100%);
        transition: transform 0.6s ease;
      }

      &:hover:not(:disabled) {
        background: $color-primary-hover;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(204, 88, 3, 0.3);

        &::before {
          transform: translateX(100%);
        }
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      &.loading {
        pointer-events: none;
      }
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    // === OTP Actions ===
    .otp-actions {
      display: flex;
      justify-content: space-between;
    }

    .btn-link {
      background: none;
      border: none;
      color: $color-primary;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      font-family: $font-family;
      cursor: pointer;
      padding: 0;
      transition: color $transition-fast;

      &:hover:not(:disabled) {
        color: $color-primary-hover;
      }

      &:disabled {
        color: $color-text-disabled;
        cursor: not-allowed;
      }
    }

    // === Terms ===
    .terms {
      margin-top: $space-xl;
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      text-align: center;
      line-height: $line-height-relaxed;

      a {
        color: $color-text-secondary;
        text-decoration: underline;
        text-underline-offset: 2px;

        &:hover {
          color: $color-primary;
        }
      }
    }
  `],
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
  ) {}

  ngOnInit(): void {
    this.firebaseService.initRecaptcha('recaptcha-container');
    setTimeout(() => this.entered.set(true), 100);
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
          const redirectTo = res.data.user.role === 'admin' ? '/dashboard' : '/';
          this.router.navigate([redirectTo]);
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
