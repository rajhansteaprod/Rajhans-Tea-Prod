import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  channels: string[];
  createdAt: string;
}

interface ApiResponse<T> { success: boolean; data: T; }
interface PaginatedResponse<T> { success: boolean; data: T[]; meta: any; }

@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;
  private socket: Socket | null = null;

  readonly unreadCount = signal(0);
  readonly notifications = signal<NotificationItem[]>([]);
  readonly loading = signal(false);
  readonly drawerOpen = signal(false);
  readonly latestNotification = signal<NotificationItem | null>(null);

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.connect();
      this.loadUnreadCount();
    }
  }

  // ─── WebSocket Connection ──────────────────────────────────────────────────

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.auth.getAccessToken();
    if (!token) return;

    this.socket = io('/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[WS] Connected');
    });

    this.socket.on('notification', (data: NotificationItem) => {
      // Real-time: new notification arrived
      this.unreadCount.update((c) => c + 1);
      this.latestNotification.set(data);
      // Prepend to list if drawer is open
      this.notifications.update((list) => [data, ...list]);
    });

    this.socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[WS] Connection error:', err.message);
      // Fallback to polling if WebSocket fails
      this.startPollingFallback();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ─── Polling Fallback (if WebSocket unavailable) ───────────────────────────

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  private startPollingFallback(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (this.auth.isLoggedIn()) this.loadUnreadCount();
    }, 60000);
  }

  // ─── API Methods ───────────────────────────────────────────────────────────

  loadUnreadCount(): void {
    this.http.get<ApiResponse<{ count: number }>>(`${this.api}/notifications/unread-count`).subscribe({
      next: (res) => this.unreadCount.set(res.data.count),
    });
  }

  loadNotifications(page = 1, unreadOnly = false): void {
    this.loading.set(true);
    this.http.get<PaginatedResponse<NotificationItem>>(`${this.api}/notifications?page=${page}&limit=20${unreadOnly ? '&unreadOnly=true' : ''}`).subscribe({
      next: (res) => { this.notifications.set(res.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadLatest(): void {
    this.http.get<PaginatedResponse<NotificationItem>>(`${this.api}/notifications?page=1&limit=5`).subscribe({
      next: (res) => this.notifications.set(res.data),
    });
  }

  markRead(id: string): void {
    this.http.patch(`${this.api}/notifications/${id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((n) => n._id === id ? { ...n, isRead: true } : n));
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAllRead(): void {
    this.http.patch(`${this.api}/notifications/read-all`, {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
        this.unreadCount.set(0);
      },
    });
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
    this.loadLatest();
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  toggleDrawer(): void {
    if (this.drawerOpen()) this.closeDrawer();
    else this.openDrawer();
  }
}
