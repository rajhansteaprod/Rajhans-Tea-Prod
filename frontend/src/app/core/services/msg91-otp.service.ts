import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class Msg91OtpService {
  private apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient) {}

  /**
   * Send OTP to phone number via backend
   * Backend will call MSG91 API to send the OTP
   */
  sendOtp(phone: string) {
    const payload = { phone };
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/send-otp`, payload);
  }

  /**
   * Verify OTP and get JWT tokens
   * Backend will verify the OTP against Redis and issue JWT tokens
   */
  verifyOtp(phone: string, otp: string) {
    const payload = { phone, otp };
    return this.http.post<any>(`${this.apiUrl}/verify-otp`, payload);
  }

  /**
   * Resend OTP to phone number
   * Generates a new OTP for the same phone
   */
  resendOtp(phone: string) {
    const payload = { phone };
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/resend-otp`, payload);
  }
}
