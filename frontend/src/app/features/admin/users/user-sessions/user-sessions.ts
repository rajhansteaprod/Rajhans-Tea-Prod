import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, SessionView } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-user-sessions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sessions-panel">
      <!-- Panel header -->
      <div class="panel-top">
        <div class="panel-title-group">
          <div class="panel-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <h3 class="panel-title">Active Sessions</h3>
            <p class="panel-sub">{{ userName }}</p>
          </div>
        </div>
        <div class="panel-actions">
          @if (sessions().length > 0) {
            <button class="btn-danger-outline" (click)="revokeAll()" [disabled]="revoking()">
              Revoke All
            </button>
          }
          <button class="btn-close" (click)="closed.emit()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <div class="panel-loading">
          <div class="spinner"></div>
          <span>Loading sessions...</span>
        </div>
      }

      <!-- Error state -->
      @else if (error()) {
        <div class="panel-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>Failed to load sessions</span>
        </div>
      }

      <!-- Empty state -->
      @else if (sessions().length === 0) {
        <div class="panel-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p>No active sessions</p>
          <span>User is not logged in on any device</span>
        </div>
      }

      <!-- Session list -->
      @else {
        <div class="session-list">
          @for (session of sessions(); track session._id) {
            <div class="session-row" [class.current]="session.isCurrent">
              <!-- Device icon -->
              <div class="device-icon" [class]="'device-' + session.deviceType">
                @if (session.deviceType === 'mobile') {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                } @else if (session.deviceType === 'tablet') {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                } @else {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                }
              </div>

              <!-- Session info -->
              <div class="session-info">
                <div class="session-top">
                  <span class="session-device">{{ session.deviceName }}</span>
                  @if (session.isCurrent) {
                    <span class="current-badge">Current</span>
                  }
                </div>
                <div class="session-meta">
                  <span class="meta-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    {{ session.ip }}
                  </span>
                  <span class="meta-sep">·</span>
                  <span class="meta-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                      <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    Last active {{ timeAgo(session.lastUsedAt) }}
                  </span>
                  <span class="meta-sep">·</span>
                  <span class="meta-item ua-detail" [title]="session.userAgent">
                    {{ session.userAgent | slice:0:60 }}{{ (session.userAgent?.length ?? 0) > 60 ? '…' : '' }}
                  </span>
                </div>
              </div>

              <!-- Revoke button -->
              <button
                class="btn-revoke"
                (click)="revokeOne(session._id)"
                [disabled]="revoking()"
                title="Revoke this session"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18.364 5.636L5.636 18.364M5.636 5.636l12.728 12.728" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use '../../../../../core/design-tokens/tokens' as *;
    @use '../../../../../core/design-tokens/mixins' as *;

    .sessions-panel {
      background: $color-bg-secondary;
      border: 1px solid $color-border;
      border-radius: $radius-xl;
      overflow: hidden;
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    // === Header ===
    .panel-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $space-md $space-lg;
      border-bottom: 1px solid $color-border-light;
      gap: $space-sm;
    }

    .panel-title-group {
      display: flex;
      align-items: center;
      gap: $space-sm;
    }

    .panel-icon {
      width: 36px;
      height: 36px;
      border-radius: $radius-md;
      background: $color-primary-light;
      color: $color-primary;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .panel-title {
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $color-text-primary;
    }

    .panel-sub {
      font-size: $font-size-xs;
      color: $color-text-tertiary;
      margin-top: 1px;
    }

    .panel-actions {
      display: flex;
      align-items: center;
      gap: $space-sm;
    }

    .btn-danger-outline {
      display: flex;
      align-items: center;
      gap: $space-xs;
      padding: $space-xs $space-sm;
      border: 1px solid rgba(203, 65, 65, 0.3);
      border-radius: $radius-md;
      background: transparent;
      color: $color-error;
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      font-family: $font-family;
      cursor: pointer;
      transition: all $transition-fast;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background: rgba(203, 65, 65, 0.08);
        border-color: $color-error;
      }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    .btn-close {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      color: $color-text-tertiary;
      cursor: pointer;
      border-radius: $radius-sm;
      transition: all $transition-fast;

      &:hover { background: $color-bg-tertiary; color: $color-text-primary; }
    }

    // === States ===
    .panel-loading, .panel-error, .panel-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: $space-sm;
      padding: $space-xxxl $space-xl;
      color: $color-text-tertiary;
      font-size: $font-size-sm;
    }

    .panel-empty {
      svg { color: $color-text-disabled; }
      p {
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
        color: $color-text-secondary;
        margin: 0;
      }
      span { font-size: $font-size-xs; }
    }

    .panel-error { color: $color-error; }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid $color-border;
      border-top-color: $color-primary;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    // === Session rows ===
    .session-list {
      padding: $space-xs;
    }

    .session-row {
      display: flex;
      align-items: flex-start;
      gap: $space-sm;
      padding: $space-sm $space-sm;
      border-radius: $radius-md;
      transition: background $transition-fast;
      position: relative;

      &:hover { background: $color-bg-tertiary; }

      &.current {
        background: rgba(204, 88, 3, 0.04);
        border: 1px solid rgba(204, 88, 3, 0.12);
        border-radius: $radius-md;
      }
    }

    // === Device icon ===
    .device-icon {
      width: 34px;
      height: 34px;
      border-radius: $radius-md;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;

      &.device-desktop { background: rgba(87, 136, 108, 0.1); color: $color-secondary; }
      &.device-mobile  { background: $color-primary-light;    color: $color-primary; }
      &.device-tablet  { background: $color-accent-light;     color: $color-accent; }
    }

    // === Session info ===
    .session-info {
      flex: 1;
      min-width: 0;
    }

    .session-top {
      display: flex;
      align-items: center;
      gap: $space-xs;
      margin-bottom: 3px;
    }

    .session-device {
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    .current-badge {
      font-size: 10px;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: $letter-spacing-wide;
      padding: 1px $space-xs;
      border-radius: $radius-sm;
      background: $color-primary-light;
      color: $color-primary;
    }

    .session-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;
      font-size: 11px;
      color: $color-text-disabled;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .meta-sep { color: $color-border; }

    .ua-detail {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 10px;
      @include truncate;
      max-width: 280px;
    }

    // === Revoke button ===
    .btn-revoke {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      border-radius: $radius-sm;
      background: none;
      color: $color-text-disabled;
      cursor: pointer;
      transition: all $transition-fast;
      flex-shrink: 0;

      &:hover:not(:disabled) {
        border-color: rgba(203, 65, 65, 0.3);
        background: rgba(203, 65, 65, 0.06);
        color: $color-error;
      }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }
  `],
})
export class UserSessionsComponent implements OnInit, OnChanges {
  @Input({ required: true }) userId!: string;
  @Input() userName = 'User';

  readonly closed = output<void>();
  readonly sessionRevoked = output<void>();

  sessions = signal<SessionView[]>([]);
  loading  = signal(false);
  error    = signal(false);
  revoking = signal(false);

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      this.load();
    }
  }

  revokeOne(sessionId: string): void {
    this.revoking.set(true);
    this.adminService.revokeSession(sessionId).subscribe({
      next: () => {
        this.sessions.update((s) => s.filter((x) => x._id !== sessionId));
        this.revoking.set(false);
        this.sessionRevoked.emit();
      },
      error: () => this.revoking.set(false),
    });
  }

  revokeAll(): void {
    this.revoking.set(true);
    this.adminService.revokeAllSessions(this.userId).subscribe({
      next: () => {
        this.sessions.set([]);
        this.revoking.set(false);
        this.sessionRevoked.emit();
      },
      error: () => this.revoking.set(false),
    });
  }

  timeAgo(date: string | Date): string {
    if (!date) return '—';
    const diff  = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.adminService.getUserSessions(this.userId).subscribe({
      next: (res) => {
        this.sessions.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
