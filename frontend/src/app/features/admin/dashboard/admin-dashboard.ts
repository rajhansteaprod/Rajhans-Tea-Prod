import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService, DashboardStats, AdminUser } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss'],
})
export class AdminDashboardComponent implements OnInit {
  stats = signal<DashboardStats | null>(null);
  recentUsers = signal<AdminUser[]>([]);
  loading = signal(true);
  todayFormatted: string;

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
  ) {
    const now = new Date();
    this.todayFormatted = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  ngOnInit(): void {
    this.adminService.getDashboardStats().subscribe({
      next: (res) => {
        this.stats.set(res.data.stats);
        this.recentUsers.set(res.data.recentUsers);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  getActivePercent(): number {
    const s = this.stats();
    if (!s || !s.totalUsers) return 0;
    return Math.round((s.activeUsers / s.totalUsers) * 100);
  }

  getCustomerPercent(): number {
    const s = this.stats();
    if (!s || !s.totalUsers) return 0;
    return Math.round((s.customerUsers / s.totalUsers) * 100);
  }

  getInitials(user: AdminUser): string {
    if (user.firstName) return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    return user.phone.slice(-2);
  }

  getDisplayName(user: AdminUser): string {
    if (user.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    return '+91 ' + user.phone;
  }

  timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
