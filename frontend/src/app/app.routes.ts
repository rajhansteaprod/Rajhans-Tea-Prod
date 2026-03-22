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
        path: 'search',
        loadComponent: () =>
          import('./features/store/search/search-page').then((m) => m.SearchPageComponent),
      },
      {
        path: 'product/:slug',
        loadComponent: () =>
          import('./features/store/product/product-detail').then((m) => m.ProductDetailComponent),
      },
      {
        path: 'catalog/:slug',
        loadComponent: () =>
          import('./features/store/catalog/catalog-page').then((m) => m.CatalogPageComponent),
      },
      {
        path: 'collections',
        loadComponent: () =>
          import('./features/store/collections/collections-page').then((m) => m.CollectionsPageComponent),
      },
      {
        path: 'blog',
        loadComponent: () =>
          import('./features/store/blog/blog-list').then((m) => m.BlogListComponent),
      },
      {
        path: 'blog/:slug',
        loadComponent: () =>
          import('./features/store/blog/blog-post').then((m) => m.BlogPostComponent),
      },
      {
        path: 'page/:slug',
        loadComponent: () =>
          import('./features/store/pages/static-page').then((m) => m.StaticPageComponent),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./features/store/contact/contact-page').then((m) => m.ContactPageComponent),
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
      {
        path: 'loyalty',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/loyalty/loyalty-page').then((m) => m.LoyaltyPageComponent),
      },
      {
        path: 'referral',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/referral/referral-page').then((m) => m.ReferralPageComponent),
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
