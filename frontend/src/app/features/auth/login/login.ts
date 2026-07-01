import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Msg91WidgetService } from '../../../core/services/msg91-widget.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class LoginComponent implements OnInit {
  isLoading = false;
  error = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private msg91Widget: Msg91WidgetService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    
  }

  openLogin(): void {
    this.error = '';
    this.msg91Widget.triggerLogin(
      (data: any) => {
        const accessToken = data?.message || data?.access_token || data?.token;
        this.verifyMsg91Token(accessToken);
      },
      (error: any) => {
        this.error = error?.message || 'OTP verification failed. Please try again.';
      },
    );
  }

  clearError(): void {
    this.error = '';
  }

  private async verifyMsg91Token(accessToken: string): Promise<void> {
    if (!accessToken) {
      this.error = 'Verification failed. Please try again.';
      return;
    }

    this.isLoading = true;
    this.error = '';

    try {
      const response = await this.http
        .post<any>(
          `${environment.apiUrl}/auth/verify-msg91-token`,
          { accessToken },
          { withCredentials: true },
        )
        .toPromise();

      if (!response?.data?.tokens?.accessToken) {
        this.error = 'Failed to store authentication tokens';
        return;
      }

      this.authService.handleOtpLoginResponse(response);

      // Redirect to returnUrl (set by auth guard, e.g. checkout) or default
      const returnUrl = this.route.snapshot.queryParams['returnUrl'];
      if (returnUrl) {
        this.router.navigateByUrl(returnUrl);
      } else {
        const redirectTo = response.data.user.role === 'admin' ? '/dashboard' : '/';
        this.router.navigate([redirectTo]);
      }
    } catch (err: any) {
      this.error = err.error?.message || 'Authentication failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
