import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout';

export const ADMIN_ROUTES: Routes = [
  // Product preview — standalone, no admin layout (full-screen Apple-style page)
  {
    path: 'products/preview/:id',
    loadComponent: () =>
      import('./products/product-preview/product-preview').then((m) => m.ProductPreviewComponent),
  },
  // Admin panel with sidebar layout
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./dashboard/admin-dashboard').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./users/user-list/user-list').then((m) => m.UserListComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./products/product-list/product-list').then((m) => m.ProductListComponent),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./categories/category-list').then((m) => m.CategoryListComponent),
      },
      {
        path: 'collections',
        loadComponent: () =>
          import('./collections/collection-list').then((m) => m.CollectionListComponent),
      },
      {
        path: 'pricing',
        loadComponent: () => import('./pricing/pricing-rules').then((m) => m.PricingRulesComponent),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./payments/payment-list').then((m) => m.AdminPaymentListComponent),
      },
      {
        path: 'wallets',
        loadComponent: () =>
          import('./wallets/wallet-management').then((m) => m.AdminWalletManagementComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./orders/order-list').then((m) => m.AdminOrderListComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./inventory/inventory-dashboard').then((m) => m.InventoryDashboardComponent),
      },
      {
        path: 'warehouses',
        loadComponent: () =>
          import('./warehouses/warehouse-list').then((m) => m.WarehouseListComponent),
      },
      {
        path: 'coupons',
        loadComponent: () =>
          import('./promotions/coupon-management').then((m) => m.CouponManagementComponent),
      },
      {
        path: 'merchandising',
        loadComponent: () =>
          import('./merchandising/merchandising-management').then((m) => m.MerchandisingManagementComponent),
      },
      {
        path: 'moderation',
        loadComponent: () =>
          import('./moderation/moderation-dashboard').then((m) => m.ModerationDashboardComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notification-management').then((m) => m.NotificationManagementComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./analytics/analytics-dashboard').then((m) => m.AnalyticsDashboardComponent),
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./audit-logs/audit-log-list').then((m) => m.AuditLogListComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/admin-settings').then((m) => m.AdminSettingsComponent),
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./workflows/workflow-list').then((m) => m.WorkflowListComponent),
      },
      {
        path: 'system-health',
        loadComponent: () =>
          import('./system-health/system-health').then((m) => m.SystemHealthComponent),
      },
      {
        path: 'observability',
        loadComponent: () =>
          import('./observability/observability-dashboard').then((m) => m.ObservabilityDashboardComponent),
      },
    ],
  },
];
