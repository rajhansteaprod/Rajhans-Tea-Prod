import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-support-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1 class="page-title">Support Tickets</h1>

      @if (stats()) {
        <div class="stats-grid">
          <div class="stat"><span class="val">{{ stats().total }}</span><span class="lbl">Total</span></div>
          <div class="stat warn"><span class="val">{{ stats().open }}</span><span class="lbl">Open</span></div>
          <div class="stat"><span class="val">{{ stats().inProgress }}</span><span class="lbl">In Progress</span></div>
          <div class="stat ok"><span class="val">{{ stats().resolved }}</span><span class="lbl">Resolved</span></div>
          <div class="stat danger"><span class="val">{{ stats().urgent }}</span><span class="lbl">Urgent</span></div>
        </div>
      }

      <div class="filters">
        <select [(ngModel)]="statusFilter" (ngModelChange)="load()"><option value="">All</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select [(ngModel)]="priorityFilter" (ngModelChange)="load()"><option value="">All Priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      </div>

      @for (t of tickets(); track t._id) {
        <div class="ticket-row" (click)="openTicket(t)">
          <div class="t-info">
            <span class="t-num">{{ t.ticketNumber }}</span>
            <span class="t-subject">{{ t.subject }}</span>
            <span class="t-user">{{ t.userId?.firstName || t.userId?.phone }}</span>
          </div>
          <div class="t-right">
            <span class="t-priority" [attr.data-priority]="t.priority">{{ t.priority }}</span>
            <span class="t-status" [attr.data-status]="t.status">{{ t.status }}</span>
            <span class="t-date">{{ t.createdAt | date:'dd MMM' }}</span>
          </div>
        </div>
      }

      @if (selectedTicket()) {
        <div class="backdrop" (click)="selectedTicket.set(null)"></div>
        <div class="modal">
          <div class="modal-head">
            <h2>{{ selectedTicket().ticketNumber }}</h2>
            <div class="head-actions">
              <select [ngModel]="selectedTicket().status" (ngModelChange)="updateStatus($event)">
                <option value="open">Open</option><option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
              </select>
              <button (click)="selectedTicket.set(null)">✕</button>
            </div>
          </div>
          <div class="modal-body">
            <p class="detail-subject">{{ selectedTicket().subject }}</p>
            <p class="detail-user">By: {{ selectedTicket().userId?.firstName || selectedTicket().userId?.phone }}</p>
            <div class="messages">
              @for (m of selectedTicket().messages; track m.timestamp) {
                <div class="message" [class.admin]="m.senderType === 'admin'" [class.user]="m.senderType === 'user'">
                  <span class="msg-sender">{{ m.senderType === 'admin' ? 'Admin' : 'Customer' }}</span>
                  <p class="msg-body">{{ m.body }}</p>
                  <span class="msg-time">{{ m.timestamp | date:'dd MMM, h:mm a' }}</span>
                </div>
              }
            </div>
            <div class="reply-form">
              <textarea [(ngModel)]="replyBody" rows="3" placeholder="Admin reply..."></textarea>
              <button class="btn-reply" [disabled]="!replyBody" (click)="adminReply()">Send Reply</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { padding: $space-xl; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xl; }
    .stats-grid { display:grid; grid-template-columns: repeat(5,1fr); gap: $space-md; margin-bottom: $space-xl; }
    .stat { padding: $space-md; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-xl; text-align:center; &.warn { border-color:rgba(204,88,3,.3); } &.ok { border-color:rgba(87,136,108,.3); } &.danger { border-color:rgba(192,57,43,.3); } }
    .val { display:block; font-size: $font-size-xl; font-weight: $font-weight-bold; color: $color-text-primary; .warn & { color: $color-warning; } .ok & { color: $color-success; } .danger & { color: $color-error; } }
    .lbl { font-size: $font-size-xs; color: $color-text-tertiary; text-transform:uppercase; }
    .filters { display:flex; gap: $space-md; margin-bottom: $space-lg; select { padding: $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; font-family: $font-family; } }
    .ticket-row { display:flex; justify-content:space-between; align-items:center; padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; margin-bottom: $space-xs; cursor:pointer; &:hover { border-color: $color-border; } }
    .t-info { display:flex; align-items:center; gap: $space-md; }
    .t-num { font-family:monospace; font-size: $font-size-xs; color: $color-text-tertiary; }
    .t-subject { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; }
    .t-user { font-size: $font-size-xs; color: $color-text-tertiary; }
    .t-right { display:flex; align-items:center; gap: $space-md; }
    .t-priority { font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase; &[data-priority="urgent"] { color: $color-error; } &[data-priority="high"] { color: $color-warning; } }
    .t-status { padding:1px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="open"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="in_progress"] { background:rgba(70,130,180,.1); color:#4682B4; }
      &[data-status="resolved"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="closed"] { background:rgba(58,45,50,.1); color: $color-text-tertiary; }
    }
    .t-date { font-size: $font-size-xs; color: $color-text-disabled; }
    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:650px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal; }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } }
    .head-actions { display:flex; gap: $space-sm; select { padding: $space-xs; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-xs; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .detail-subject { font-size: $font-size-md; font-weight: $font-weight-bold; margin:0 0 $space-xxs; }
    .detail-user { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-lg; }
    .messages { display:flex; flex-direction:column; gap: $space-sm; margin-bottom: $space-lg; max-height:350px; overflow-y:auto; }
    .message { padding: $space-sm $space-md; border-radius: $radius-lg; max-width:80%;
      &.user { background: $color-bg-secondary; align-self:flex-start; }
      &.admin { background: $color-primary-light; align-self:flex-end; }
    }
    .msg-sender { font-size:10px; font-weight: $font-weight-bold; color: $color-text-tertiary; text-transform:uppercase; }
    .msg-body { font-size: $font-size-sm; color: $color-text-primary; margin: $space-xxs 0; }
    .msg-time { font-size:10px; color: $color-text-disabled; }
    .reply-form { display:flex; gap: $space-sm; textarea { flex:1; padding: $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; outline:none; font-family: $font-family; resize:none; } }
    .btn-reply { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; align-self:flex-end; &:disabled { opacity:.5; } }
  `],
})
export class SupportDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly tickets = signal<any[]>([]);
  readonly stats = signal<any>(null);
  readonly selectedTicket = signal<any>(null);
  statusFilter = '';
  priorityFilter = '';
  replyBody = '';

  ngOnInit(): void { this.loadStats(); this.load(); }

  loadStats(): void { this.http.get<{ data: any }>(`${this.api}/admin/support/stats`).subscribe({ next: (r) => this.stats.set(r.data) }); }

  load(): void {
    let url = `${this.api}/admin/support/tickets?limit=50`;
    if (this.statusFilter) url += `&status=${this.statusFilter}`;
    if (this.priorityFilter) url += `&priority=${this.priorityFilter}`;
    this.http.get<{ data: any[] }>(url).subscribe({ next: (r) => this.tickets.set(r.data) });
  }

  openTicket(t: any): void {
    this.http.get<{ data: any }>(`${this.api}/admin/support/tickets/${t._id}`).subscribe({
      next: (r) => { this.selectedTicket.set(r.data); this.replyBody = ''; },
    });
  }

  adminReply(): void {
    if (!this.replyBody) return;
    this.http.post(`${this.api}/admin/support/tickets/${this.selectedTicket()._id}/reply`, { body: this.replyBody }).subscribe({
      next: (r: any) => { this.selectedTicket.set(r.data); this.replyBody = ''; this.load(); this.loadStats(); },
    });
  }

  updateStatus(status: string): void {
    this.http.patch(`${this.api}/admin/support/tickets/${this.selectedTicket()._id}/status`, { status }).subscribe({
      next: () => { this.load(); this.loadStats(); },
    });
  }
}
