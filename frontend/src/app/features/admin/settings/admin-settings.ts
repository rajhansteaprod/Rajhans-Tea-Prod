import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-settings.html',
  styleUrls: ['./admin-settings.scss'],
})
export class AdminSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly settings = signal<any>(null);
  readonly loyaltySettings = signal<any>(null);
  readonly referralSettings = signal<any>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);

  ngOnInit(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/settings`).subscribe({
      next: (res) => this.settings.set(res.data),
    });
    this.http.get<{ data: any }>(`${this.api}/admin/promotions/loyalty/settings`).subscribe({
      next: (res) => this.loyaltySettings.set(res.data),
    });
    this.http.get<{ data: any }>(`${this.api}/admin/promotions/referral/settings`).subscribe({
      next: (res) => this.referralSettings.set(res.data),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);

    // Sync feature toggles with promotion settings
    const ls = this.loyaltySettings();
    const rs = this.referralSettings();
    const s = this.settings();

    if (ls) ls.isActive = s.features.loyaltyEnabled;
    if (rs) rs.isActive = s.features.referralEnabled;

    // Save all three in parallel
    let pending = 3;
    const done = () => { pending--; if (pending === 0) { this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 3000); } };
    const fail = () => { this.saving.set(false); };

    this.http.put(`${this.api}/admin/settings`, s).subscribe({ next: done, error: fail });
    this.http.put(`${this.api}/admin/promotions/loyalty/settings`, ls).subscribe({ next: done, error: fail });
    this.http.put(`${this.api}/admin/promotions/referral/settings`, rs).subscribe({ next: done, error: fail });
  }
}
