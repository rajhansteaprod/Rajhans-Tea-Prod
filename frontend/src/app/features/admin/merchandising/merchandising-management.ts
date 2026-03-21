import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type Tab = 'rules' | 'banners';

@Component({
  selector: 'app-merchandising-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">Merchandising</h1><p class="page-sub">Homepage feeds, rules & banners</p></div>
      </div>

      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'rules'" (click)="activeTab.set('rules')">Rules</button>
        <button class="tab" [class.active]="activeTab() === 'banners'" (click)="activeTab.set('banners'); loadBanners()">Banners</button>
      </div>

      <!-- Rules Tab -->
      @if (activeTab() === 'rules') {
        <div class="toolbar"><button class="btn-add" (click)="openRuleModal()">+ Create Rule</button></div>
        @for (r of rules(); track r._id) {
          <div class="card">
            <div class="card-row">
              <div><strong>{{ r.name }}</strong><span class="badge" [class.manual]="r.type==='manual'" [class.auto]="r.type==='automated'">{{ r.type }}</span></div>
              <div class="card-meta">{{ r.section }} · Priority: {{ r.priority }} · {{ r.isActive ? 'Active' : 'Inactive' }}</div>
            </div>
            <div class="card-actions">
              @if (r.type === 'automated') {
                <button class="btn-sm" (click)="evaluateRule(r._id)">Evaluate</button>
              }
              <button class="btn-sm" (click)="deleteRule(r._id)">Delete</button>
            </div>
          </div>
        }
      }

      <!-- Banners Tab -->
      @if (activeTab() === 'banners') {
        <div class="toolbar"><button class="btn-add" (click)="openBannerModal()">+ Add Banner</button></div>
        @for (b of banners(); track b._id) {
          <div class="card banner-card">
            <img [src]="b.image" class="banner-thumb" />
            <div class="card-row">
              <div><strong>{{ b.title }}</strong></div>
              <div class="card-meta">Position: {{ b.position }} · {{ b.isActive ? 'Active' : 'Inactive' }}</div>
            </div>
            <button class="btn-sm danger" (click)="deleteBanner(b._id)">Delete</button>
          </div>
        }
      }

      <!-- Rule Modal -->
      @if (showRuleModal()) {
        <div class="backdrop" (click)="showRuleModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Create Rule</h2><button (click)="showRuleModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Name</label><input [(ngModel)]="ruleForm.name" /></div>
            <div class="form-row">
              <div class="form-field"><label>Type</label><select [(ngModel)]="ruleForm.type"><option value="manual">Manual</option><option value="automated">Automated</option></select></div>
              <div class="form-field"><label>Section</label><select [(ngModel)]="ruleForm.section"><option value="trending">Trending</option><option value="recommended">Recommended</option><option value="new_arrivals">New Arrivals</option><option value="featured_collections">Featured</option></select></div>
            </div>
            @if (ruleForm.type === 'automated') {
              <div class="form-row">
                <div class="form-field"><label>Strategy</label><select [(ngModel)]="ruleForm.strategy"><option value="top_selling">Top Selling</option><option value="new_arrivals">New Arrivals</option><option value="most_viewed">Most Viewed</option><option value="low_stock">Low Stock</option></select></div>
                <div class="form-field"><label>Priority</label><input type="number" [(ngModel)]="ruleForm.priority" /></div>
              </div>
            }
            <div class="modal-actions"><button (click)="showRuleModal.set(false)">Cancel</button><button class="btn-save" (click)="saveRule()">Create</button></div>
          </div>
        </div>
      }

      <!-- Banner Modal -->
      @if (showBannerModal()) {
        <div class="backdrop" (click)="showBannerModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Add Banner</h2><button (click)="showBannerModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Title</label><input [(ngModel)]="bannerForm.title" /></div>
            <div class="form-field"><label>Subtitle</label><input [(ngModel)]="bannerForm.subtitle" /></div>
            <div class="form-field"><label>Image URL</label><input [(ngModel)]="bannerForm.image" /></div>
            <div class="form-row">
              <div class="form-field"><label>Link</label><input [(ngModel)]="bannerForm.link" placeholder="/search?q=sale" /></div>
              <div class="form-field"><label>Position</label><input type="number" [(ngModel)]="bannerForm.position" /></div>
            </div>
            <div class="modal-actions"><button (click)="showBannerModal.set(false)">Cancel</button><button class="btn-save" (click)="saveBanner()">Create</button></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }
    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; font-weight: $font-weight-medium; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px;
      &.active { color: $color-primary; border-bottom-color: $color-primary; }
    }
    .toolbar { margin-bottom: $space-lg; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }
    .card { display:flex; align-items:center; justify-content:space-between; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-sm; }
    .card-row { display:flex; flex-direction:column; gap:2px; }
    .card-meta { font-size: $font-size-xs; color: $color-text-tertiary; }
    .card-actions { display:flex; gap: $space-xs; }
    .badge { margin-left: $space-xs; padding:1px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold;
      &.manual { background:rgba(162,126,142,.12); color: $color-accent; }
      &.auto { background:rgba(87,136,108,.12); color: $color-success; }
    }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &:hover { border-color: $color-primary; color: $color-primary; } &.danger:hover { border-color: $color-error; color: $color-error; } }
    .banner-card { gap: $space-md; }
    .banner-thumb { width:80px; height:40px; border-radius: $radius-sm; object-fit:cover; }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .form-row { display:flex; gap: $space-md; margin-bottom: $space-md; }
    .form-field { flex:1; display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; min-width:0;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } }
    }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; font-weight: $font-weight-semibold; }
  `],
})
export class MerchandisingManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly activeTab = signal<Tab>('rules');
  readonly rules = signal<any[]>([]);
  readonly banners = signal<any[]>([]);
  readonly showRuleModal = signal(false);
  readonly showBannerModal = signal(false);

  ruleForm: any = { name: '', type: 'automated', section: 'trending', strategy: 'most_viewed', priority: 0 };
  bannerForm: any = { title: '', subtitle: '', image: '', link: '', position: 0 };

  ngOnInit(): void { this.loadRules(); }

  loadRules(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/merchandising/rules?limit=50`).subscribe({
      next: (res) => this.rules.set(res.data),
    });
  }

  loadBanners(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/merchandising/banners`).subscribe({
      next: (res) => this.banners.set(res.data),
    });
  }

  openRuleModal(): void { this.ruleForm = { name: '', type: 'automated', section: 'trending', strategy: 'most_viewed', priority: 0 }; this.showRuleModal.set(true); }
  openBannerModal(): void { this.bannerForm = { title: '', subtitle: '', image: '', link: '', position: 0 }; this.showBannerModal.set(true); }

  saveRule(): void {
    this.http.post(`${this.api}/admin/merchandising/rules`, this.ruleForm).subscribe({
      next: () => { this.showRuleModal.set(false); this.loadRules(); },
    });
  }

  saveBanner(): void {
    this.http.post(`${this.api}/admin/merchandising/banners`, this.bannerForm).subscribe({
      next: () => { this.showBannerModal.set(false); this.loadBanners(); },
    });
  }

  evaluateRule(id: string): void {
    this.http.post(`${this.api}/admin/merchandising/rules/${id}/evaluate`, {}).subscribe({
      next: () => this.loadRules(),
    });
  }

  deleteRule(id: string): void {
    if (!confirm('Delete this rule?')) return;
    this.http.delete(`${this.api}/admin/merchandising/rules/${id}`).subscribe({ next: () => this.loadRules() });
  }

  deleteBanner(id: string): void {
    if (!confirm('Delete this banner?')) return;
    this.http.delete(`${this.api}/admin/merchandising/banners/${id}`).subscribe({ next: () => this.loadBanners() });
  }
}
