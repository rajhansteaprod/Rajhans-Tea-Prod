import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
  collapsed: boolean;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrls: ['./admin-layout.scss'],
})
export class AdminLayoutComponent {
  sidebarOpen = signal(false);

  navSections: NavSection[] = [
    {
      label: 'MAIN',
      collapsed: false,
      items: [
        { label: 'Dashboard', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>', route: '/admin' },
      ],
    },
    {
      label: 'CATALOG',
      collapsed: false,
      items: [
        { label: 'Products', icon: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', route: '/admin/products' },
        { label: 'Categories', icon: '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>', route: '/admin/categories' },
        { label: 'Collections', icon: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', route: '/admin/collections' },
      ],
    },
    {
      label: 'ORDERS & FULFILLMENT',
      collapsed: false,
      items: [
        { label: 'Orders', icon: '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"/></svg>', route: '/admin/orders' },
        { label: 'Inventory', icon: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/inventory' },
        { label: 'Warehouses', icon: '<svg viewBox="0 0 24 24"><path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 0v1a3 3 0 0 0 6 0V7m0 0v1a3 3 0 0 0 6 0V7M3 7l1-4h16l1 4M5 21V10.7M19 21V10.7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>', route: '/admin/warehouses' },
      ],
    },
    {
      label: 'FINANCE',
      collapsed: false,
      items: [
        { label: 'Payments', icon: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', route: '/admin/payments' },
        { label: 'Wallets', icon: '<svg viewBox="0 0 24 24"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5zm-4 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/wallets' },
      ],
    },
    {
      label: 'INTERFACE',
      collapsed: false,
      items: [
        { label: 'Hero Slides', icon: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', route: '/admin/interface/hero-slides' },
      ],
    },
    {
      label: 'CONTENT',
      collapsed: false,
      items: [
        { label: 'CMS', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/cms' },
      ],
    },
    {
      label: 'PEOPLE',
      collapsed: false,
      items: [
        { label: 'Users', icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', route: '/admin/users' },
      ],
    },
    {
      label: 'SYSTEM',
      collapsed: false,
      items: [
        { label: 'Settings', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2" fill="none"/></svg>', route: '/admin/settings' },
      ],
    },
  ];

  constructor(public authService: AuthService) {
    this.loadCollapsedState();
  }

  toggleSection(section: NavSection): void {
    section.collapsed = !section.collapsed;
    this.saveCollapsedState();
  }

  private loadCollapsedState(): void {
    try {
      const saved = localStorage.getItem('admin-sidebar-collapsed');
      if (saved) {
        const state = JSON.parse(saved) as Record<string, boolean>;
        for (const section of this.navSections) {
          if (state[section.label] !== undefined) section.collapsed = state[section.label];
        }
      }
    } catch { /* ignore */ }
  }

  private saveCollapsedState(): void {
    const state: Record<string, boolean> = {};
    for (const section of this.navSections) state[section.label] = section.collapsed;
    localStorage.setItem('admin-sidebar-collapsed', JSON.stringify(state));
  }

  getInitials(): string {
    const user = this.authService.user();
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
    }
    return user?.phone?.slice(-2) || '?';
  }
}
