import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1 class="page-title">Support</h1>
      <p class="page-sub">Need help? Create a ticket and we'll get back to you.</p>

      <button class="btn-new" (click)="showCreate.set(true)">+ New Ticket</button>

      @if (tickets().length === 0) {
        <div class="empty">No tickets yet.</div>
      } @else {
        <div class="ticket-list">
          @for (t of tickets(); track t._id) {
            <div class="ticket-card" (click)="openTicket(t)">
              <div class="t-header">
                <span class="t-number">{{ t.ticketNumber }}</span>
                <span class="t-status" [attr.data-status]="t.status">{{ t.status }}</span>
              </div>
              <p class="t-subject">{{ t.subject }}</p>
              <div class="t-meta">
                <span class="t-priority" [attr.data-priority]="t.priority">{{ t.priority }}</span>
                <span>{{ t.createdAt | date:'dd MMM yyyy' }}</span>
                <span>{{ t.messages?.length || 0 }} messages</span>
              </div>
            </div>
          }
        </div>
      }

      <!-- Create Modal -->
      @if (showCreate()) {
        <div class="backdrop" (click)="showCreate.set(false)"></div>
        <div class="modal">
          <div class="modal-head"><h2>New Ticket</h2><button (click)="showCreate.set(false)">✕</button></div>
          <div class="modal-body">
            <div class="form-field"><label>Subject</label><input [(ngModel)]="createForm.subject" placeholder="What do you need help with?" /></div>
            <div class="form-field"><label>Priority</label>
              <select [(ngModel)]="createForm.priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            </div>
            <div class="form-field"><label>Description</label><textarea [(ngModel)]="createForm.description" rows="5" placeholder="Describe your issue in detail..."></textarea></div>
            <div class="modal-actions"><button (click)="showCreate.set(false)">Cancel</button><button class="btn-save" [disabled]="!createForm.subject || !createForm.description" (click)="submitTicket()">Submit</button></div>
          </div>
        </div>
      }

      <!-- Ticket Detail Modal -->
      @if (selectedTicket()) {
        <div class="backdrop" (click)="selectedTicket.set(null)"></div>
        <div class="modal wide">
          <div class="modal-head"><h2>{{ selectedTicket().ticketNumber }}</h2><button (click)="selectedTicket.set(null)">✕</button></div>
          <div class="modal-body">
            <p class="detail-subject">{{ selectedTicket().subject }}</p>
            <div class="messages">
              @for (m of selectedTicket().messages; track m.timestamp) {
                <div class="message" [class.admin]="m.senderType === 'admin'" [class.user]="m.senderType === 'user'">
                  <span class="msg-sender">{{ m.senderType === 'admin' ? 'Support' : 'You' }}</span>
                  <p class="msg-body">{{ m.body }}</p>
                  <span class="msg-time">{{ m.timestamp | date:'dd MMM, h:mm a' }}</span>
                </div>
              }
            </div>
            @if (selectedTicket().status !== 'closed') {
              <div class="reply-form">
                <textarea [(ngModel)]="replyBody" rows="3" placeholder="Type your reply..."></textarea>
                <button class="btn-reply" [disabled]="!replyBody" (click)="sendReply()">Send</button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:800px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-xxs; }
    .page-sub { font-size: $font-size-sm; color: $color-text-tertiary; margin:0 0 $space-xl; }
    .btn-new { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; margin-bottom: $space-xl; }
    .empty { text-align:center; color: $color-text-tertiary; padding: $space-xxl; }

    .ticket-list { display:flex; flex-direction:column; gap: $space-sm; }
    .ticket-card { padding: $space-md $space-lg; background: $color-bg-tertiary; border:1px solid $color-border-light; border-radius: $radius-lg; cursor:pointer; transition: all $transition-fast;
      &:hover { border-color: $color-border; box-shadow: $shadow-md; }
    }
    .t-header { display:flex; justify-content:space-between; margin-bottom: $space-xxs; }
    .t-number { font-family:monospace; font-size: $font-size-xs; color: $color-text-tertiary; }
    .t-status { padding:1px $space-xs; border-radius: $radius-full; font-size:10px; font-weight: $font-weight-bold; text-transform:uppercase;
      &[data-status="open"] { background:rgba(204,88,3,.1); color: $color-primary; }
      &[data-status="in_progress"] { background:rgba(70,130,180,.1); color:#4682B4; }
      &[data-status="waiting"] { background:rgba(162,126,142,.12); color: $color-accent; }
      &[data-status="resolved"] { background:rgba(87,136,108,.12); color: $color-success; }
      &[data-status="closed"] { background:rgba(58,45,50,.1); color: $color-text-tertiary; }
    }
    .t-subject { font-size: $font-size-md; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 $space-xs; }
    .t-meta { display:flex; gap: $space-lg; font-size: $font-size-xs; color: $color-text-tertiary; }
    .t-priority { font-weight: $font-weight-bold;
      &[data-priority="urgent"] { color: $color-error; }
      &[data-priority="high"] { color: $color-warning; }
    }

    .backdrop { position:fixed; inset:0; background:rgba(58,45,50,.4); backdrop-filter:blur(4px); z-index: $z-modal-backdrop; }
    .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; max-width:90vw; max-height:85vh; overflow-y:auto; background: $color-bg-tertiary; border-radius: $radius-xl; box-shadow: $shadow-xl; z-index: $z-modal;
      &.wide { width:600px; }
    }
    .modal-head { display:flex; align-items:center; justify-content:space-between; padding: $space-lg $space-xl; border-bottom:1px solid $color-border-light; h2 { font-size: $font-size-lg; font-weight: $font-weight-bold; margin:0; } button { width:32px; height:32px; border-radius: $radius-md; border:1px solid $color-border-light; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; } }
    .modal-body { padding: $space-xl; }
    .form-field { display:flex; flex-direction:column; gap: $space-xs; margin-bottom: $space-md; label { font-size: $font-size-xs; font-weight: $font-weight-semibold; color: $color-text-tertiary; text-transform:uppercase; } input, textarea, select { width:100%; padding: $space-sm $space-md; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; background: $color-bg-secondary; outline:none; font-family: $font-family; box-sizing:border-box; resize:vertical; &:focus { border-color: $color-primary; } } }
    .modal-actions { display:flex; justify-content:flex-end; gap: $space-md; margin-top: $space-lg; button { padding: $space-sm $space-lg; border:1px solid $color-border; border-radius: $radius-md; background:transparent; font-size: $font-size-sm; cursor:pointer; } }
    .btn-save { background: $color-primary !important; color: $color-text-inverse !important; border:none !important; &:disabled { opacity:.5; } }

    .detail-subject { font-size: $font-size-md; font-weight: $font-weight-bold; color: $color-text-primary; margin:0 0 $space-lg; }
    .messages { display:flex; flex-direction:column; gap: $space-sm; margin-bottom: $space-lg; max-height:400px; overflow-y:auto; }
    .message { padding: $space-sm $space-md; border-radius: $radius-lg; max-width:85%;
      &.user { background: $color-primary-light; align-self:flex-end; border-bottom-right-radius: $radius-sm; }
      &.admin { background: $color-bg-secondary; align-self:flex-start; border-bottom-left-radius: $radius-sm; }
    }
    .msg-sender { font-size:10px; font-weight: $font-weight-bold; color: $color-text-tertiary; text-transform:uppercase; }
    .msg-body { font-size: $font-size-sm; color: $color-text-primary; margin: $space-xxs 0; line-height: $line-height-relaxed; }
    .msg-time { font-size:10px; color: $color-text-disabled; }
    .reply-form { display:flex; gap: $space-sm; textarea { flex:1; padding: $space-sm; border:1px solid $color-border; border-radius: $radius-md; font-size: $font-size-sm; outline:none; font-family: $font-family; resize:none; &:focus { border-color: $color-primary; } } }
    .btn-reply { padding: $space-sm $space-lg; background: $color-primary; color: $color-text-inverse; border:none; border-radius: $radius-md; font-size: $font-size-sm; font-weight: $font-weight-semibold; cursor:pointer; align-self:flex-end; &:disabled { opacity:.5; } }
  `],
})
export class SupportPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly tickets = signal<any[]>([]);
  readonly selectedTicket = signal<any>(null);
  readonly showCreate = signal(false);
  createForm = { subject: '', description: '', priority: 'medium' };
  replyBody = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<{ data: any[] }>(`${this.api}/support/tickets?limit=50`).subscribe({
      next: (r) => this.tickets.set(r.data),
    });
  }

  submitTicket(): void {
    this.http.post(`${this.api}/support/tickets`, this.createForm).subscribe({
      next: () => { this.showCreate.set(false); this.createForm = { subject: '', description: '', priority: 'medium' }; this.load(); },
    });
  }

  openTicket(t: any): void {
    this.http.get<{ data: any }>(`${this.api}/support/tickets/${t._id}`).subscribe({
      next: (r) => { this.selectedTicket.set(r.data); this.replyBody = ''; },
    });
  }

  sendReply(): void {
    if (!this.replyBody || !this.selectedTicket()) return;
    this.http.post(`${this.api}/support/tickets/${this.selectedTicket()._id}/reply`, { body: this.replyBody }).subscribe({
      next: (r: any) => { this.selectedTicket.set(r.data); this.replyBody = ''; this.load(); },
    });
  }
}
