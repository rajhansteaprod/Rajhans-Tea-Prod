# 07 — Frontend Architecture

Angular 21 standalone components, Signals state, lazy loading.

---

## Application Bootstrap

```
index.html → <app-root>
                  ↓
         main.ts → bootstrapApplication(AppComponent, appConfig)
                          ↓
                   appConfig (app.config.ts)
                   - provideRouter(routes)
                   - provideHttpClient(withInterceptors([authInterceptor]))
                   - provideAnimations()
                   - provideNzI18n(en_US)
```

There is no `AppModule`. Angular 21 uses a standalone bootstrap model — no `NgModule` class needed. Everything is configured in `appConfig`.

---

## Routing Structure

```
/ (MainLayoutComponent — shell with header)
├── /                → HomeComponent         (public, lazy loaded)
└── /dashboard       → DashboardComponent    [authGuard] (lazy loaded)

/admin              [adminGuard]
├── /admin           → AdminLayoutComponent
├── /admin/dashboard → AdminDashboardComponent
└── /admin/users     → UserListComponent

/auth               [guestGuard] (redirects logged-in users away)
└── /auth/login      → LoginComponent        (lazy loaded)

/**                  → redirect to /
```

### Why Lazy Loading?

Every `loadComponent()` and `loadChildren()` creates a separate JavaScript bundle. The browser only downloads the admin bundle if the user navigates to `/admin`. This makes the initial page load faster.

---

## Route Guards

Three guards in `core/guards/auth.guard.ts`:

| Guard | Allows | Blocks | Used On |
|-------|--------|--------|---------|
| `authGuard` | Logged-in users | Non-logged-in | `/dashboard` |
| `guestGuard` | Non-logged-in users | Logged-in (redirects to `/`) | `/auth` |
| `adminGuard` | Admins only | Customers (redirects to `/`) | `/admin` |

All guards use signals:
```typescript
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  return authService.isLoggedIn() || router.navigate(['/auth/login']) && false;
};
```

---

## State Management (Angular Signals)

`AuthService` is the single source of truth for authentication state:

```typescript
// Private writable signals
private _user = signal<AuthUser | null>(null);
private _accessToken = signal<string | null>(null);

// Public read-only (components can read, not write)
readonly user = this._user.asReadonly();
readonly isLoggedIn = computed(() => !!this._user());
readonly isAdmin = computed(() => this._user()?.role === 'admin');
```

`computed()` is like a formula cell in a spreadsheet — it automatically recalculates when its dependencies change. When `_user` changes, `isLoggedIn` and `isAdmin` update instantly everywhere they're used.

**To use in a component:**
```typescript
@Component({
  template: `
    @if (auth.isLoggedIn()) {
      <span>Welcome, {{ auth.user()?.firstName }}</span>
    }
  `
})
export class HeaderComponent {
  auth = inject(AuthService);
}
```

---

## HTTP Interceptor (Auto-Auth)

`core/interceptors/auth.interceptor.ts` runs on EVERY HTTP request:

```
Outgoing request
       │
       ▼
Is access token available AND is this not a public auth endpoint?
       │
   YES │                        NO
       ▼                        │
Add Authorization header        │
Bearer {accessToken}            │
       │                        │
       ▼                        ▼
       ──── Forward to backend ────
                    │
                    ▼
              Response received
                    │
              Status 401?
                    │
           YES             NO
            │               │
            ▼               ▼
  Try refreshToken()    Pass response through
            │
    Success │    Failure
            │         │
            ▼         ▼
  Retry request    authService.logout()
  with new token   → redirect to /auth/login
```

This means your components never need to worry about token expiry. The interceptor handles it transparently.

---

## Firebase Integration

```
FirebaseService (frontend)
  ├── initializeApp(firebase config)
  ├── getAuth(app) → auth object
  ├── initRecaptcha(containerId)
  │     Creates invisible reCAPTCHA verifier
  │     Required by Firebase before sending SMS
  ├── sendOtp(phoneNumber)
  │     signInWithPhoneNumber(auth, "+91phone", recaptchaVerifier)
  │     → confirmationResult stored in memory
  └── verifyOtp(otp)
        confirmationResult.confirm(otp)
        → user credential
        → credential.user.getIdToken()
        → Firebase ID Token
```

The Firebase ID Token is then sent to the backend for exchange.

---

## Design System (Tokens + Mixins)

All colors, spacing, fonts, shadows are defined as SCSS variables in `core/design-tokens/tokens.scss`.

```scss
// Colors
$color-primary: #CC5803;          // Rajhans orange
$color-primary-hover: #A84500;
$color-bg-primary: #1A1410;       // dark background
$color-text-primary: #FCFFF7;     // light text

// Spacing scale
$space-xs:  4px;
$space-sm:  8px;
$space-md:  12px;
$space-lg:  16px;
$space-xl:  24px;
$space-xxl: 40px;

// Typography
$font-family: 'Inter', sans-serif;
$font-family-display: 'Playfair Display', serif;
$font-size-display: 3.5rem;
```

Every component imports tokens:
```scss
@use '../../../core/design-tokens/tokens' as *;
// then use: $color-primary, $space-lg, etc.
```

Responsive breakpoints via `mixins.scss`:
```scss
@include respond-to(md) {
  // styles for screens < md breakpoint
}
```

---

## Component Architecture

Angular 21 uses **standalone components** — no NgModule needed:

```typescript
@Component({
  selector: 'app-login',
  standalone: true,                     // no NgModule
  imports: [FormsModule, CommonModule],  // import what you need
  template: `...`,
  styles: [`...`]                        // scoped styles
})
export class LoginComponent {}
```

Each component file contains:
1. The TypeScript class (logic)
2. The HTML template (inline or separate file)
3. The SCSS styles (inline or separate file)

This is called "co-location" — everything for one component in one place.
