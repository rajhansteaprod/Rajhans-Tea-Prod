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
        path: 'products',
        loadComponent: () =>
          import('./features/store/products/products-page').then((m) => m.ProductsPageComponent),
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
      // {
      //   path: 'collections',
      //   loadComponent: () =>
      //     import('./features/store/collections/collections-page').then((m) => m.CollectionsPageComponent),
      // },
      {
        path: 'blog',
        loadComponent: () =>
          import('./features/store/blog/blog-list-page').then((m) => m.BlogListPageComponent),
      },
      {
        path: 'blog/:slug',
        loadComponent: () =>
          import('./features/store/blog/blog-detail-page').then((m) => m.BlogDetailPageComponent),
      },
      {
        path: 'page/about-us',
        loadComponent: () =>
          import('./features/store/pages/about/about').then((m) => m.AboutComponent),
      },
      {
        path: 'page/:slug',
        loadComponent: () =>
          import('./features/store/pages/static-page').then((m) => m.StaticPageComponent),
      },
      {
        path: 'wishlist',
        loadComponent: () =>
          import('./features/store/wishlist/wishlist-page').then((m) => m.WishlistPageComponent),
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/checkout/checkout-page').then((m) => m.CheckoutPageComponent),
      },
      {
        path: 'order-confirmation',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/store/order-confirmation/order-confirmation-page').then(
            (m) => m.OrderConfirmationPageComponent,
          ),
      },
      {
        path: 'orders',
        redirectTo: '/dashboard',
        pathMatch: 'full',
      },
      // Dashboard shell with sidebar + child routes
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.DashboardComponent),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/store/orders/order-history-page').then((m) => m.OrderHistoryPageComponent),
          },
          {
            path: 'addresses',
            loadComponent: () =>
              import('./features/dashboard/addresses/addresses').then((m) => m.AddressesComponent),
          },
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/dashboard/profile/profile').then((m) => m.ProfileComponent),
          },
          // {
          //   path: 'wallet',
          //   loadComponent: () =>
          //     import('./features/store/wallet/wallet-page').then((m) => m.WalletPageComponent),
          // },
          {
            path: 'wishlist',
            loadComponent: () =>
              import('./features/store/wishlist/wishlist-page').then((m) => m.WishlistPageComponent),
          },
          // {
          //   path: 'loyalty',
          //   loadComponent: () =>
          //     import('./features/dashboard/loyalty/loyalty').then((m) => m.LoyaltyComponent),
          // },
          // {
          //   path: 'referral',
          //   loadComponent: () =>
          //     import('./features/dashboard/referral/referral').then((m) => m.ReferralComponent),
          // },
        ],
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
