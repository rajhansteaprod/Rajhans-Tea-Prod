import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout';
import { guestGuard, authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
      },
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.DashboardComponent),
      },
      {
        path: 'wishlist',
        loadComponent: () =>
          import('./features/store/wishlist/wishlist-page').then((m) => m.WishlistPageComponent),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./features/store/checkout/checkout-page').then((m) => m.CheckoutPageComponent),
      },
      {
        path: 'orders',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/orders/order-history-page').then((m) => m.OrderHistoryPageComponent),
      },
      {
        path: 'wallet',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/wallet/wallet-page').then((m) => m.WalletPageComponent),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
