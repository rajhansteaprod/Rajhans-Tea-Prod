import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent implements OnInit {
  stats = signal<{ label: string; value: string; color: string; icon: string }[]>([]);
  actions = signal<{ label: string; emoji: string; route: string }[]>([]);

  constructor(
    public authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const isAdmin = this.isAdmin();

    this.stats.set(
      isAdmin
        ? [
            { label: 'Total Orders', value: '0', color: '#CC5803', icon: '<path d="M3 3h18l-2 13H5L3 3ZM1 1h4"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' },
            { label: 'Products', value: '0', color: '#57886C', icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/>' },
            { label: 'Customers', value: '0', color: '#A27E8E', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
            { label: 'Revenue', value: '₹0', color: '#3A2D32', icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
          ]
        : [
            { label: 'My Orders', value: '0', color: '#CC5803', icon: '<path d="M3 3h18l-2 13H5L3 3ZM1 1h4"/><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' },
            { label: 'Wishlist', value: '0', color: '#A27E8E', icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>' },
            { label: 'Addresses', value: '0', color: '#57886C', icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>' },
          ],
    );

    this.actions.set(
      isAdmin
        ? [
            { label: 'Manage Products', emoji: '📦', route: '/admin/products' },
            { label: 'View Orders', emoji: '📋', route: '/admin/orders' },
            { label: 'Customer List', emoji: '👥', route: '/admin/customers' },
            { label: 'Store Settings', emoji: '⚙️', route: '/admin/settings' },
          ]
        : [
            { label: 'Browse Products', emoji: '🛍️', route: '/products' },
            { label: 'My Orders', emoji: '📦', route: '/orders' },
            { label: 'My Addresses', emoji: '📍', route: '/addresses' },
            { label: 'Edit Profile', emoji: '👤', route: '/profile' },
          ],
    );
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  userName(): string {
    const user = this.authService.user();
    return user?.firstName || '';
  }

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  getGreetingEmoji(): string {
    const hour = new Date().getHours();
    if (hour < 12) return '☀️';
    if (hour < 17) return '🌤️';
    return '🌙';
  }

  onAction(route: string): void {
    this.router.navigate([route]);
  }
}
