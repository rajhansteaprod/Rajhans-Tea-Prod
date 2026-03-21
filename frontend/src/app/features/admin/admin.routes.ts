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
    ],
  },
];
