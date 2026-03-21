import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-sub">Store configuration and feature toggles</p>
      </div>

      @if (settings()) {
        <div class="settings-grid">
          <!-- Store Info -->
          <div class="settings-card">
            <h3 class="card-title">Store Information</h3>
            <div class="form-field"><label>Store Name</label><input [(ngModel)]="settings().storeName" /></div>
            <div class="form-field"><label>Contact Email</label><input [(ngModel)]="settings().contactEmail" type="email" /></div>
            <div class="form-field"><label>Contact Phone</label><input [(ngModel)]="settings().contactPhone" /></div>
          </div>

          <!-- Regional -->
          <div class="settings-card">
            <h3 class="card-title">Regional</h3>
            <div class="form-field"><label>Currency</label><input [(ngModel)]="settings().currency" /></div>
            <div class="form-field"><label>Timezone</label><input [(ngModel)]="settings().timezone" /></div>
            <div class="form-field"><label>Default Tax %</label><input type="number" [(ngModel)]="settings().defaultTaxPercent" min="0" max="100" /></div>
          </div>

          <!-- Feature Toggles -->
          <div class="settings-card span-2">
            <h3 class="card-title">Feature Toggles</h3>
            <div class="toggles-grid">
              <label class="toggle-item">
                <input type="checkbox" [(ngModel)]="settings().features.loyaltyEnabled" />
                <div class="toggle-info">
                  <span class="toggle-name">Loyalty Program</span>
                  <span class="toggle-desc">Points earn/redeem on purchases</span>
                </div>
              </label>
              <label class="toggle-item">
                <input type="checkbox" [(ngModel)]="settings().features.referralEnabled" />
                <div class="toggle-info">
                  <span class="toggle-name">Referral System</span>
                  <span class="toggle-desc">Share code, both get rewards</span>
                </div>
              </label>
              <label class="toggle-item">
                <input type="checkbox" [(ngModel)]="settings().features.reviewAutoApprove" />
                <div class="toggle-info">
                  <span class="toggle-name">Auto-Approve Reviews</span>
                  <span class="toggle-desc">Verified purchases auto-approved</span>
                </div>
              </label>
              <label class="toggle-item">
                <input type="checkbox" [(ngModel)]="settings().features.guestCheckout" />
                <div class="toggle-info">
                  <span class="toggle-name">Guest Checkout</span>
                  <span class="toggle-desc">Allow purchase without login</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="save-bar">
          <button class="btn-save" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Settings' }}
          </button>
          @if (saved()) {
            <span class="saved-msg">Settings saved!</span>
          }
        </div>
      } @else {
        <div class="loading"><div class="spinner"></div></div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }

    .settings-grid { display:grid; grid-template-columns: 1fr 1fr; gap: $space-lg; margin-bottom: $space-xl; }
    .settings-card { background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; padding: $space-xl;
      &.span-2 { grid-column: span 2; }
    }
    .card-title { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-lg; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }

    .toggles-grid { display:grid; grid-template-columns: 1fr 1fr; gap: $space-md; }
    .toggle-item { display:flex; align-items:flex-start; gap: $space-sm; cursor:pointer; padding: $space-md; border:1px solid $color-border-light; border-radius: $radius-lg; transition: border-color $transition-fast;
      &:hover { border-color: $color-border; }
      input { margin-top:3px; cursor:pointer; }
    }
    .toggle-info { display:flex; flex-direction:column; gap:2px; }
    .toggle-name { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }
    .toggle-desc { font-size: $font-size-xs; color: $color-text-tertiary; }

    .save-bar { display:flex; align-items:center; gap: $space-md; }
    .btn-save { padding: $space-sm $space-xxl; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-md; font-weight: $font-weight-semibold; cursor:pointer; transition: all $transition-fast;
      &:hover:not(:disabled) { background: $color-primary-hover; }
      &:disabled { opacity:.6; }
    }
    .saved-msg { font-size: $font-size-sm; color: $color-success; font-weight: $font-weight-medium; }

    .loading { display:flex; justify-content:center; padding: $space-xxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `],
})
export class AdminSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly settings = signal<any>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);

  ngOnInit(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/settings`).subscribe({
      next: (res) => this.settings.set(res.data),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.http.put(`${this.api}/admin/settings`, this.settings()).subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 3000); },
      error: () => this.saving.set(false),
    });
  }
}
