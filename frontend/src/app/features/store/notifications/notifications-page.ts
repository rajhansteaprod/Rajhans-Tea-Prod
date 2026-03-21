import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificationStore } from '../../../core/services/notification.store';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="title">Notifications</h1>
        @if (store.unreadCount() > 0) {
          <button class="btn-mark-all" (click)="store.markAllRead()">Mark all as read</button>
        }
      </div>

      @if (store.loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else if (store.notifications().length === 0) {
        <div class="empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.5"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.5"/></svg>
          <p>No notifications yet</p>
        </div>
      } @else {
        <div class="notif-list">
          @for (n of store.notifications(); track n._id) {
            <div class="notif-item" [class.unread]="!n.isRead" (click)="onNotifClick(n)">
              <div class="notif-dot" [class.visible]="!n.isRead"></div>
              <div class="notif-icon">{{ typeIcon(n.type) }}</div>
              <div class="notif-content">
                <p class="notif-title">{{ n.title }}</p>
                <p class="notif-body">{{ n.body }}</p>
                <p class="notif-time">{{ n.createdAt | date:'dd MMM yyyy, h:mm a' }}</p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../core/design-tokens/tokens' as *;
    .page { max-width:700px; margin:0 auto; padding: $space-xxl $space-lg; }
    .page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: $space-xl; }
    .title { font-size: $font-size-xxl; font-weight: $font-weight-bold; color: $color-text-primary; margin:0; }
    .btn-mark-all { padding: $space-xs $space-md; border:1px solid $color-primary; border-radius: $radius-md; background:transparent; color: $color-primary; font-size: $font-size-sm; cursor:pointer; &:hover { background: $color-primary-light; } }
    .loading { display:flex; justify-content:center; padding: $space-xxxl; }
    .spinner { width:28px; height:28px; border:2px solid $color-border; border-top-color: $color-primary; border-radius:50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .empty { display:flex; flex-direction:column; align-items:center; gap: $space-md; padding: $space-xxxl; color: $color-text-disabled; text-align:center; p { margin:0; } }
    .notif-list { display:flex; flex-direction:column; }
    .notif-item { display:grid; grid-template-columns:8px 36px 1fr; gap: $space-sm; padding: $space-md; border-bottom:1px solid $color-border-light; cursor:pointer; transition: background $transition-fast;
      &:hover { background: $color-bg-secondary; }
      &.unread { background: rgba(204,88,3,.03); }
    }
    .notif-dot { width:8px; height:8px; border-radius:50%; margin-top:6px; &.visible { background: $color-primary; } }
    .notif-icon { width:36px; height:36px; border-radius: $radius-md; background: $color-bg-secondary; display:flex; align-items:center; justify-content:center; font-size:16px; }
    .notif-content { min-width:0; }
    .notif-title { font-size: $font-size-sm; font-weight: $font-weight-semibold; color: $color-text-primary; margin:0 0 2px; }
    .notif-body { font-size: $font-size-sm; color: $color-text-secondary; margin:0 0 $space-xxs; line-height: $line-height-relaxed; }
    .notif-time { font-size: $font-size-xs; color: $color-text-disabled; margin:0; }
  `],
})
export class NotificationsPageComponent implements OnInit {
  readonly store = inject(NotificationStore);

  ngOnInit(): void {
    this.store.loadNotifications();
  }

  onNotifClick(n: any): void {
    if (!n.isRead) this.store.markRead(n._id);
  }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      order_confirmed: '📦', order_shipped: '🚚', order_delivered: '✅', order_cancelled: '❌',
      payment_captured: '💳', payment_refunded: '💰', review_approved: '⭐', review_replied: '💬',
      loyalty_earned: '🎯', low_stock_alert: '⚠️', review_reminder: '✍️', announcement: '📢',
    };
    return icons[type] || '🔔';
  }
}
