import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout';

export const ADMIN_ROUTES: Routes = [
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
        loadComponent: () =>
          import('./users/user-list/user-list').then((m) => m.UserListComponent),
      },
    ],
  },
];
