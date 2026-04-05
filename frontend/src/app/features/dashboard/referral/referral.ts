import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface ReferralData {
  code: string;
  totalReferred: number;
  completedCount: number;
}

@Component({
  selector: 'app-referral',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './referral.html',
  styleUrls: ['./referral.scss'],
})
export class ReferralComponent implements OnInit {
  data = signal<ReferralData | null>(null);
  copied = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http
      .get<{ success: boolean; data: ReferralData }>(
        `${environment.apiUrl}/promotions/referral/code`,
      )
      .subscribe((res) => {
        if (res.success) this.data.set(res.data);
      });
  }

  copyCode(): void {
    const code = this.data()?.code;
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
