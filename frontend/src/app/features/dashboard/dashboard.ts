import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';

interface SidebarItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss'],
})
export class DashboardComponent {
  private sanitizer = inject(DomSanitizer);

  constructor(
    public auth: AuthService,
    private router: Router,
  ) {}

  trustSvg(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  readonly userName = computed(() => {
    const user = this.auth.user();
    if (user?.firstName) return `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    return '';
  });

  readonly userEmail = computed(() => this.auth.user()?.email || '');
  readonly isAdmin = computed(() => this.auth.isAdmin());

  readonly sidebarItems = computed<SidebarItem[]>(() => {
    const items: SidebarItem[] = [
      {
        label: 'My Orders',
        route: '/dashboard',
        icon: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>',
      },
      {
        label: 'Your Addresses',
        route: '/dashboard/addresses',
        icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      },
      // {
      //   label: 'Edit Profile',
      //   route: '/dashboard/profile',
      //   icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      // },
      // {
      //   label: 'Wallet',
      //   route: '/dashboard/wallet',
      //   icon: '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5zm-4 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>',
      // },
      {
        label: 'Wishlist',
        route: '/dashboard/wishlist',
        icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
      },
      // {
      //   label: 'Loyalty Points',
      //   route: '/dashboard/loyalty',
      //   icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      // },
      // {
      //   label: 'Refer a Friend',
      //   route: '/dashboard/referral',
      //   icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      // },
    ];
    return items;
  });

  signOut(): void {
    this.auth.logout();
  }
}
