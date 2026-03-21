import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-notification-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">Notifications</h1><p class="page-sub">Templates, bulk send, and stats</p></div>
      </div>

      <!-- Stats -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat"><span class="val">{{ stats().totalSent }}</span><span class="lbl">Total Sent</span></div>
          <div class="stat"><span class="val">{{ stats().last24h }}</span><span class="lbl">Last 24h</span></div>
          <div class="stat"><span class="val">{{ stats().byChannel?.email || 0 }}</span><span class="lbl">Emails</span></div>
          <div class="stat"><span class="val">{{ stats().byChannel?.push || 0 }}</span><span class="lbl">Push</span></div>
        </div>
      }

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="activeTab() === 'templates'" (click)="activeTab.set('templates')">Templates</button>
        <button class="tab" [class.active]="activeTab() === 'send'" (click)="activeTab.set('send')">Send Bulk</button>
      </div>

      <!-- Templates -->
      @if (activeTab() === 'templates') {
        <div class="toolbar"><button class="btn-add" (click)="showTemplateModal.set(true)">+ Create Template</button></div>
        @for (t of templates(); track t._id) {
          <div class="card">
            <div class="card-info">
              <strong>{{ t.type }}</strong>
              <span class="card-meta">
                {{ t.channels?.email ? 'Email' : '' }}
                {{ t.channels?.sms ? ' SMS' : '' }}
                {{ t.channels?.push ? ' Push' : '' }}
                · {{ t.isActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <button class="btn-sm danger" (click)="deleteTemplate(t._id)">Delete</button>
          </div>
        }
      }

      <!-- Bulk Send -->
      @if (activeTab() === 'send') {
        <div class="send-form">
          <div class="form-field"><label>Type</label><input [(ngModel)]="bulkForm.type" placeholder="announcement" /></div>
          <div class="form-field"><label>Message</label><textarea [(ngModel)]="bulkForm.message" rows="3" placeholder="Your announcement message..."></textarea></div>
          <div class="form-field"><label>Target Role (optional)</label><input [(ngModel)]="bulkForm.targetRole" placeholder="Leave empty for all users" /></div>
          <button class="btn-send" [disabled]="!bulkForm.type || !bulkForm.message" (click)="sendBulk()">Send to All Users</button>
          @if (bulkResult()) {
            <p class="result-msg">{{ bulkResult() }}</p>
          }
        </div>
      }

      <!-- Template Modal -->
      @if (showTemplateModal()) {
        <div class="backdrop" (click)="showTemplateModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Create Template</h2><button (click)="showTemplateModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Type (unique)</label><input [(ngModel)]="templateForm.type" placeholder="order_confirmed" /></div>
            <div class="form-field"><label>Push Title</label><input [(ngModel)]="templateForm.pushTitle" /></div>
            <div class="form-field"><label>Push Body</label><input [(ngModel)]="templateForm.pushBody" [placeholder]="'Use curly braces for variables'" /></div>
            <div class="form-field"><label>SMS Body (max 160)</label><input [(ngModel)]="templateForm.smsBody" maxlength="160" /></div>
            <div class="form-field"><label>Email Subject</label><input [(ngModel)]="templateForm.emailSubject" /></div>
            <div class="form-field"><label>Email HTML Body</label><textarea [(ngModel)]="templateForm.emailHtml" rows="4" [placeholder]="'HTML with variables in double curly braces'"></textarea></div>
            <div class="modal-actions">
              <button (click)="showTemplateModal.set(false)">Cancel</button>
              <button class="btn-save" (click)="saveTemplate()">Create</button>
            </div>
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
    .stats-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat { padding: $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center; }
    .val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; }
    .lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }
    .tabs { display:flex; gap: $space-xs; margin-bottom: $space-lg; border-bottom:2px solid $color-border-light; padding-bottom: $space-xs; }
    .tab { padding: $space-sm $space-lg; border:none; background:transparent; font-size: $font-size-sm; color: $color-text-tertiary; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-3px;
      &.active { color: $color-primary; border-bottom-color: $color-primary; }
    }
    .toolbar { margin-bottom: $space-lg; }
    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }
    .card { display:flex; align-items:center; justify-content:space-between; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-sm; }
    .card-info { display:flex; flex-direction:column; gap:2px; }
    .card-meta { font-size: $font-size-xs; color: $color-text-tertiary; }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer; &.danger:hover { border-color: $color-error; color: $color-error; } }
    .send-form { max-width:500px; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md;
      label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; }
      input, textarea { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; resize:vertical; &:focus { border-color: $color-primary; } }
    }
    .btn-send { padding: $space-sm $space-xl; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; &:disabled { opacity:.5; } }
    .result-msg { margin-top: $space-sm; font-size: $font-size-sm; color: $color-success; }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:550px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light;
      h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; }
      button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    }
    .modal-body { padding: $space-xl; }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg;
      button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; }
    }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; }
  `],
})
export class NotificationManagementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly activeTab = signal<'templates' | 'send'>('templates');
  readonly stats = signal<any>(null);
  readonly templates = signal<any[]>([]);
  readonly showTemplateModal = signal(false);
  readonly bulkResult = signal<string | null>(null);

  templateForm = { type: '', pushTitle: '', pushBody: '', smsBody: '', emailSubject: '', emailHtml: '' };
  bulkForm = { type: 'announcement', message: '', targetRole: '' };

  ngOnInit(): void {
    this.loadStats();
    this.loadTemplates();
  }

  loadStats(): void {
    this.http.get<{ data: any }>(`${this.api}/admin/notifications/stats`).subscribe({
      next: (res) => this.stats.set(res.data),
    });
  }

  loadTemplates(): void {
    this.http.get<{ data: any[] }>(`${this.api}/admin/notifications/templates`).subscribe({
      next: (res) => this.templates.set(res.data),
    });
  }

  saveTemplate(): void {
    const body: any = {
      type: this.templateForm.type,
      channels: {
        push: this.templateForm.pushTitle ? { title: this.templateForm.pushTitle, body: this.templateForm.pushBody } : null,
        sms: this.templateForm.smsBody ? { body: this.templateForm.smsBody } : null,
        email: this.templateForm.emailSubject ? { subject: this.templateForm.emailSubject, htmlBody: this.templateForm.emailHtml } : null,
      },
    };
    this.http.post(`${this.api}/admin/notifications/templates`, body).subscribe({
      next: () => { this.showTemplateModal.set(false); this.loadTemplates(); },
    });
  }

  deleteTemplate(id: string): void {
    if (!confirm('Delete?')) return;
    this.http.delete(`${this.api}/admin/notifications/templates/${id}`).subscribe({ next: () => this.loadTemplates() });
  }

  sendBulk(): void {
    this.bulkResult.set(null);
    this.http.post<{ data: any; message: string }>(`${this.api}/admin/notifications/send-bulk`, this.bulkForm).subscribe({
      next: (res) => this.bulkResult.set(res.message),
    });
  }
}
