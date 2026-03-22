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
  templateUrl: './user-sessions.html',
  styleUrls: ['./user-sessions.scss'],
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
