import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { Msg91OtpService } from '../../../core/services/msg91-otp.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly meta = inject(Meta);
  // Zoneless app (Angular, no zone.js): async state must be signals so change
  // detection runs after awaited HTTP calls resolve.
  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly otpSent = signal(false);

  phoneNumber = '';
  otp = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private otpService: Msg91OtpService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    // The login page has no indexable value and would surface as thin/duplicate
    // content. noindex,follow keeps it out of the index while still letting link
    // equity flow through any links on the page.
    this.meta.updateTag({ name: 'robots', content: 'noindex,follow' });
  }

  ngOnDestroy(): void {
    // Remove the noindex on navigation away so indexable pages (this is a SPA —
    // the tag would otherwise persist) don't inherit it.
    this.meta.removeTag("name='robots'");
  }

  clearError(): void {
    this.error.set('');
  }

  /** Step 1 — send OTP to the entered mobile number */
  async sendOtp(): Promise<void> {
    this.error.set('');
    if (!/^[0-9]{10}$/.test(this.phoneNumber)) {
      this.error.set('Please enter a valid 10-digit phone number.');
      return;
    }

    this.isLoading.set(true);
    try {
      await firstValueFrom(this.otpService.sendOtp(this.phoneNumber));
      this.otpSent.set(true);
    } catch (err: any) {
      this.error.set(err.error?.message || err.message || 'Failed to send OTP. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Step 2 — verify OTP and log the user in */
  async verifyOtp(): Promise<void> {
    this.error.set('');
    if (!/^[0-9]{10}$/.test(this.phoneNumber) || !/^[0-9]{6}$/.test(this.otp)) {
      this.error.set('Please enter a valid phone number and 6-digit OTP.');
      return;
    }

    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(this.otpService.verifyOtp(this.phoneNumber, this.otp));

      if (!response?.data?.tokens?.accessToken) {
        this.error.set('Failed to store authentication tokens');
        return;
      }

      this.authService.handleOtpLoginResponse(response);

      const returnUrl = this.route.snapshot.queryParams['returnUrl'];
      if (returnUrl) {
        this.router.navigateByUrl(returnUrl);
      } else {
        const redirectTo = response.data.user.role === 'admin' ? '/dashboard' : '/';
        this.router.navigate([redirectTo]);
      }
    } catch (err: any) {
      this.error.set(err.error?.message || err.message || 'OTP verification failed. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Send a fresh OTP for the same mobile number */
  async resendOtp(): Promise<void> {
    this.error.set('');
    if (!/^[0-9]{10}$/.test(this.phoneNumber)) {
      this.error.set('Please enter a valid phone number before resending OTP.');
      return;
    }

    this.isLoading.set(true);
    try {
      await firstValueFrom(this.otpService.resendOtp(this.phoneNumber));
      this.otpSent.set(true);
    } catch (err: any) {
      this.error.set(err.error?.message || err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Go back to the mobile-number step to enter a different number */
  changeMobile(): void {
    this.otpSent.set(false);
    this.otp = '';
    this.error.set('');
  }
}
