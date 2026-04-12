import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface NewsletterSubscription {
  email: string;
  timestamp: number;
  ipHash?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NewsletterService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/newsletter`;

  // Spam prevention
  private readonly MAX_SUBMISSIONS_PER_HOUR = 3;
  private readonly MIN_TIME_BETWEEN_SUBMISSIONS_MS = 5000;
  private submissions: Map<string, number[]> = new Map();
  private lastSubmissionTime: number = 0;

  /**
   * Validate email format
   */
  validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || !email.trim()) {
      return { valid: false, error: 'Email is required' };
    }

    const trimmed = email.trim().toLowerCase();

    // RFC 5322 simplified regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: 'Invalid email format' };
    }

    // Check for disposable/temporary email domains
    const disposableDomains = [
      'tempmail.com',
      '10minutemail.com',
      'mailinator.com',
      'throwaway.email',
      'guerrillamail.com',
      'temp-mail.org',
    ];

    const domain = trimmed.split('@')[1].toLowerCase();
    if (disposableDomains.includes(domain)) {
      return { valid: false, error: 'Please use a valid email address' };
    }

    return { valid: true };
  }

  /**
   * Check spam limits
   */
  private checkSpamLimits(email: string): { allowed: boolean; error?: string } {
    const now = Date.now();

    // Check minimum time between submissions
    if (now - this.lastSubmissionTime < this.MIN_TIME_BETWEEN_SUBMISSIONS_MS) {
      return {
        allowed: false,
        error: 'Please wait a few seconds before subscribing again'
      };
    }

    // Get submissions for this email
    const emailSubmissions = this.submissions.get(email) || [];

    // Remove submissions older than 1 hour
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentSubmissions = emailSubmissions.filter(time => time > oneHourAgo);

    if (recentSubmissions.length >= this.MAX_SUBMISSIONS_PER_HOUR) {
      return {
        allowed: false,
        error: 'Too many subscription attempts. Please try again later.'
      };
    }

    // Update submissions
    recentSubmissions.push(now);
    this.submissions.set(email, recentSubmissions);
    this.lastSubmissionTime = now;

    // Cleanup old entries to prevent memory leak
    if (this.submissions.size > 1000) {
      this.cleanupOldSubmissions();
    }

    return { allowed: true };
  }

  /**
   * Remove submissions older than 2 hours
   */
  private cleanupOldSubmissions(): void {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    for (const [email, times] of this.submissions.entries()) {
      const recent = times.filter(time => time > twoHoursAgo);
      if (recent.length === 0) {
        this.submissions.delete(email);
      } else {
        this.submissions.set(email, recent);
      }
    }
  }

  /**
   * Subscribe to newsletter with full validation
   */
  subscribe(email: string): Observable<any> {
    // Step 1: Validate email format
    const validation = this.validateEmail(email);
    if (!validation.valid) {
      return throwError(() => new Error(validation.error));
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Step 2: Check spam limits
    const spamCheck = this.checkSpamLimits(normalizedEmail);
    if (!spamCheck.allowed) {
      return throwError(() => new Error(spamCheck.error));
    }

    // Step 3: Send to backend
    return this.http.post(`${this.apiUrl}/subscribe`, {
      email: normalizedEmail,
      timestamp: Date.now(),
    }).pipe(
      catchError(error => {
        // Handle backend errors
        const message = error.error?.message || 'Failed to subscribe. Please try again.';
        return throwError(() => new Error(message));
      })
    );
  }
}
