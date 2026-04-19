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
        path: 'payments',
        loadComponent: () =>
          import('./payments/payment-list').then((m) => m.AdminPaymentListComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./orders/order-list').then((m) => m.AdminOrderListComponent),
      },
      {
        path: 'shipments/ready-to-ship',
        loadComponent: () =>
          import('./shipments/ready-to-ship/ready-to-ship').then((m) => m.ReadyToShipComponent),
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
        path: 'settings',
        loadComponent: () =>
          import('./settings/admin-settings').then((m) => m.AdminSettingsComponent),
      },
      {
        path: 'cms',
        loadComponent: () =>
          import('./cms/cms-management').then((m) => m.CmsManagementComponent),
      },
      {
        path: 'wallets',
        loadComponent: () =>
          import('./wallets/wallet-management').then((m) => m.WalletManagementComponent),
      },
      {
        path: 'interface/hero-slides',
        loadComponent: () =>
          import('./interface/hero-slides/hero-slides').then((m) => m.HeroSlidesComponent),
      },
      {
        path: 'promotions/coupons',
        loadComponent: () =>
          import('./promotions/coupons/coupon-list').then((m) => m.CouponListComponent),
      },
    ],
  },
];
