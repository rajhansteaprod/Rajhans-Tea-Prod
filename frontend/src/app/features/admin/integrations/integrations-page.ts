import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-integrations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header"><h1 class="page-title">Integrations</h1><p class="page-sub">External connections and outgoing webhooks</p></div>

      <!-- Integration Health -->
      @if (health()) {
        <h3 class="section-title">Connected Services</h3>
        <div class="health-grid">
          @for (i of health().integrations; track i.name) {
            <div class="health-card" [class.connected]="i.status === 'connected'" [class.missing]="i.status === 'not_configured'">
              <span class="h-name">{{ i.name }}</span>
              <span class="h-status">{{ i.status === 'connected' ? 'Connected' : 'Not Configured' }}</span>
            </div>
          }
        </div>
      }

      <!-- Webhooks -->
      <div class="section-header">
        <h3 class="section-title">Outgoing Webhooks</h3>
        <button class="btn-add" (click)="showModal.set(true)">+ Add Webhook</button>
      </div>

      @for (w of webhooks(); track w._id) {
        <div class="webhook-card" [class.inactive]="!w.isActive">
          <div class="w-info">
            <span class="w-name">{{ w.name }}</span>
            <span class="w-url">{{ w.url }}</span>
            <div class="w-meta">
              <span>{{ w.events.length }} events</span>
              @if (w.lastTriggered) { <span>Last: {{ w.lastTriggered | date:'dd MMM, h:mm a' }} ({{ w.lastStatus }})</span> }
              @if (w.failCount > 0) { <span class="w-fails">{{ w.failCount }} failures</span> }
            </div>
          </div>
          <div class="w-actions">
            <button class="btn-sm" [class.on]="w.isActive" (click)="toggle(w._id)">{{ w.isActive ? 'ON' : 'OFF' }}</button>
            <button class="btn-sm" (click)="test(w._id)">Test</button>
            <button class="btn-sm danger" (click)="deleteWebhook(w._id)">Delete</button>
          </div>
        </div>
      }

      @if (showModal()) {
        <div class="backdrop" (click)="showModal.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>Add Webhook</h2><button (click)="showModal.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Name</label><input [(ngModel)]="form.name" placeholder="My ERP Sync" /></div>
            <div class="form-field"><label>URL</label><input [(ngModel)]="form.url" placeholder="https://example.com/webhook" /></div>
            <p class="hint">Secret will be auto-generated. Payload signed with HMAC-SHA256.</p>
            <div class="modal-actions"><button (click)="showModal.set(false)">Cancel</button><button class="btn-save" [disabled]="!form.name || !form.url" (click)="save()">Create</button></div>
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
    .section-title { font-size: $font-size-lg; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-md; }
    .section-header { display:flex; justify-content:space-between; align-items:center; margin: $space-xxl 0 $space-md; }

    .health-grid { display:grid; grid-template-columns: repeat(5,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .health-card { padding: $space-md; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; text-align:center;
      &.connected { border-color:rgba(87,136,108,.4); }
      &.missing { opacity:.5; }
    }
    .h-name { display:block; font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; margin-bottom: $space-xxs; }
    .h-status { font-size: $font-size-xs; .connected & { color: $color-success; } .missing & { color: $color-text-disabled; } }

    .btn-add { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; }

    .webhook-card { display:flex; justify-content:space-between; align-items:center; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-sm;
      &.inactive { opacity:.5; }
    }
    .w-info { min-width:0; }
    .w-name { font-weight: $font-weight-bold; color: $color-text-primary; margin-right: $space-sm; }
    .w-url { font-size: $font-size-xs; font-family:monospace; color: $color-text-tertiary; }
    .w-meta { display:flex; gap: $space-md; font-size: $font-size-xs; color: $color-text-tertiary; margin-top: $space-xxs; }
    .w-fails { color: $color-error; font-weight: $font-weight-bold; }
    .w-actions { display:flex; gap: $space-xs; flex-shrink:0; }
    .btn-sm { padding: $space-xxs $space-sm; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-xs; cursor:pointer;
      &:hover { border-color: $color-primary; color: $color-primary; }
      &.on { border-color: $color-success; color: $color-success; }
      &.danger:hover { border-color: $color-error; color: $color-error; }
    }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:450px; max-width:90vw; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; } input { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; &:focus { border-color: $color-primary; } } }
    .hint { font-size: $font-size-xs; color: $color-text-disabled; margin:0 0 $space-md; }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; &:disabled { opacity:.5; } }
  `],
})
export class IntegrationsPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly webhooks = signal<any[]>([]);
  readonly health = signal<any>(null);
  readonly showModal = signal(false);
  form = { name: '', url: '' };

  ngOnInit(): void { this.loadHealth(); this.loadWebhooks(); }

  loadHealth(): void { this.http.get<{ data: any }>(`${this.api}/admin/integrations/health`).subscribe({ next: (r) => this.health.set(r.data) }); }
  loadWebhooks(): void { this.http.get<{ data: any[] }>(`${this.api}/admin/integrations/webhooks`).subscribe({ next: (r) => this.webhooks.set(r.data) }); }

  save(): void {
    this.http.post(`${this.api}/admin/integrations/webhooks`, this.form).subscribe({
      next: () => { this.showModal.set(false); this.form = { name: '', url: '' }; this.loadWebhooks(); },
    });
  }

  toggle(id: string): void { this.http.patch(`${this.api}/admin/integrations/webhooks/${id}/toggle`, {}).subscribe({ next: () => this.loadWebhooks() }); }
  test(id: string): void { this.http.post(`${this.api}/admin/integrations/webhooks/${id}/test`, {}).subscribe(); }
  deleteWebhook(id: string): void { if (confirm('Delete?')) this.http.delete(`${this.api}/admin/integrations/webhooks/${id}`).subscribe({ next: () => this.loadWebhooks() }); }
}
