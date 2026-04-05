# PART 2: FRONTEND — Complete Knowledge Transfer

> **Target Audience**: BTech CS student joining the project
> **Goal**: End-to-end understanding of the Angular frontend — architecture, components, services, state management, routing, design system, animations, and all UI logic
> **Project**: Rajhans Tea — Premium MEAN stack ecommerce frontend (Angular 21)

---

## TABLE OF CONTENTS

- [A. Angular Fundamentals & Project Bootstrap (Concepts 1–50)](#a-angular-fundamentals--project-bootstrap)
- [B. Routing & Navigation (Concepts 51–90)](#b-routing--navigation)
- [C. Core Services & State Management (Concepts 91–175)](#c-core-services--state-management)
- [D. Guards & Interceptors (Concepts 176–215)](#d-guards--interceptors)
- [E. Layouts & Shell (Concepts 216–260)](#e-layouts--shell)
- [F. Shared Components (Concepts 261–295)](#f-shared-components)
- [G. Feature: Home Page (Concepts 296–330)](#g-feature-home-page)
- [H. Feature: Authentication (Concepts 331–370)](#h-feature-authentication)
- [I. Feature: Store Pages (Concepts 371–430)](#i-feature-store-pages)
- [J. Feature: Admin Panel (Concepts 431–470)](#j-feature-admin-panel)
- [K. Design System & Theming (Concepts 471–530)](#k-design-system--theming)
- [L. Third-Party Libraries (Concepts 531–560)](#l-third-party-libraries)
- [M. Build, Dev Server & Environment (Concepts 561–590)](#m-build-dev-server--environment)
- [N. Performance & Accessibility (Concepts 591–610)](#n-performance--accessibility)

---

## A. ANGULAR FUNDAMENTALS & PROJECT BOOTSTRAP

### Concept 1: What is Angular?
Angular ek **component-based frontend framework** hai jo Google develop karta hai. Ye browser me Single Page Applications (SPAs) banata hai. React/Vue se different — Angular ek **full framework** hai with routing, forms, HTTP client, animations sab built-in. React me ye sab alag libraries chahiye.

### Concept 2: Angular 21 (Latest)
Ye project **Angular 21** pe hai — latest version. Key features:
- **Standalone components** (no NgModule needed)
- **Signals** (new reactive primitive)
- **Functional guards and interceptors**
- `@angular/build:application` builder (new build system)

### Concept 3: TypeScript in Angular
Angular me saara code **TypeScript** me likhte hain. Angular CLI TypeScript compile karke JavaScript banata hai jo browser samajhta hai. Strict mode ON hai — maximum type safety.

### Concept 4: Standalone Components
Purane Angular me har component ko ek `NgModule` me declare karna padta tha. Angular 21 me **standalone components** hain — module ki zarurat nahi:
```typescript
@Component({
  standalone: true,                   // Independent component
  imports: [CommonModule, RouterLink], // Apni dependencies khud import karta hai
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {}
```
Ye simpler hai — component apni dependencies khud manage karta hai.

### Concept 5: Component Structure (Strict Rule)
Is project me har component ke **4 alag files** hain:
```
component-name/
├── component-name.ts       ← TypeScript logic (class)
├── component-name.html     ← HTML template
├── component-name.scss     ← Scoped styles
└── component-name.spec.ts  ← Tests (optional)
```
**Inline templates/styles NEVER** — hamesha separate files. Ye project convention hai.

### Concept 6: Bootstrap Process
Application start hone ka flow:
```
Browser loads index.html
  → <script> tags load compiled JS bundles
    → main.ts executes
      → bootstrapApplication(App, appConfig)
        → Angular framework initializes
          → APP_INITIALIZER runs (auth check)
            → Router resolves initial route
              → Component renders
```

### Concept 7: main.ts — Entry Point
```typescript
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
```
Ye poore application ka entry point hai. `App` root component hai, `appConfig` providers define karta hai. `catch` — agar startup fail ho to error console me dikhe.

### Concept 8: appConfig — Application Configuration
```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor])),
    provideAnimations(),
    provideNzI18n(en_US),
    {
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => () =>
        firstValueFrom(authService.initializeAuth()),
      deps: [AuthService],
      multi: true,
    },
  ],
};
```
Line by line:
1. `provideBrowserGlobalErrorListeners()` — Global error catching
2. `provideRouter(routes)` — Angular Router activate karo
3. `provideHttpClient(withInterceptors(...))` — HTTP client + interceptors register karo
4. `provideAnimations()` — Angular animations enable karo
5. `provideNzI18n(en_US)` — ng-zorro UI library ko English locale do
6. `APP_INITIALIZER` — App start hone se PEHLE auth status check karo

### Concept 9: APP_INITIALIZER
```typescript
{
  provide: APP_INITIALIZER,
  useFactory: (authService: AuthService) => () =>
    firstValueFrom(authService.initializeAuth()),
  deps: [AuthService],
  multi: true,
}
```
Angular app render karne se **pehle** ye function run karta hai. `initializeAuth()` check karta hai ki localStorage me stored token valid hai kya (refresh token se verify). Agar invalid hai → clear kar do (user logged out on next page load).

**Kyu important?** Bina iske: User refresh kare → purana invalid token se API call → 401 error → bad UX. Iske saath: Refresh pe hi pata chal jaata hai ki session valid hai ya nahi.

### Concept 10: App Component (Root)
```typescript
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, LoadingBarComponent],
  templateUrl: './app.html',
})
export class App {}
```
Sabse top-level component. 3 cheezein render karta hai:
1. `<router-outlet>` — Active route ka component yahan render hota hai
2. `<app-toast-container>` — Global toast notifications
3. `<app-loading-bar>` — Top loading progress bar

### Concept 11: @Component Decorator
```typescript
@Component({
  selector: 'app-home',     // HTML me <app-home> tag use karo
  standalone: true,          // No NgModule needed
  imports: [...],            // Dependencies
  templateUrl: './home.html', // HTML template path
  styleUrls: ['./home.scss'], // SCSS styles path
})
```
`@Component` Angular ko batata hai ki ye class ek component hai. `selector` — ye component HTML me kis tag se use hoga.

### Concept 12: Template Syntax — Interpolation
```html
<h1>{{ product.name }}</h1>           <!-- Variable display -->
<p>Price: ₹{{ product.basePrice }}</p> <!-- Expression -->
```
`{{ }}` — Double curly braces me TypeScript expression likhte hain. Angular automatically value render karta hai aur change hone pe update karta hai.

### Concept 13: Template Syntax — Property Binding
```html
<img [src]="product.images[0]" />     <!-- Dynamic attribute -->
<button [disabled]="loading()">Pay</button> <!-- Conditional disable -->
```
`[property]="expression"` — Square brackets se DOM property dynamically set hoti hai. Expression change hone pe DOM automatically update hota hai.

### Concept 14: Template Syntax — Event Binding
```html
<button (click)="addToCart()">Add</button>    <!-- Click event -->
<input (keydown.enter)="doSearch()" />         <!-- Enter key -->
<input (input)="onPhoneInput($event)" />       <!-- Input event -->
```
`(event)="handler()"` — Parentheses me DOM event ka naam, handler function component class me hai.

### Concept 15: Template Syntax — @if / @for (New Control Flow)
Angular 21 me naya control flow syntax hai:
```html
@if (product()) {
  <div class="product">{{ product().name }}</div>
} @else {
  <div class="skeleton">Loading...</div>
}

@for (item of cartItems(); track item.productId) {
  <div class="item">{{ item.name }}</div>
} @empty {
  <p>Cart is empty</p>
}
```
`@if` purane `*ngIf` ki jagah hai. `@for` purane `*ngFor` ki jagah. `track` React ke `key` jaisa hai — DOM efficiently update karne ke liye.

### Concept 16: Signals — Angular's New Reactivity
```typescript
readonly loading = signal(false);          // Writable signal
readonly user = signal<User | null>(null); // Typed signal

// Read value:
console.log(this.loading());  // false (function call!)

// Update value:
this.loading.set(true);                    // Direct set
this.loading.update(v => !v);              // Based on current value
```
**Signal** ek reactive container hai. Jab signal ki value change hoti hai, Angular automatically wahi component re-render karta hai jahan signal use hua hai. React ke `useState` jaisa but different mechanism.

### Concept 17: Computed Signals
```typescript
readonly isLoggedIn = computed(() => !!this._user());
readonly isAdmin = computed(() => this._user()?.role === 'admin');
readonly cartCount = computed(() =>
  this._cartItems().reduce((s, i) => s + i.qty, 0)
);
```
`computed()` ek **derived signal** hai — doosre signals se automatically calculate hota hai. Jab `_user` change ho, `isLoggedIn` aur `isAdmin` automatically recalculate. **Memoized** — sirf tab recalculate jab dependency change ho.

### Concept 18: Signal vs Observable
```
Signal:      Synchronous, always has value, .set()/.update(), template me ()
Observable:  Asynchronous, may not have value yet, .subscribe(), template me | async

// Signal
readonly count = signal(0);
template: {{ count() }}

// Observable
readonly count$ = of(0);
template: {{ count$ | async }}
```
Is project me **signals primary hain** state management ke liye. Observables sirf HTTP calls aur RxJS operators ke liye use hote hain.

### Concept 19: asReadonly()
```typescript
private readonly _user = signal<AuthUser | null>(null); // Private, writable
readonly user = this._user.asReadonly();                 // Public, read-only
```
`asReadonly()` signal ko read-only version me expose karta hai. Component ke bahar koi signal ki value change nahi kar sakta. **Encapsulation** — state sirf service ke andar change honi chahiye.

### Concept 20: effect()
```typescript
constructor() {
  effect(() => {
    const t = this.theme();                          // Read signal
    document.documentElement.setAttribute('data-theme', t); // Side effect
    localStorage.setItem('theme', t);
  });
}
```
`effect()` tab execute hota hai jab uske andar read ki gayi signal change ho. ThemeService me: `theme` signal change hone pe DOM attribute aur localStorage dono update hote hain automatically.

### Concept 21: toObservable()
```typescript
import { toObservable } from '@angular/core/rxjs-interop';

toObservable(this.auth.isLoggedIn).pipe(
  pairwise(),
  filter(([prev, curr]) => !prev && curr), // false → true transition
  switchMap(() => this.http.post('/cart/merge', ...)),
);
```
`toObservable()` signal ko Observable me convert karta hai. Useful jab RxJS operators use karne hon (pairwise, filter, switchMap). CartStore me: Login hone pe (false→true) automatically cart merge hota hai.

### Concept 22: Dependency Injection (DI)
```typescript
// Old way (constructor injection)
constructor(private http: HttpClient, private router: Router) {}

// New way (inject function)
private readonly http = inject(HttpClient);
private readonly router = inject(Router);
```
Angular automatically class instances provide karta hai. `inject(HttpClient)` — Angular ka built-in HTTP client de do. Tu khud `new HttpClient()` nahi banata. **DI benefits**: Testing me mock inject kar sakte ho.

### Concept 23: @Injectable({ providedIn: 'root' })
```typescript
@Injectable({ providedIn: 'root' })
export class AuthService { ... }
```
`providedIn: 'root'` — Ye service **singleton** hai (poore application me ek hi instance). Pehli baar koi component inject kare tab create hota hai. Saare components same instance share karte hain.

### Concept 24: Input / Output
```typescript
// ProductCardComponent
@Input({ required: true }) product!: Product;  // Parent → Child data
@Input() layout: 'vertical' | 'horizontal' = 'vertical';
@Output() addToCart = new EventEmitter<string>(); // Child → Parent event

// Parent template
<app-product-card
  [product]="item"
  [layout]="'horizontal'"
  (addToCart)="onAddToCart($event)"
/>
```
`@Input` — Parent component se data receive karo. `@Output` — Parent ko event bhejo (EventEmitter se).

### Concept 25: Lifecycle Hooks
```typescript
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  ngOnInit(): void {
    // Component initialize hone pe — API calls, data load
  }

  ngAfterViewInit(): void {
    // DOM ready hone ke baad — GSAP animations, DOM queries
  }

  ngOnDestroy(): void {
    // Component destroy hone pe — cleanup (subscriptions, timers, GSAP)
  }
}
```
Angular component ke lifecycle me specific moments pe code run kar sakte ho:
- `ngOnInit` — Data fetching, initialization
- `ngAfterViewInit` — DOM manipulation (elements exist now)
- `ngOnDestroy` — Cleanup (memory leaks prevent)

### Concept 26: @HostListener
```typescript
@HostListener('window:scroll')
onScroll(): void {
  this.scrolled.set(window.scrollY > 100);
}

@HostListener('window:keydown', ['$event'])
onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { this.closeMega(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { this.toggleSearch(); }
}
```
`@HostListener` DOM events ko component class ke methods se bind karta hai. HeaderComponent me: scroll pe header style change, Ctrl+K pe search open, Escape pe close.

### Concept 27: @ViewChild
```typescript
@ViewChild('phoneInput') phoneInputEl!: ElementRef<HTMLInputElement>;

ngAfterViewInit(): void {
  this.phoneInputEl.nativeElement.focus(); // DOM element pe directly focus
}
```
`@ViewChild` template me marked element ka reference deta hai. `#phoneInput` template me laga ke class me access karo. **Direct DOM manipulation** ke liye (focus, scroll, measure).

### Concept 28: ElementRef
```typescript
private readonly el = inject(ElementRef);

ngAfterViewInit(): void {
  const root = this.el.nativeElement as HTMLElement;
  root.querySelector('.hero__bg'); // Component ke andar elements find karo
}
```
`ElementRef` component ke root DOM element ka reference hai. GSAP animations me component ke andar elements select karne ke liye use hota hai.

### Concept 29: CommonModule
```typescript
imports: [CommonModule]
```
`CommonModule` Angular ke built-in directives provide karta hai: `@if`, `@for`, `@switch`, `[ngClass]`, `[ngStyle]`, pipes (`| date`, `| currency`, `| uppercase`). Almost har component me import hota hai.

### Concept 30: FormsModule
```typescript
imports: [FormsModule]

// Template me:
<input [(ngModel)]="address.name" />
```
`FormsModule` **Template-Driven Forms** enable karta hai. `[(ngModel)]` two-way data binding hai — input change karo → variable update, variable change karo → input update. Checkout address form me use hota hai.

### Concept 31: HttpClient
```typescript
this.http.get<ApiResponse<Product[]>>('/api/v1/catalog/products')
  .subscribe({
    next: (res) => { /* success */ },
    error: (err) => { /* failure */ },
  });

this.http.post<ApiResponse<CartView>>('/api/v1/cart/items', { productId, qty })
  .subscribe(/* ... */);
```
`HttpClient` Angular ka built-in HTTP client hai. Typed responses (`<ApiResponse<Product[]>>`) — TypeScript auto-complete deta hai response pe. `.subscribe()` se actual request fire hoti hai (Observable pattern).

### Concept 32: Observable Pattern
```typescript
// Observable = lazy stream — subscribe karo tab chalega
this.http.get('/products')             // Observable banaya (request nahi gayi abhi)
  .pipe(                               // Operators lagao
    map(res => res.data),              // Data extract karo
    catchError(err => of([])),         // Error pe empty array return karo
  )
  .subscribe(data => { ... });         // Ab request jaati hai
```
Observable **lazy** hai — jab tak subscribe nahi karo, kuch nahi hoga. `.pipe()` me operators chain karte hain. `subscribe()` se execution start hoti hai.

### Concept 33: RxJS Operators Used in This Project
| Operator | Kya karta hai | Kahan use hota hai |
|----------|-------------|-------------------|
| `tap()` | Side effect (modify nahi karta) | Auth — tokens save karna |
| `catchError()` | Error handle karna | Auth init — silently fail |
| `switchMap()` | Outer observable ko inner se replace | Token refresh → retry request |
| `finalize()` | Complete/error dono pe run | Loading indicator stop |
| `filter()` | Condition match nahi to skip | Router events — sirf NavigationEnd |
| `pairwise()` | Previous + current value | Login detect (false→true) |
| `startWith()` | Initial value provide | pairwise ke liye baseline |
| `firstValueFrom()` | Observable → Promise | APP_INITIALIZER me |
| `of()` | Static value ka Observable | Default/fallback values |
| `throwError()` | Error Observable | Interceptor me error propagate |

### Concept 34: subscribe() vs toPromise()
```typescript
// Observable way (preferred for most cases)
this.http.get('/products').subscribe({
  next: (res) => { ... },
  error: (err) => { ... },
});

// Promise way (used in async/await context)
const res = await this.http.post('/payments/orders', data).toPromise();
```
PaymentStore me `toPromise()` use hota hai kyunki payment flow sequential hai (create → modal → verify) aur `async/await` cleaner hai.

### Concept 35: Pipe (Transform)
```html
<span>{{ product.createdAt | date:'mediumDate' }}</span>  <!-- "Mar 27, 2026" -->
<span>₹{{ product.basePrice | number:'1.0-0' }}</span>     <!-- "₹499" -->
```
Pipes template me data transform karte hain display ke liye. Original data change nahi hota — sirf display format.

### Concept 36: SCSS (Sass)
Project **SCSS** use karta hai — CSS ka superset jo variables, nesting, mixins, functions add karta hai:
```scss
// Variable
$color-primary: #4A0E2B;

// Nesting (CSS me flat hota hai)
.card {
  background: white;
  .title { font-weight: bold; }  // → .card .title { ... }
  &:hover { transform: scale(1.02); } // → .card:hover { ... }
}

// Mixin (reusable code block)
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
.container { @include flex-center; }
```

### Concept 37: Scoped Styles
Angular component ke styles **scoped** hain — sirf us component ke elements pe apply hote hain, dusre components pe nahi:
```
ProductCardComponent styles → sirf product-card ke andar
HeaderComponent styles       → sirf header ke andar
```
Angular internally special attributes add karke scope maintain karta hai (`_ngcontent-abc`). Global styles `styles.scss` me hain.

### Concept 38: View Encapsulation
Default: `ViewEncapsulation.Emulated` — Angular CSS rules me component-specific attribute selectors add karta hai.

Agar kisi component ke styles globally affect karne hon: `:host ::ng-deep .some-class { }` (legacy, avoid if possible).

### Concept 39: Angular CLI
```bash
ng generate component features/store/cart   # Naya component scaffold karo
ng generate service core/services/auth      # Nayi service scaffold karo
ng serve                                     # Dev server start karo
ng build --configuration production          # Production build karo
```
Angular CLI scaffolding aur build tools provide karta hai. `angular.json` me sab configuration hai.

### Concept 40: angular.json — Build Configuration
```json
{
  "builder": "@angular/build:application",
  "options": {
    "browser": "src/main.ts",           // Entry point
    "styles": [
      "node_modules/ng-zorro-antd/ng-zorro-antd.min.css",  // ng-zorro CSS
      "src/styles.scss"                                      // Global styles
    ]
  },
  "configurations": {
    "production": {
      "budgets": [{ "type": "initial", "maximumWarning": "2MB", "maximumError": "4MB" }],
      "outputHashing": "all",
      "fileReplacements": [{ "replace": "environment.ts", "with": "environment.prod.ts" }]
    },
    "development": {
      "optimization": false,
      "sourceMap": true
    }
  }
}
```
Key settings:
- **budgets** — Initial bundle 2MB se bada ho to warning, 4MB se bada to build FAIL
- **outputHashing** — File names me hash (cache busting: `main.abc123.js`)
- **fileReplacements** — Production me environment.prod.ts use hota hai
- **sourceMap** — Dev me ON (debugging), prod me OFF (security)

### Concept 41: Schematics (Project Defaults)
```json
"schematics": {
  "@schematics/angular:component": {
    "style": "scss",
    "skipTests": true
  }
}
```
`ng generate component` chalane pe automatically SCSS use hoga aur test file skip hogi. Project-wide defaults.

### Concept 42: index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Rajhans Tea</title>
  <base href="/">
</head>
<body>
  <app-root></app-root>  <!-- Angular yahan render karta hai -->
</body>
</html>
```
`<base href="/">` — Angular Router ko batata hai ki root URL kya hai. `<app-root>` — App component ka selector.

### Concept 43: Zone.js (Change Detection)
Angular me Zone.js har async operation (click, HTTP response, setTimeout) ke baad **change detection** trigger karta hai. Signal-based components me ye zyada efficient hai — sirf affected components update hote hain, poora tree nahi.

### Concept 44: Standalone vs NgModule Based
```
NgModule (Old)                      Standalone (This Project)
─────────                           ──────────
@NgModule({                         @Component({
  declarations: [CompA, CompB],       standalone: true,
  imports: [SharedModule],            imports: [CommonModule],
  exports: [CompA],                 })
})
```
Standalone simpler hai — no module overhead. Direct component-to-component import.

### Concept 45: Project File Structure
```
frontend/src/
├── main.ts                        ← Bootstrap entry point
├── index.html                     ← Single HTML page
├── styles.scss                    ← Global styles
├── styles/theme.scss              ← Light/dark theme CSS vars
├── environments/                  ← Environment configs
├── proxy.conf.json                ← Dev server API proxy
├── app/
│   ├── app.ts                     ← Root component
│   ├── app.html                   ← Root template
│   ├── app.config.ts              ← Provider configuration
│   ├── app.routes.ts              ← Route definitions
│   ├── core/                      ← Singleton services, guards, interceptors
│   │   ├── services/              ← AuthService, CartStore, PaymentStore, etc.
│   │   ├── guards/                ← authGuard, guestGuard, adminGuard
│   │   ├── interceptors/          ← authInterceptor, loadingInterceptor
│   │   └── design-tokens/         ← SCSS tokens & mixins
│   ├── shared/                    ← Reusable components
│   │   └── components/            ← ProductCard, Toast, LoadingBar, etc.
│   ├── layouts/                   ← Page layouts
│   │   ├── main-layout/           ← Header + Footer + Content
│   │   └── admin-layout/          ← Sidebar + Content
│   └── features/                  ← Feature modules
│       ├── home/                  ← Homepage + sections
│       ├── auth/                  ← Login (OTP)
│       ├── dashboard/             ← User dashboard
│       ├── store/                 ← Products, Product Detail, Cart, Checkout, etc.
│       └── admin/                 ← Admin panel (all CRUD pages)
```

### Concept 46: Core vs Shared vs Features
```
core/     → Singleton services, guards, interceptors (1 instance, app-wide)
shared/   → Reusable UI components (multiple instances, no state)
features/ → Page-level components (route-specific, business logic)
```
- `core/` me jo hai wo KABHI import nahi hota `shared/` me
- `shared/` me jo hai wo kisi bhi feature me import ho sakta hai
- `features/` me jo hai wo sirf apne route pe load hota hai

### Concept 47: Type Safety
```typescript
export interface Product {
  _id: string;
  name: string;
  slug: string;
  basePrice: number;
  images: string[];
  category: CategoryRef;
  // ...
}

// HTTP call me type specify karo:
this.http.get<ApiResponse<Product[]>>('/catalog/products')
```
Har API response typed hai. TypeScript auto-complete deta hai `product.` likhte waqt. Typo karo (`product.nmae`) → compile error.

### Concept 48: Interface vs Type
```typescript
interface Product { name: string; price: number; }  // Extensible (extend/implement)
type SortOption = 'relevance' | 'price_asc' | 'price_desc';  // Union types
type Step = 'cart' | 'address' | 'summary';  // String literal union
```
Interfaces objects ke liye, types unions/primitives ke liye. Dono compile-time pe exist karte hain — runtime pe koi trace nahi.

### Concept 49: Record Type
```typescript
attributes: Record<string, string>;
// Same as: { [key: string]: string }
// Example: { "weight": "250g", "origin": "Assam" }
```
`Record<K, V>` — Dynamic key-value pairs jahan keys aur values ka type specified ho.

### Concept 50: Optional Properties
```typescript
interface Product {
  name: string;        // Required
  description?: string; // Optional (? mark)
  stock?: number;       // Optional
}
```
`?` mark — ye field hona bhi sakta hai, nahi bhi. Access karte waqt `undefined` check karna padta hai ya `?.` (optional chaining) use karo.

---

## B. ROUTING & NAVIGATION

### Concept 51: Angular Router
Angular Router URL changes ko specific components se map karta hai. Browser ka URL change hota hai, lekin page reload NAHI hota — JavaScript dynamically naya component render karta hai.

### Concept 52: Route Configuration
```typescript
export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
      { path: 'products', loadComponent: () => import('./features/store/products/products-page').then(m => m.ProductsPageComponent) },
      { path: 'product/:slug', loadComponent: () => import('./features/store/product/product-detail').then(m => m.ProductDetailComponent) },
      // ...
    ],
  },
  { path: 'admin', canActivate: [adminGuard], loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'auth', canActivate: [guestGuard], loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) },
  { path: '**', redirectTo: '' },
];
```

### Concept 53: Route Parameters
```typescript
// Route definition
{ path: 'product/:slug', component: ProductDetailComponent }

// URL: /product/assam-gold-tea
// slug = "assam-gold-tea"

// Component me access:
this.route.params.subscribe(params => {
  const slug = params['slug'];
  this.loadProduct(slug);
});
```
`:slug` dynamic segment hai. Har product ka apna slug hai. Route parameter se component ko pata chalta hai kaunsa product load karna hai.

### Concept 54: Query Parameters
```typescript
// URL: /products?q=green+tea&category=herbal
this.router.navigate(['/products'], { queryParams: { q: 'green tea', category: 'herbal' } });

// Component me access:
this.route.snapshot.queryParams['q']; // "green tea"
```
Query parameters URL me `?key=value` format me hote hain. Search, filtering, pagination me use hote hain. Route change nahi hota — sirf parameters update hote hain.

### Concept 55: Lazy Loading
```typescript
{ path: 'admin', loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES) }
{ path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) }
```
`loadComponent` aur `loadChildren` **lazy loading** enable karte hain. Admin panel ka code tab load hota hai jab user `/admin` pe jaaye — initial bundle me nahi hota. **Result**: Initial page load fast.

### Concept 56: loadComponent vs loadChildren
```
loadComponent → Single component lazy load karo
loadChildren  → Poora route group (multiple routes) lazy load karo
```
Admin panel me `loadChildren` — ek baar admin routes load hon to saare sub-routes (products, users, orders) available. Store pages me `loadComponent` — har page independently load.

### Concept 57: Route Layout Pattern
```typescript
{
  path: '',
  component: MainLayoutComponent,  // Header + Footer wrapper
  children: [
    { path: '', ... },              // Home
    { path: 'products', ... },      // Products
    { path: 'checkout', ... },      // Checkout
    // All children render INSIDE MainLayout's <router-outlet>
  ],
}
```
MainLayoutComponent me header aur footer hain. Children routes ka component `<router-outlet>` me render hota hai. Layout ek baar load hota hai, sirf content change hota hai.

### Concept 58: Nested Routes (Admin)
```typescript
// admin.routes.ts
{
  path: '',
  component: AdminLayoutComponent,  // Sidebar wrapper
  children: [
    { path: '', component: AdminDashboardComponent },
    { path: 'users', component: UserListComponent },
    { path: 'products', component: ProductListComponent },
  ],
}
```
Admin panel ka apna layout (sidebar) hai. Nested routes: `/admin` → dashboard, `/admin/users` → user list. Sidebar hamesha dikhai deta hai, sirf content area change hota hai.

### Concept 59: Product Preview — Layout Exception
```typescript
// admin.routes.ts
{
  path: 'products/preview/:id',
  loadComponent: () => import('./products/product-preview/product-preview').then(m => m.ProductPreviewComponent),
}
// Note: AdminLayoutComponent ke BAHAR hai — no sidebar, full-screen preview
```
Product preview page full-screen hai (Apple-style). Admin sidebar nahi chahiye — isliye ye route AdminLayoutComponent ke children ke BAHAR define hai.

### Concept 60: Wildcard Route
```typescript
{ path: '**', redirectTo: '' }
```
`**` match karta hai koi bhi URL jo upar ki routes me match nahi hua. `/random-page` → redirect to home. **404 handling** without showing error page.

### Concept 61: RouterLink
```html
<a routerLink="/products">All Products</a>
<a [routerLink]="['/product', product.slug]">{{ product.name }}</a>
```
`routerLink` Angular ka way hai navigation ka. Normal `<a href>` se page reload hota hai, `routerLink` se sirf component swap hota hai (SPA behavior).

### Concept 62: RouterLinkActive
```html
<a routerLink="/admin/products" routerLinkActive="active">Products</a>
```
Jab current URL match kare, element pe `active` CSS class lag jaati hai. Admin sidebar me active page highlight hota hai.

### Concept 63: Programmatic Navigation
```typescript
this.router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
this.router.navigateByUrl(returnUrl);
this.router.navigate(['/orders']);
```
Template ke bina code se navigate karo. Login ke baad user ko wapas original page pe redirect karna — `navigateByUrl(returnUrl)`.

### Concept 64: Router Events
```typescript
this.router.events.pipe(
  filter((e) => e instanceof NavigationEnd)
).subscribe((e) => {
  this.isHomePage.set((e as NavigationEnd).urlAfterRedirects === '/');
});
```
Router events emit karta hai navigation ke har stage pe. `NavigationEnd` — navigation complete hua. HeaderComponent check karta hai ki homepage pe hain kya (transparent header ke liye).

### Concept 65: Route Guards
3 guards hain:
```typescript
authGuard   → Logged in users only (dashboard, checkout, orders, wallet)
guestGuard  → NOT logged in users only (login page)
adminGuard  → Admin role only (admin panel)
```
Guard ek function hai jo route access se pehle run hota hai. `true` return kare → access allowed. `false` ya redirect → access denied.

### Concept 66: canActivate
```typescript
{ path: 'checkout', canActivate: [authGuard], loadComponent: () => ... }
{ path: 'admin', canActivate: [adminGuard], loadChildren: () => ... }
```
`canActivate` route pe guard lagata hai. User route pe jaane ki koshish kare → guard check kare → pass/fail.

### Concept 67: returnUrl Pattern
```typescript
// authGuard
router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });

// LoginComponent (after successful login)
const returnUrl = this.route.snapshot.queryParams['returnUrl'];
if (returnUrl) this.router.navigateByUrl(returnUrl);
```
User `/checkout` pe jaaye → authGuard redirect kare `/auth/login?returnUrl=/checkout` pe → Login success → wapas `/checkout` pe le jaaye. Seamless UX.

### Concept 68: Route-Level Data Flow
```
URL: /product/assam-gold-tea
  → Router matches: product/:slug
    → ProductDetailComponent loads
      → ngOnInit: route.params → slug = "assam-gold-tea"
        → HTTP GET /catalog/products/assam-gold-tea
          → product signal set
            → Template renders product data
```

---

## C. CORE SERVICES & STATE MANAGEMENT

### Concept 69: Service Architecture
```
AuthService     → User state, tokens, login/logout
CartStore       → Cart items, wishlist, session management
PaymentStore    → Razorpay flow, wallet, invoices
OrderStore      → Order history, tracking
ReviewStore     → Product reviews, Q&A, moderation
SearchStore     → Full-text search, autocomplete, filters
CatalogService  → Product/Category/Collection CRUD
AdminService    → User management, dashboard stats
FirebaseService → Phone OTP authentication
RazorpayService → Payment gateway integration
LoadingService  → Global loading state
ToastService    → Notification toasts
ThemeService    → Light/dark mode
```

### Concept 70: AuthService — State
```typescript
private _user = signal<AuthUser | null>(this.loadUserFromStorage());
private _accessToken = signal<string | null>(this.loadTokenFromStorage());

readonly user = this._user.asReadonly();
readonly isLoggedIn = computed(() => !!this._user());
readonly isAdmin = computed(() => this._user()?.role === 'admin');
```
3 signals:
- `_user` — Current logged-in user (or null)
- `_accessToken` — JWT access token
- `isLoggedIn` / `isAdmin` — Derived computed signals

### Concept 71: AuthService — Token Storage
```typescript
// Save (after login)
localStorage.setItem('user', JSON.stringify(res.data.user));
localStorage.setItem('accessToken', res.data.tokens.accessToken);
localStorage.setItem('refreshToken', res.data.tokens.refreshToken);

// Load (on page refresh)
private loadUserFromStorage(): AuthUser | null {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}
```
**localStorage** browser me persistent storage hai — page refresh pe bhi data rehta hai. Tokens yahan store hain taaki user har baar login na kare.

### Concept 72: AuthService — Login Flow
```
1. FirebaseService.sendOtp(phone)    → Firebase sends SMS
2. FirebaseService.verifyOtp(otp)    → Returns Firebase ID token
3. AuthService.verifyFirebaseToken(idToken)  → Backend verifies, returns JWT
4. Signal update: _user.set(user), _accessToken.set(token)
5. localStorage save
6. Router navigate to dashboard/home
```

### Concept 73: AuthService — initializeAuth()
```typescript
initializeAuth(): Observable<unknown> {
  if (!this._user()) return of(null);     // Not logged in — skip
  return this.refreshToken().pipe(
    catchError(() => {
      this.clearAuth();                    // Token invalid — clear everything
      return of(null);
    }),
  );
}
```
APP_INITIALIZER se call hota hai. Page refresh pe check: stored refresh token valid hai kya? Agar nahi → user silently logged out. Agar haan → naya access token mil gaya.

### Concept 74: AuthService — Logout Variants
```typescript
logout(): void {
  this.http.post('/auth/logout', {}).subscribe(); // Backend se token delete karo
  this.clearAuth();                                // Local state clear
  this.router.navigate(['/auth/login']);
}

logoutBanned(): void {
  this.clearAuth();
  this.router.navigate(['/auth/login'], { queryParams: { reason: 'banned' } });
}
```
Normal logout: Backend call + clear + redirect.
Banned logout: Sirf clear + redirect with reason (no backend call needed — server already rejected).

### Concept 75: CartStore — Session-Based Cart
```typescript
readonly sessionId: string = this.getOrCreateSessionId();

private getOrCreateSessionId(): string {
  const existing = localStorage.getItem('guestSessionId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem('guestSessionId', id);
  return id;
}
```
Guest users (bina login ke) ka cart `sessionId` se track hota hai. Pehli visit pe UUID generate, localStorage me save. Har API call me `X-Session-ID` header me jaata hai.

### Concept 76: CartStore — Signals
```typescript
private readonly _cartItems = signal<CartItem[]>([]);
private readonly _sidebarOpen = signal(false);
private readonly _wishlistIds = signal<Set<string>>(new Set());

readonly cartCount = computed(() => this._cartItems().reduce((s, i) => s + i.qty, 0));
readonly cartSubtotal = computed(() => this._cartItems().reduce((s, i) => s + i.lineTotal, 0));
readonly isWishlisted = (productId: string) => computed(() => this._wishlistIds().has(productId));
```
Multiple signals manage karte hain:
- `_cartItems` — Cart me kya kya hai
- `_sidebarOpen` — Cart sidebar khula hai kya
- `_wishlistIds` — Wishlisted product IDs ka Set
- `cartCount` — Total items (computed)
- `cartSubtotal` — Total price (computed)
- `isWishlisted()` — Specific product wishlisted hai kya (factory function returning computed)

### Concept 77: CartStore — Auto-Merge on Login
```typescript
toObservable(this.auth.isLoggedIn).pipe(
  startWith(false),
  pairwise(),
  filter(([prev, curr]) => !prev && curr),  // false → true (just logged in!)
  switchMap(() => this.http.post('/cart/merge', { guestSessionId: this.sessionId })),
).subscribe({
  next: (res) => this.applyCart(res.data),
});
```
**Critical flow**: Guest ne cart me items daale → Login kiya → Guest cart automatically user account me merge ho jaata hai. `pairwise()` previous aur current value deta hai — false→true transition detect karta hai.

### Concept 78: CartStore — Cart Actions
```typescript
addItem(productId, qty)    → POST /cart/items { productId, qty }
updateQty(productId, qty)  → PUT /cart/items/:productId { qty }
removeItem(productId)      → DELETE /cart/items/:productId
clearCart()                → DELETE /cart
loadCart()                 → GET /cart
```
Har action server pe sync hota hai. Response me updated cart aata hai → signal update → UI re-render.

### Concept 79: CartStore — Sidebar Control
```typescript
openSidebar(): void { this._sidebarOpen.set(true); }
closeSidebar(): void { this._sidebarOpen.set(false); }
toggleSidebar(): void { this._sidebarOpen.update((v) => !v); }
```
Cart sidebar (right side slide-in panel) ka state CartStore manage karta hai. `addItem()` ke baad automatically `openSidebar()` call hota hai — user ko feedback mile ki item add hua.

### Concept 80: CartStore — Wishlist
```typescript
toggleWishlist(productId): void {
  this.http.post(`/wishlist/${productId}`, {}, { headers: this.headers() })
    .subscribe({ next: (res) => this.applyWishlist(res.data) });
}
```
Wishlist toggle API ek hi endpoint hai — agar product wishlist me hai to remove, nahi hai to add. Backend response me updated wishlist aata hai.

### Concept 81: PaymentStore — Full Payment Flow
```typescript
async pay(address: AddressForm, walletAmount = 0): Promise<boolean> {
  // Step 1: Create Razorpay order (backend)
  const orderRes = await this.http.post('/payments/orders', { address, walletAmount }).toPromise();

  // Full wallet payment — no Razorpay needed
  if (orderRes.data.paidViaWallet) { /* mark success, return */ }

  // Step 2: Open Razorpay checkout modal (frontend)
  const rzpResponse = await this.razorpay.openCheckout({
    orderId: order.razorpayOrderId,
    amountPaise: order.amountPaise,
    keyId: order.keyId,
  });

  // Step 3: Verify payment signature (backend)
  await this.http.post('/payments/verify', { ...rzpResponse }).toPromise();

  return true;
}
```
3-step flow: Backend order create → Razorpay modal → Backend verify.

### Concept 82: PaymentStore — Wallet Support
```typescript
// Checkout me
if (order.paidViaWallet) {
  // Full amount wallet se pay hua — Razorpay modal nahi khulega
  this._paymentSuccess.set(true);
  return true;
}
```
User wallet balance se partial/full payment kar sakta hai. Agar poora amount wallet se cover ho jaaye → Razorpay skip. Otherwise remaining amount Razorpay se.

### Concept 83: PaymentStore — Error Handling
```typescript
} catch (err: any) {
  this._paymentError.set(err?.error?.message || err?.message || 'Payment failed');
  return false;
}
```
Payment fail ho to error signal set hota hai → UI error message dikhata hai. Razorpay modal dismiss kare (user cancelled) → "Payment cancelled" error.

### Concept 84: OrderStore — Signal-Based
```typescript
private readonly _orders = signal<OrderView[]>([]);
private readonly _currentOrder = signal<OrderView | null>(null);
private readonly _tracking = signal<TrackingInfo | null>(null);
private readonly _loading = signal(false);
private readonly _meta = signal<{ page: number; totalPages: number } | null>(null);
```
Order data signals me stored hai:
- `_orders` — Order list (paginated)
- `_currentOrder` — Single order detail
- `_tracking` — Shiprocket tracking info
- `_meta` — Pagination metadata

### Concept 85: OrderStore — Tracking
```typescript
loadTracking(orderId: string): void {
  this.http.get<ApiResponse<TrackingInfo>>(`/orders/user/${orderId}/tracking`)
    .subscribe({ next: (res) => this._tracking.set(res.data) });
}
```
TrackingInfo me Shiprocket data hota hai:
- Current status (shipped, in_transit, delivered)
- Tracking URL
- Estimated delivery date
- Activities (date, status, location)

### Concept 86: ReviewStore — Comprehensive
```
Public:        getProductReviews(), getRatingSummary(), getProductQA()
Authenticated: submitReview(), deleteReview(), voteHelpful(), reportReview()
Q&A:           submitQuestion(), submitAnswer()
Admin:         getModeration(), approveReview(), rejectReview(), replyToReview(), pinReview()
```
Reviews ka complete lifecycle handle karta hai — submit, moderate, approve, reply, report.

### Concept 87: SearchStore — Full-Text Search
```typescript
search(q: string, filters?: SearchFilters, sort?: SortOption, page = 1): void {
  let url = `/search?q=${encodeURIComponent(q)}&page=${page}&limit=20&sort=${this._sort()}`;
  // Add filters to URL...
  this.http.get<SearchResponse>(url).subscribe({
    next: (res) => {
      this._results.set(res.data);
      this._facets.set(res.facets);
      this._meta.set(res.meta);
    },
  });
}
```
Search response me 3 cheezein aati hain:
1. `data` — Matching products
2. `facets` — Filter options (categories with counts, price range, tags)
3. `meta` — Pagination info

### Concept 88: SearchStore — Autocomplete with Debounce
```typescript
autocomplete(q: string): void {
  if (this.autocompleteTimer) clearTimeout(this.autocompleteTimer);
  if (!q || q.trim().length < 2) { this._suggestions.set([]); return; }

  this.autocompleteTimer = setTimeout(() => {
    this.http.get(`/search/autocomplete?q=${q}&limit=8`).subscribe({ ... });
  }, 300);  // 300ms debounce
}
```
**Debounce** — User type kare "gre" → 300ms wait karo → agar user "green" type kar de to sirf "green" ki request jaaye, "gre" ki nahi. API calls save hoti hain. `clearTimeout` previous timer cancel karta hai.

### Concept 89: SearchStore — Faceted Search
```typescript
export interface SearchFacets {
  categories: { _id: string; name: string; slug: string; count: number }[];
  priceRange: { min: number; max: number };
  tags: { tag: string; count: number }[];
}
```
**Facets** = search results ke based pe filter options. "Herbal (15)" — 15 products "Herbal" category me match hue. Dynamic hain — search query change hone pe facets bhi change hote hain.

### Concept 90: SearchStore — Filter Management
```typescript
applyFilter(key, value): void {
  this._filters.update((f) => ({ ...f, [key]: value }));
  this.search(this._query(), undefined, undefined, 1); // Re-search from page 1
}

removeFilter(key): void {
  this._filters.update((f) => { const next = { ...f }; delete next[key]; return next; });
  this.search(this._query(), undefined, undefined, 1);
}

clearAllFilters(): void {
  this._filters.set({});
  this.search(this._query(), undefined, undefined, 1);
}
```
Filter add/remove hone pe automatically search re-run hota hai page 1 se.

### Concept 91: CatalogService — Public vs Admin APIs
```typescript
private readonly adminUrl  = `${environment.apiUrl}/admin`;
private readonly publicUrl = `${environment.apiUrl}/catalog`;

// Public (no auth needed)
getProductsPublic(params): Observable<PaginatedResponse<Product>>
getCategoriesPublic(): Observable<ApiResponse<Category[]>>

// Admin (auth + admin role needed)
getProducts(params): Observable<PaginatedResponse<Product>>
createProduct(payload): Observable<ApiResponse<Product>>
updateProduct(id, payload): Observable<ApiResponse<Product>>
deleteProduct(id): Observable<void>
```
Same service, 2 sets of methods. Public methods `/catalog/` prefix, admin methods `/admin/` prefix. Public methods me product ka `stock`, `status` fields nahi aate (security).

### Concept 92: CatalogService — Image Upload
```typescript
uploadImage(file: File): Observable<ApiResponse<{ url: string }>> {
  const form = new FormData();
  form.append('image', file);
  return this.http.post('/admin/uploads', form);
}
```
`FormData` multipart form data hai — file upload ke liye standard. Server file save karke URL return karta hai.

### Concept 93: CatalogService — Generic Params Pattern
```typescript
getProducts(params: ProductListParams = {}): Observable<...> {
  let httpParams = new HttpParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') httpParams = httpParams.set(k, String(v));
  }
  return this.http.get('/admin/products', { params: httpParams });
}
```
`HttpParams` URL query parameters build karta hai. `undefined` aur empty values skip hote hain. `ProductListParams` type me `page`, `limit`, `search`, `categoryId`, `status`, etc. optional fields hain.

### Concept 94: AdminService — Dashboard
```typescript
getDashboardStats(): Observable<DashboardResponse> {
  return this.http.get('/admin/dashboard/stats');
}

// Response:
interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  customerUsers: number;
  todaySignups: number;
  weekSignups: number;
}
```
Admin dashboard pe KPI cards dikhate hain — total users, today signups, etc.

### Concept 95: AdminService — User Management
```typescript
getUsers(params)         → Paginated user list (search, filter by role)
createUser(payload)      → New user create (admin by phone)
updateUser(id, payload)  → User details update
deleteUser(id)           → User delete
banUser(id, reason)      → User ban (with reason)
unbanUser(id)            → User unban
```

### Concept 96: AdminService — Session Management
```typescript
getUserSessions(userId)     → List all active sessions for a user
revokeSession(sessionId)    → Revoke single session (log out one device)
revokeAllSessions(userId)   → Force-logout ALL devices
```
Admin kisi bhi user ke active sessions (devices) dekh sakta hai aur individual ya saari sessions revoke kar sakta hai.

### Concept 97: FirebaseService — OTP Flow
```typescript
// 1. Initialize reCAPTCHA (invisible — bot detection)
initRecaptcha('recaptcha-container');

// 2. Send OTP to phone
await sendOtp('9876543210');
// → Firebase sends SMS to +919876543210

// 3. User enters OTP, verify
const idToken = await verifyOtp('123456');
// → Firebase returns ID token (JWT)

// 4. Cleanup on component destroy
cleanup();
```

### Concept 98: FirebaseService — reCAPTCHA
```typescript
this.recaptchaVerifier = new RecaptchaVerifier(this.auth, containerId, {
  size: 'invisible',    // User ko dikhta nahi
  callback: () => { },  // Automatically solve
  'expired-callback': () => { this.initRecaptcha(containerId); },
});
```
**Invisible reCAPTCHA** — Bot detection karta hai bina user interaction ke. Expire hone pe re-initialize. OTP bhejne ke liye mandatory (Firebase requirement).

### Concept 99: FirebaseService — Error Mapping
```typescript
switch (error.code) {
  case 'auth/invalid-phone-number': throw new Error('Invalid phone number format');
  case 'auth/too-many-requests': throw new Error('Too many attempts. Please try again later.');
  case 'auth/invalid-verification-code': throw new Error('Invalid OTP. Please check and try again.');
  case 'auth/code-expired': throw new Error('OTP expired. Please request a new one.');
}
```
Firebase ke technical error codes ko user-friendly messages me convert karta hai.

### Concept 100: RazorpayService — Script Loading
```typescript
private loadScript(): Promise<void> {
  if (this.scriptLoaded) return Promise.resolve(); // Already loaded
  if (this.loadPromise) return this.loadPromise;   // Loading in progress

  this.loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => { this.scriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Razorpay script'));
    document.head.appendChild(script);
  });
  return this.loadPromise;
}
```
Razorpay checkout.js **dynamically load** hota hai — page load pe nahi (save bandwidth). Pehli payment attempt pe load, uske baad cached. Double loading prevented (`scriptLoaded` flag + `loadPromise` cache).

### Concept 101: RazorpayService — Checkout Modal
```typescript
async openCheckout(options): Promise<RazorpayResponse> {
  await this.loadScript();
  return new Promise<RazorpayResponse>((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: options.keyId,
      amount: options.amountPaise,
      currency: options.currency,
      order_id: options.orderId,
      name: 'Rajhans Tea',
      theme: { color: '#CC5803' },
      handler: (response) => resolve(response),    // Payment success
      modal: { ondismiss: () => reject(new Error('Cancelled')) }, // User dismissed
    });
    rzp.open();
  });
}
```
Razorpay checkout modal (popup) kholta hai. `handler` — payment success pe call hota hai. `ondismiss` — user close button dabaye. Promise se `async/await` me use kar sakte hain.

### Concept 102: LoadingService
```typescript
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  readonly loading = signal(false);

  start(): void { this.activeRequests++; this.loading.set(true); }

  stop(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      setTimeout(() => {
        if (this.activeRequests === 0) this.loading.set(false);
      }, 200);
    }
  }
}
```
**Reference counting** — Multiple HTTP requests simultaneously chal sakti hain. Counter track karta hai kitni active hain. Jab counter 0 ho tab loading bar hide. **200ms delay** — fast requests pe loading bar flicker na kare.

### Concept 103: ToastService
```typescript
show(message, type = 'info', duration = 3000): void {
  const toast = { id: this.nextId++, message, type, duration };
  this.toasts.update((list) => {
    const updated = [...list, toast];
    return updated.slice(-3);  // MAX 3 visible at a time
  });
  if (duration > 0) setTimeout(() => this.dismiss(id), duration);
}

success(msg, dur = 3000): void { this.show(msg, 'success', dur); }
error(msg, dur = 5000): void { this.show(msg, 'error', dur); }
warning(msg, dur = 4000): void { this.show(msg, 'warning', dur); }
info(msg, dur = 3000): void { this.show(msg, 'info', dur); }
```
4 types: success (green), error (red, longer duration), warning (amber), info (blue). Max 3 toasts visible — purane remove ho jaate hain. Auto-dismiss after duration.

### Concept 104: ThemeService
```typescript
readonly theme = signal<Theme>(this.getInitialTheme());

constructor() {
  effect(() => {
    const t = this.theme();
    document.documentElement.setAttribute('data-theme', t); // CSS switch
    localStorage.setItem('theme', t);                        // Persist
  });
}

toggle(): void { this.theme.update((t) => (t === 'light' ? 'dark' : 'light')); }

private getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme') as Theme | null;
  if (saved) return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
```
**3 priority levels**:
1. User ne manually toggle kiya (localStorage me saved)
2. OS preference (`prefers-color-scheme: dark`)
3. Default: light

`data-theme` attribute HTML root element pe set hota hai → CSS custom properties switch hoti hain → poora UI theme change.

---

## D. GUARDS & INTERCEPTORS

### Concept 105: Functional Guards
```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) return true;

  router.navigate(['/auth/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
```
**Functional guard** — ek function hai, class nahi. `inject()` se dependencies lete hain. `CanActivateFn` type ensure karta hai ki signature sahi hai.

### Concept 106: authGuard
Protected routes: `/dashboard`, `/checkout`, `/orders`, `/wallet`
```
User visits /checkout
  → authGuard checks: isLoggedIn()?
    → YES: Allow (return true)
    → NO:  Redirect to /auth/login?returnUrl=/checkout (return false)
```

### Concept 107: guestGuard
```typescript
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isLoggedIn()) return true;
  router.navigate(['/']);
  return false;
};
```
Login page pe guard — agar user already logged in hai to login page pe jaane ki zarurat nahi, home pe redirect. Prevents logged-in user from seeing login form.

### Concept 108: adminGuard
```typescript
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAdmin()) return true;
  router.navigate(['/']);
  return false;
};
```
`isAdmin()` check karta hai `user.role === 'admin'`. Non-admin user `/admin` URL directly type kare bhi to home pe redirect ho jaayega.

### Concept 109: Auth Interceptor — Token Attachment
```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = authService.getAccessToken();

  const isAuthEndpoint = req.url.includes('/auth/') &&
    !req.url.includes('/auth/me') && !req.url.includes('/auth/logout-all');

  if (token && !isAuthEndpoint) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    });
  }
  return next(req);
};
```
Har outgoing HTTP request me JWT token attach hota hai. **Exceptions**: Auth endpoints (verify-token, refresh-token) pe token nahi bhejte (kyunki user tab logged in nahi). `/auth/me` aur `/auth/logout-all` pe token chahiye (ye logged-in user ke endpoints hain).

### Concept 110: Auth Interceptor — 401 Refresh Flow
```typescript
catchError((error: HttpErrorResponse) => {
  if (error.status === 401 && !req.url.includes('/auth/refresh-token')) {
    return authService.refreshToken().pipe(
      switchMap((res) => {
        const newReq = req.clone({
          setHeaders: { Authorization: `Bearer ${res.data.tokens.accessToken}` },
        });
        return next(newReq);  // RETRY original request with new token
      }),
      catchError(() => {
        authService.logout();  // Refresh also failed → full logout
        return throwError(() => error);
      }),
    );
  }
  return throwError(() => error);
});
```
**Token refresh flow**:
1. Request fails with 401 (token expired)
2. Interceptor catches → calls refreshToken()
3. Naya access token milta hai
4. Original request RETRY hoti hai naye token ke saath
5. Agar refresh bhi fail ho → user logged out

User ko pata bhi nahi chalta — seamless experience.

### Concept 111: Auth Interceptor — Ban Detection
```typescript
if (error.status === 403 && error.error?.message?.includes('suspended')) {
  authService.logoutBanned();
  return throwError(() => error);
}
```
Agar admin ne user ko ban kiya hai, backend 403 return karta hai with "suspended" message. Interceptor detect karta hai → immediately logout + "Account suspended" message show.

### Concept 112: Loading Interceptor
```typescript
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  const skipUrls = ['/autocomplete', '/unread-count', '/realtime', '/health'];
  const shouldSkip = skipUrls.some((url) => req.url.includes(url));

  if (shouldSkip) return next(req);

  loadingService.start();
  return next(req).pipe(finalize(() => loadingService.stop()));
};
```
Har HTTP request pe loading bar show. **Skip URLs** — lightweight polling requests pe loading bar nahi dikhta (annoying lagta baar baar). `finalize()` — success ya error, dono cases me loading stop.

### Concept 113: Interceptor Order
```typescript
provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor]))
```
Order matters! `authInterceptor` pehle — token attach karo. `loadingInterceptor` baad me — loading state manage karo. Request chain:
```
Request → authInterceptor (add token) → loadingInterceptor (start loading)
  → HTTP call → loadingInterceptor (stop loading) → authInterceptor (handle 401)
```

### Concept 114: req.clone()
```typescript
req = req.clone({
  setHeaders: { Authorization: `Bearer ${token}` },
  withCredentials: true,
});
```
HTTP request objects Angular me **immutable** hain — modify nahi kar sakte. `clone()` naya request banata hai with modifications. Original request unchanged rehti hai.

### Concept 115: withCredentials
```typescript
{ withCredentials: true }
```
Cookies har request ke saath bhejo. Cross-origin requests me browsers by default cookies nahi bhejte. `withCredentials: true` force karta hai cookie bhejne ko. Refresh token cookie me ho sakta hai.

---

## E. LAYOUTS & SHELL

### Concept 116: MainLayoutComponent
```typescript
@Component({
  imports: [RouterOutlet, RouterLink, HeaderComponent, CartSidebarComponent],
  templateUrl: './main-layout.html',
})
export class MainLayoutComponent {}
```
Structure:
```html
<div class="layout">
  <app-header />                    <!-- Sticky header with nav, search, cart -->
  <main class="content">
    <router-outlet />               <!-- Active page renders here -->
  </main>
  <!-- Trust bar + Footer -->
</div>
<app-cart-sidebar />                <!-- Slide-in cart panel (always present) -->
```
Sab public pages (home, products, checkout) is layout ke andar render hote hain. Header, footer, cart sidebar hamesha available.

### Concept 117: HeaderComponent — Complexity
HeaderComponent project ka **sabse complex component** hai (186 lines). Handle karta hai:
1. **Transparent/Solid transition** (homepage pe scroll-based)
2. **Hide on scroll down** (scroll > 160px + down direction)
3. **Mega menu** (category grid + product previews)
4. **Search bar** (Ctrl+K shortcut, autocomplete)
5. **Mobile menu** (hamburger toggle)
6. **Cart badge** (item count)
7. **Auth state** (login link vs user profile)
8. **Admin link** (sirf admins ko dikhta)

### Concept 118: Header — Transparent Mode
```typescript
readonly isTransparent = computed(() =>
  this.isHomePage() && !this.scrolled() && !this.megaOpen() && !this.searchOpen()
);
```
Header transparent tab hota hai jab:
- Homepage pe ho ✓
- Scroll < 100px (hero visible) ✓
- Mega menu closed ✓
- Search bar closed ✓

Ye **computed signal** hai — koi bhi condition change hone pe automatically recalculate.

### Concept 119: Header — Scroll Behavior
```typescript
@HostListener('window:scroll')
onScroll(): void {
  const y = window.scrollY;
  this.scrolled.set(y > 100);                    // Solid header after 100px
  if (y > 160 && y > this.lastY && !this.megaOpen()) {
    this.navHidden.set(true);                     // Hide on scroll DOWN
  } else {
    this.navHidden.set(false);                    // Show on scroll UP
  }
  this.lastY = y;
}
```
`this.lastY` previous scroll position track karta hai. `y > this.lastY` = scrolling DOWN. `y < this.lastY` = scrolling UP. Nav hide/show accordingly.

### Concept 120: Header — Mega Menu
```
┌────────────────────────────────────────────┐
│  Categories          │  Products (8 cards)  │
│  ├── All             │  ┌──────┐ ┌──────┐  │
│  ├── Black Tea       │  │  ☕   │ │  ☕   │  │
│  ├── Green Tea       │  │ Assam │ │Darj.  │  │
│  ├── Herbal         │  └──────┘ └──────┘  │
│  └── Premium        │  ┌──────┐ ┌──────┐  │
│                      │  │  ☕   │ │  ☕   │  │
│                      │  └──────┘ └──────┘  │
└────────────────────────────────────────────┘
```
Category hover pe us category ke products dikhte hain. Products pehle cached list se filter hote hain, cache miss pe API call.

### Concept 121: Header — Keyboard Shortcuts
```typescript
@HostListener('window:keydown', ['$event'])
onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { this.closeMega(); this.closeSearch(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); this.toggleSearch(); }
}
```
- `Escape` — Sab close karo (mega menu, search bar, mobile menu)
- `Ctrl+K` / `Cmd+K` — Search bar toggle (developer-friendly shortcut)
- `e.preventDefault()` — Browser default behavior block karo (Ctrl+K normally address bar focus karta hai)

### Concept 122: Header — Scroll Lock
```typescript
private lockScroll(lock: boolean): void {
  document.body.style.overflow = lock ? 'hidden' : '';
}
```
Mega menu ya mobile menu khulne pe background scroll lock hota hai. `overflow: hidden` body pe — user background content scroll nahi kar sakta.

### Concept 123: AdminLayoutComponent
```typescript
navSections: NavSection[] = [
  { label: 'MAIN', items: [{ label: 'Dashboard', route: '/admin' }] },
  { label: 'CATALOG', items: [
    { label: 'Products', route: '/admin/products' },
    { label: 'Categories', route: '/admin/categories' },
    { label: 'Collections', route: '/admin/collections' },
  ]},
  { label: 'ORDERS & FULFILLMENT', items: [...] },
  { label: 'FINANCE', items: [...] },
  { label: 'CONTENT', items: [...] },
  { label: 'PEOPLE', items: [...] },
  { label: 'SYSTEM', items: [...] },
];
```
7 navigation sections with collapsible behavior. Collapsed state localStorage me persist hota hai — page refresh pe same state.

### Concept 124: Admin Layout — User Initials
```typescript
getInitials(): string {
  const user = this.authService.user();
  if (user?.firstName) {
    return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
  }
  return user?.phone?.slice(-2) || '?';
}
```
Sidebar me user avatar initials se dikhata hai: "RK" (Rajhans Kumar). Name nahi hai to phone ke last 2 digits. Kuch bhi nahi to "?".

---

## F. SHARED COMPONENTS

### Concept 125: ProductCardComponent
```typescript
@Input({ required: true }) product!: Product;
@Input() layout: 'vertical' | 'horizontal' = 'vertical';
@Input() wishlisted = false;
@Output() addToCart = new EventEmitter<string>();
@Output() toggleWishlist = new EventEmitter<string>();
```
Reusable product card — products page, home page, mega menu, wishlist, recommendations sab me use hota hai.
- **vertical** layout: Image top, info bottom (grid view)
- **horizontal** layout: Image left, info right (list view)
- `event.stopPropagation()` — Add to cart click karne pe card ka routerLink trigger na ho

### Concept 126: ProductRailComponent
Horizontal scrollable product carousel. Product detail page pe "You may also like" section me use hota hai.

### Concept 127: LoadingBarComponent
```typescript
readonly loadingService = inject(LoadingService);
// Template: @if (loadingService.loading()) { <div class="bar"></div> }
```
Top of page pe thin progress bar — HTTP requests chalte waqt visible. NProgress-style animation.

### Concept 128: ToastContainerComponent
```typescript
readonly toastService = inject(ToastService);
// Template loops over toastService.toasts() signal
```
Fixed position (bottom-right). Max 3 toasts visible. Auto-dismiss. 4 visual styles (success/error/warning/info).

### Concept 129: CartSidebarComponent
```typescript
readonly cart = inject(CartStore);
// Template: slide-in panel from right side
```
Cart sidebar MainLayoutComponent me hamesha present hai (conditionally visible based on `cart.sidebarOpen()`). Items list, quantity adjust, remove, subtotal, checkout button.

---

## G. FEATURE: HOME PAGE

### Concept 130: HomeComponent — Structure
```html
<section class="hero">...</section>                  <!-- Full-viewport hero -->
<app-featured-products [products]="spotlightProducts()" />  <!-- Product grid -->
<app-big-statement />                                 <!-- Brand story -->
<app-split-visual />                                  <!-- Image + text split -->
<app-explore-cta />                                   <!-- Call-to-action -->
```
5 sections. Har section alag component hai (separation of concerns).

### Concept 131: Hero Section — GSAP Animation
```typescript
ngAfterViewInit(): void {
  this.ctx = gsap.context(() => {
    const tl = gsap.timeline({ delay: 0.2 });
    tl.from('.hero__bg', { scale: 1.1, opacity: 0, duration: 1.2, ease: 'expo.out' });
    tl.from('.hero__line', { y: 40, opacity: 0, stagger: 0.12 }, '-=0.6');
    tl.from('.hero__sub', { y: 20, opacity: 0 }, '-=0.3');
    tl.from('.hero__cta', { y: 15, opacity: 0 }, '-=0.3');
  }, root);
}
```
**Timeline animation**:
1. Background image scale in + fade in (1.2s)
2. Text lines stagger in from below (0.12s gap between each)
3. Subtitle fade in
4. CTA button fade in

`'-=0.6'` — Previous animation end hone se 0.6s PEHLE start karo (overlap). Cinematic feel.

### Concept 132: GSAP Context & Cleanup
```typescript
private ctx: gsap.Context | null = null;

ngAfterViewInit(): void {
  this.ctx = gsap.context(() => { /* animations */ }, root);
}

ngOnDestroy(): void {
  this.ctx?.revert(); // All animations cleanup — NO MEMORY LEAK
}
```
`gsap.context(fn, scope)` — Animations ko component ke DOM se scope karta hai. `revert()` — Component destroy hone pe saare GSAP animations, ScrollTriggers, timelines automatically clean up. **Memory leak prevention** essential hai SPAs me.

### Concept 133: Parallax on Scroll
```typescript
gsap.to('.hero__bg', {
  yPercent: 15,
  ease: 'none',
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
});
```
Hero image scroll ke saath slowly neeche move hoti hai (15% translate). `scrub: true` — animation scroll position ke saath linked hai (scroll fast → animation fast). Depth effect create karta hai.

### Concept 134: Product Spotlight Slider
```typescript
readonly spotlightProducts = signal<Product[]>([]);
readonly activeSlide = signal(0);

prevSlide(): void {
  const len = this.spotlightProducts().length;
  this.activeSlide.set((this.activeSlide() - 1 + len) % len); // Circular
}
nextSlide(): void {
  this.activeSlide.set((this.activeSlide() + 1) % len); // Circular
}
```
Dot pagination with circular navigation — last se next pe first pe aa jaao, first se prev pe last.

### Concept 135: Sub-Components
- **FeaturedProductsComponent** — Product grid with "Shop Now" buttons
- **BigStatementComponent** — Large text block with brand story ("Since 1952...")
- **SplitVisualComponent** — 50/50 split layout (image left, text right)
- **ExploreCtaComponent** — "Explore Our Collection" call-to-action with background

---

## H. FEATURE: AUTHENTICATION

### Concept 136: LoginComponent — 2-Step Flow
```
Step 1: PHONE                          Step 2: OTP
┌──────────────────────┐              ┌──────────────────────┐
│  Enter Phone Number  │              │  Enter OTP           │
│  ┌──────────────────┐│              │  ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐│
│  │ 9876543210       ││  ─Send OTP─> │  │1│ │2│ │3│ │4│ │5│ │6││
│  └──────────────────┘│              │  └─┘ └─┘ └─┘ └─┘ └─┘ └─┘│
│  [Send OTP]          │              │  [Verify]    [Resend]│
└──────────────────────┘              └──────────────────────┘
```

### Concept 137: Phone Input Handling
```typescript
onPhoneInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const cleaned = input.value.replace(/\D/g, '').slice(0, 10);
  this.phone.set(cleaned);
  input.value = cleaned;
}
```
Sirf digits allow — `/\D/g` se non-digits remove. Max 10 characters. Real-time cleaning.

### Concept 138: OTP Input — 6 Separate Boxes
```typescript
otpDigits = signal<string[]>(['', '', '', '', '', '']);

onOtpDigitInput(event, index): void {
  const digits = [...this.otpDigits()];
  digits[index] = value.slice(-1);     // Sirf last digit (agar multiple type ho)
  this.otpDigits.set(digits);

  if (value && index < 5) this.focusOtpInput(index + 1); // Auto-advance

  // Auto-verify when all 6 digits
  if (digits.every(d => d) && digits.join('').length === 6) {
    setTimeout(() => this.onVerifyOtp(), 150);
  }
}
```
- 6 individual input boxes
- Auto-focus next box after digit entry
- **Backspace** — Empty box pe press karo to previous box focus
- **Paste** — Full OTP paste karo, sab boxes fill, auto-verify
- **Auto-verify** — 6th digit dalte hi automatic verification start

### Concept 139: OTP Paste Support
```typescript
onOtpPaste(event: ClipboardEvent): void {
  event.preventDefault();
  const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6);
  const digits = pasted.split('').concat(Array(6).fill('')).slice(0, 6);
  this.otpDigits.set(digits);
  if (pasted.length === 6) setTimeout(() => this.onVerifyOtp(), 150);
}
```
SMS se OTP copy karke paste karo — sab boxes fill aur auto-verify. Great mobile UX.

### Concept 140: Resend Cooldown Timer
```typescript
private startCooldown(seconds: number): void {
  this.resendCooldown.set(seconds);  // 60 seconds
  this.cooldownInterval = setInterval(() => {
    if (this.resendCooldown() <= 1) this.clearCooldown();
    else this.resendCooldown.update(c => c - 1);
  }, 1000);
}
```
OTP bhejne ke baad 60 seconds ka cooldown — "Resend OTP" button disabled. Countdown timer visible. OTP abuse prevention.

### Concept 141: Login → Redirect
```typescript
const returnUrl = this.route.snapshot.queryParams['returnUrl'];
if (returnUrl) {
  this.router.navigateByUrl(returnUrl);    // Back to original page
} else {
  const redirectTo = res.data.user.role === 'admin' ? '/dashboard' : '/';
  this.router.navigate([redirectTo]);       // Default redirect
}
```
Admin login → dashboard. Customer login → home. ReturnUrl available → original page.

### Concept 142: Banned Account Detection
```typescript
ngOnInit(): void {
  if (this.route.snapshot.queryParamMap.get('reason') === 'banned') {
    this.error.set('Your account has been suspended. Contact support for assistance.');
  }
}
```
Interceptor banned user ko `/auth/login?reason=banned` pe redirect karta hai. Login page ye query param check karke appropriate message dikhata hai.

### Concept 143: Animated Particles
```typescript
particles = [0, 1, 2, 3, 4, 5, 6, 7];
particleX(i: number): string { return (10 + i * 12) + '%'; }
particleSize(i: number): string { return (3 + (i % 3) * 2) + 'px'; }
```
Login page background me floating particles (CSS animation). 8 particles at different positions and sizes. Luxury aesthetic.

---

## I. FEATURE: STORE PAGES

### Concept 144: ProductDetailComponent
Product page me ye sab hai:
- **Image gallery** — Multiple images, click to select
- **Product info** — Name, price, description, attributes
- **Quantity selector** — Increment/decrement (max = stock)
- **Add to Cart / Buy Now** buttons
- **Rating summary** — Star rating distribution
- **Reviews section** (nested component)
- **Share** — WhatsApp share, copy link
- **SEO** — Dynamic title, meta tags, Open Graph

### Concept 145: Product SEO (Meta Tags)
```typescript
this.titleService.setTitle(`${res.data.name} — Rajhans Tea`);
this.meta.updateTag({ name: 'description', content: res.data.shortDescription });
this.meta.updateTag({ property: 'og:title', content: res.data.name });
this.meta.updateTag({ property: 'og:image', content: res.data.images[0] });
```
Har product page ka apna title aur meta tags hain. Social media pe share karne pe preview card dikhta hai (og:title, og:image).

### Concept 146: Buy Now vs Add to Cart
```typescript
addToCart(): void {
  this.cartStore.addItem(this.product()._id, this.quantity());
  // → Cart sidebar opens, user continues shopping
}

buyNow(): void {
  this.cartStore.addItem(this.product()._id, this.quantity());
  this.router.navigate(['/checkout']);
  // → Directly to checkout
}
```
"Add to Cart" — cart me daalo, shopping continue. "Buy Now" — cart me daalo + directly checkout pe le jaao.

### Concept 147: CheckoutPageComponent — 3-Step Flow
```
Step 1: CART              Step 2: ADDRESS           Step 3: SUMMARY
┌────────────────┐       ┌────────────────┐       ┌────────────────┐
│ Review items   │  →    │ Shipping info  │  →    │ Order summary  │
│ Adjust qty     │       │ Name, phone    │       │ Pricing        │
│ Remove items   │       │ Address        │       │ Wallet option  │
│                │       │ Pincode        │       │ [Place Order]  │
└────────────────┘       └────────────────┘       └────────────────┘
```
type Step = 'cart' | 'address' | 'summary'

### Concept 148: Checkout — Cart Merge Wait
```typescript
ngOnInit(): void {
  if (this.cart.merging()) {
    const interval = setInterval(() => {
      if (!this.cart.merging()) {
        clearInterval(interval);
        this.cart.loadCart();
      }
    }, 200);
  }
}
```
Agar user abhi login hua aur checkout pe aaya, cart merge in-progress ho sakta hai. Wait karo merge complete hone ka, phir cart load karo. Edge case handling.

### Concept 149: Checkout — Wallet Deduction
```typescript
walletDeduction(): number {
  const total = this.summary()?.total ?? 0;
  return Math.min(this.walletBalance(), total);
}
remainingAmount(): number {
  return Math.max(0, total - this.walletDeduction());
}
```
Wallet balance `₹500` hai, order `₹800` hai → wallet se `₹500` deduct, Razorpay se `₹300` pay. Order `₹300` hai → full wallet payment, Razorpay skip.

### Concept 150: Checkout — Place Order Flow
```typescript
async placeOrder(): Promise<void> {
  if (!this.auth.isLoggedIn()) {
    this.router.navigate(['/auth/login']);  // Guest → must login first
    return;
  }
  const success = await this.payment.pay(this.address, walletAmount);
  if (success) {
    this.orderPlaced.set(true);
    setTimeout(() => this.router.navigate(['/orders']), 2000); // Success → orders page
  }
}
```
Success flow: Loading → Razorpay modal → Success animation → 2 second wait → Redirect to orders.

### Concept 151: DashboardComponent
```typescript
getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
```
User dashboard — time-based greeting, stats cards (different for admin/customer), quick action buttons. Admin sees: Total Orders, Products, Customers, Revenue. Customer sees: My Orders, Wishlist, Addresses.

---

## J. FEATURE: ADMIN PANEL

### Concept 152: Admin Routes (11 Pages)
```
/admin                → AdminDashboardComponent (KPI stats)
/admin/users          → UserListComponent (search, create, ban/unban)
/admin/products       → ProductListComponent (CRUD, image upload)
/admin/products/preview/:id → ProductPreviewComponent (full-screen preview)
/admin/categories     → CategoryListComponent (CRUD)
/admin/collections    → CollectionListComponent (CRUD)
/admin/orders         → AdminOrderListComponent (status tracking, ship)
/admin/payments       → AdminPaymentListComponent (transaction history)
/admin/inventory      → InventoryDashboardComponent (stock management)
/admin/warehouses     → WarehouseListComponent (location management)
/admin/settings       → AdminSettingsComponent (store configuration)
/admin/cms            → CmsManagementComponent (pages, blog)
```

### Concept 153: Admin Pattern — List Page
Typical admin list page ka pattern:
```typescript
// State
items = signal<Item[]>([]);
loading = signal(false);
meta = signal<PaginationMeta | null>(null);
searchTerm = '';
selectedRole = '';

// Load
loadItems(page = 1): void {
  this.loading.set(true);
  this.service.getItems({ page, search: this.searchTerm, ... }).subscribe({
    next: (res) => { this.items.set(res.data); this.meta.set(res.meta); },
    finally: () => this.loading.set(false),
  });
}

// Actions
create(payload): void { this.service.create(payload).subscribe({ next: () => this.loadItems() }); }
delete(id): void { this.service.delete(id).subscribe({ next: () => this.loadItems() }); }
```
Signal-based state. Load pe loading indicator. Action ke baad list refresh.

### Concept 154: User Sessions Management
Admin user ke sessions dekh sakta hai — kaunse devices pe logged in hai, IP address, browser, OS, last used time. Individual session revoke ya "Logout All Devices" option.

---

## K. DESIGN SYSTEM & THEMING

### Concept 155: Design Token Architecture
```
tokens.scss    → SCSS variables ($color-primary, $font-size-md, $space-lg)
theme.scss     → CSS custom properties (--color-bg-primary, --color-text-primary)
mixins.scss    → Reusable SCSS patterns (@mixin flex-center, @mixin card)
styles.scss    → Global base styles (reset, fonts, overrides)
```
**tokens.scss** = Source of truth for all design values. Components import tokens. Theme overrides CSS vars for light/dark.

### Concept 156: Color Palette
```scss
$color-primary: #4A0E2B;      // Deep maroon (brand identity)
$color-secondary: #C9A94E;    // Luxury gold (accents, CTAs)
$color-accent: #8B6F4E;       // Warm brown
$color-bg-primary: #FAF7F2;   // Warm off-white (cream)
$color-text-primary: #2A1520; // Dark maroon-brown
```
**Luxury tea brand** aesthetic — warm, earthy, gold accents. No bright colors. Inspired by premium French tea houses (Mariage Frères style).

### Concept 157: Typography System
```scss
$font-family: 'Inter', sans-serif;                    // Body text (clean, modern)
$font-family-display: 'Playfair Display', serif;      // Headings (luxury, classic)
$font-family-heading: 'Playfair Display', serif;      // Same as display
$font-family-nav: 'Inter', sans-serif;                // Navigation (uppercase)
```
**Dual font system**: Inter for readability (body, nav, forms), Playfair Display for elegance (headings, hero text, section titles).

### Concept 158: Spacing Scale
```scss
$space-xxs: 4px;    $space-xs: 8px;     $space-sm: 12px;
$space-md: 16px;    $space-lg: 24px;    $space-xl: 32px;
$space-xxl: 48px;   $space-xxxl: 64px;
```
Consistent spacing — kabhi arbitrary values nahi (15px, 37px). Hamesha scale se pick karo. Luxury brands me **generous spacing** (breathing room).

### Concept 159: Light/Dark Theme (CSS Custom Properties)
```scss
:root, [data-theme="light"] {
  --color-bg-primary: #FAF7F2;   // Warm cream
  --color-text-primary: #2A1520;  // Dark maroon
  --color-primary: #4A0E2B;       // Maroon accent
}

[data-theme="dark"] {
  --color-bg-primary: #1C1118;   // Deep dark
  --color-text-primary: #F2EDE6;  // Light text
  --color-primary: #D4B65E;       // Gold accent (instead of maroon)
}
```
Dark mode me maroon accent gold me change hota hai (better contrast). CSS custom properties (`--var`) runtime pe change hoti hain — JS se `data-theme` attribute switch karo aur poora UI theme change.

### Concept 160: Smooth Theme Transition
```scss
* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
```
Theme switch karne pe jarring "flash" nahi hota — smoothly 0.3s me transition. Sab elements pe apply.

### Concept 161: Reduced Motion Support
```scss
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
Users jinhone OS me "Reduce Motion" ON kiya hai (vestibular disorders, motion sickness) — unke liye saari animations band. **Accessibility** best practice.

### Concept 162: Key Mixins
```scss
@mixin respond-to($bp)     → Responsive breakpoints (@include respond-to(md) { ... })
@mixin flex-center          → display:flex + center both axes
@mixin flex-between         → display:flex + space-between
@mixin heading($size)       → Font size + weight + line-height + color
@mixin display-text($size)  → Playfair Display heading style
@mixin fluid-type($min,$max)→ clamp() based responsive font size
@mixin card                 → Background + border + shadow + radius
@mixin truncate($lines)     → Text truncation (1 line or multi-line)
@mixin section-padding      → Luxury generous section padding
@mixin eyebrow-text         → Small uppercase label (section labels)
@mixin mega-headline        → Large serif uppercase headline
@mixin ghost-button         → Outlined button (transparent bg)
@mixin luxury-nav-link      → Spaced uppercase nav text
@mixin ornamental-divider   → Gold line with diamond center
@mixin gold-accent-underline→ Gold underline after text
@mixin content-container    → Max-width centered container
@mixin editorial-grid       → Asymmetric 2-column grid
@mixin hover-lift           → Subtle translateY + shadow on hover
@mixin image-cover          → object-fit: cover full size
@mixin full-bleed           → Break out of container to full viewport width
```

### Concept 163: Fluid Typography
```scss
@mixin fluid-type($min, $max) {
  font-size: clamp(#{$min}, #{$min} + ... * ((100vw - 390px) / (1440 - 390)), #{$max});
}
```
Font size viewport width ke saath scale karta hai. 390px (mobile) pe minimum, 1440px (desktop) pe maximum. Beech me linearly interpolate. No media queries needed — smooth scaling.

### Concept 164: Responsive Breakpoints
```scss
$breakpoint-xs: 480px;   // Small phones
$breakpoint-sm: 576px;   // Large phones
$breakpoint-md: 768px;   // Tablets
$breakpoint-lg: 992px;   // Small desktops
$breakpoint-xl: 1200px;  // Large desktops
$breakpoint-xxl: 1600px; // Ultra-wide
```
Mobile-first approach — base styles mobile ke liye, `@include respond-to()` se larger screens ke liye override.

### Concept 165: Z-Index Scale
```scss
$z-dropdown: 1000;
$z-sticky: 1020;
$z-fixed: 1030;
$z-modal-backdrop: 1040;
$z-modal: 1050;
$z-popover: 1060;
$z-tooltip: 1070;
```
Z-index values predefined scale se — random values nahi. Layering conflicts prevent.

### Concept 166: Global Styles Reset
```scss
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```
CSS reset — browser default margins/paddings remove. `box-sizing: border-box` — padding border ke andar (intuitive sizing).

### Concept 167: ng-zorro Overrides
```scss
.ant-btn-primary {
  background-color: $color-primary !important;
  border-color: $color-primary !important;
  &:hover {
    background-color: $color-primary-hover !important;
  }
}
```
ng-zorro apne default blue theme ke saath aata hai. Ye overrides brand colors apply karte hain. `!important` needed kyunki ng-zorro ke styles high specificity hain.

---

## L. THIRD-PARTY LIBRARIES

### Concept 168: ng-zorro-antd (UI Component Library)
```typescript
import { provideNzI18n, en_US } from 'ng-zorro-antd/i18n';
// Global CSS: ng-zorro-antd.min.css
```
Ant Design ka Angular port. Provides: Buttons, Tables, Modals, Select, DatePicker, Input, Form controls, etc. Admin panel me heavily used. English locale configured.

### Concept 169: GSAP (Animation Library)
```typescript
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
```
GreenSock Animation Platform — professional-grade animations. Features used:
- `gsap.timeline()` — Sequential animations
- `gsap.from()` / `gsap.to()` — Animate properties
- `ScrollTrigger` — Scroll-based animations (parallax)
- `gsap.context()` — Scoped cleanup

### Concept 170: Firebase Client SDK
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
```
Phone authentication ke liye. Features: OTP send, verify, reCAPTCHA. Firebase project: `sarara-b9eac`.

### Concept 171: Socket.io Client
```typescript
import { io } from 'socket.io-client';
```
Real-time notifications ke liye. WebSocket connection backend se. JWT auth, user-specific rooms. Order status updates, admin notifications.

### Concept 172: Three.js (3D)
```typescript
import * as THREE from 'three';
```
3D graphics library. Available but minimally used currently — future hero section enhancements.

### Concept 173: RxJS
```typescript
import { Observable, tap, catchError, of, switchMap, filter, pairwise, finalize, throwError, firstValueFrom } from 'rxjs';
```
Reactive Extensions for JavaScript. Angular ka core dependency — HTTP client, Router events, form changes sab Observable-based hain.

---

## M. BUILD, DEV SERVER & ENVIRONMENT

### Concept 174: Dev Server Proxy
```json
// proxy.conf.json
{
  "/api": { "target": "http://localhost:3000", "secure": false, "changeOrigin": true },
  "/uploads": { "target": "http://localhost:3000", "secure": false, "changeOrigin": true }
}
```
Angular dev server (port 4200) pe `/api` requests automatically `localhost:3000` pe forward hoti hain. CORS issues avoid hote hain development me.

### Concept 175: Environment Files
```typescript
// environment.ts (development)
export const environment = {
  production: false,
  apiUrl: '/api/v1',  // Proxied to backend
  firebase: { apiKey: '...', projectId: 'sarara-b9eac', ... },
};

// environment.prod.ts (production)
export const environment = {
  production: true,
  apiUrl: 'https://rajhans-tea-production.up.railway.app/api/v1',
  firebase: { ... },
};
```
Build configuration me `fileReplacements` — production build pe environment.ts automatically environment.prod.ts se replace ho jaata hai.

### Concept 176: Smart API URL Detection
```typescript
apiUrl: typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://rajhans-tea-production.up.railway.app/api/v1'
  : '/api/v1',
```
`localhost` pe relative URL (proxy), baaki sab pe production URL. SSR scenario me `window` exist nahi karta → `typeof` check.

### Concept 177: Production Build Budgets
```json
"budgets": [
  { "type": "initial", "maximumWarning": "2MB", "maximumError": "4MB" },
  { "type": "anyComponentStyle", "maximumWarning": "16kB", "maximumError": "32kB" }
]
```
- **Initial bundle** > 2MB → Warning. > 4MB → Build FAILS.
- **Any component style** > 16kB → Warning. > 32kB → Build FAILS.

Performance guardrails — accidentally importing huge library caught at build time.

### Concept 178: Output Hashing
```json
"outputHashing": "all"
```
Production files: `main.abc123.js`, `styles.def456.css`. Hash changes when content changes. **Cache busting** — browser purani cached file serve nahi karega.

---

## N. PERFORMANCE & ACCESSIBILITY

### Concept 179: Lazy Loading Benefits
```
Initial load: ~200KB (core + home)
/admin loaded on demand: ~150KB
/auth loaded on demand: ~50KB
Each store page: ~20-40KB
```
User ko sirf wahi code download hona chahiye jo abhi chahiye. Admin panel 99% users kabhi visit nahi karte — unke browser me ye code kabhi nahi aayega.

### Concept 180: GSAP Memory Management
```typescript
// WRONG — Memory leak!
ngAfterViewInit() { gsap.from('.hero', { ... }); }

// CORRECT — Proper cleanup
private ctx: gsap.Context | null = null;
ngAfterViewInit() { this.ctx = gsap.context(() => { gsap.from('.hero', { ... }); }, root); }
ngOnDestroy() { this.ctx?.revert(); }  // Cleanup all animations + ScrollTriggers
```
SPA me component repeatedly create/destroy hota hai (route change pe). Bina cleanup ke har visit pe nayi animations add hoti hain — eventually browser slow/crash.

### Concept 181: Skip-to-Content Link
```scss
.skip-to-content {
  position: absolute; top: -40px;
  &:focus { top: 0; }  // Tab press pe visible
}
```
Keyboard users Tab press karein → "Skip to content" link visible → Enter press → main content pe jump (header navigation skip). **WCAG accessibility** requirement.

### Concept 182: Focus Visible Ring
```scss
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
button:focus:not(:focus-visible) { outline: none; }
```
**`:focus-visible`** — Sirf keyboard focus pe outline dikhao, mouse click pe nahi. Keyboard users ko visual feedback mile, mouse users ko unnecessary outline na dikhe.

### Concept 183: Semantic HTML
```html
<nav>                     <!-- Navigation landmark -->
<main class="content">    <!-- Main content landmark -->
<footer>                  <!-- Footer landmark -->
<button>                  <!-- Not <div onclick> -->
```
Screen readers landmarks use karte hain navigate karne ke liye. Semantic HTML = better accessibility without extra ARIA attributes.

### Concept 184: Font Smoothing
```scss
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```
Text rendering smooth karta hai (especially on macOS). Fonts thinner/sharper dikhte hain. Luxury aesthetic ke liye important.

---

## QUICK REFERENCE — Key Frontend Files

| What | Path |
|------|------|
| Entry point | `frontend/src/main.ts` |
| Root component | `frontend/src/app/app.ts` |
| App config | `frontend/src/app/app.config.ts` |
| Routes | `frontend/src/app/app.routes.ts` |
| Admin routes | `frontend/src/app/features/admin/admin.routes.ts` |
| Auth routes | `frontend/src/app/features/auth/auth.routes.ts` |
| **Core Services** | |
| Auth | `frontend/src/app/core/services/auth.service.ts` |
| Cart | `frontend/src/app/core/services/cart.store.ts` |
| Payment | `frontend/src/app/core/services/payment.store.ts` |
| Orders | `frontend/src/app/core/services/order.store.ts` |
| Search | `frontend/src/app/core/services/search.store.ts` |
| Reviews | `frontend/src/app/core/services/review.store.ts` |
| Catalog | `frontend/src/app/core/services/catalog.service.ts` |
| Admin | `frontend/src/app/core/services/admin.service.ts` |
| Firebase | `frontend/src/app/core/services/firebase.service.ts` |
| Razorpay | `frontend/src/app/core/services/razorpay.service.ts` |
| Theme | `frontend/src/app/core/services/theme.service.ts` |
| Toast | `frontend/src/app/core/services/toast.service.ts` |
| Loading | `frontend/src/app/core/services/loading.service.ts` |
| **Guards & Interceptors** | |
| Guards | `frontend/src/app/core/guards/auth.guard.ts` |
| Auth interceptor | `frontend/src/app/core/interceptors/auth.interceptor.ts` |
| Loading interceptor | `frontend/src/app/core/interceptors/loading.interceptor.ts` |
| **Layouts** | |
| Main layout | `frontend/src/app/layouts/main-layout/main-layout.ts` |
| Header | `frontend/src/app/layouts/main-layout/header/header.ts` |
| Admin layout | `frontend/src/app/layouts/admin-layout/admin-layout.ts` |
| **Design System** | |
| Tokens | `frontend/src/app/core/design-tokens/tokens.scss` |
| Mixins | `frontend/src/app/core/design-tokens/mixins.scss` |
| Theme | `frontend/src/styles/theme.scss` |
| Global styles | `frontend/src/styles.scss` |
| **Config** | |
| angular.json | `frontend/angular.json` |
| package.json | `frontend/package.json` |
| Proxy config | `frontend/src/proxy.conf.json` |
| Environment | `frontend/src/environments/environment.ts` |

---

## DEBUGGING TIPS (Frontend)

1. **Blank page?** → Browser console (F12) check karo — JavaScript error?
2. **API 401?** → Token expired? Check localStorage me accessToken hai?
3. **Component not rendering?** → Route configuration check, lazy loading path sahi hai?
4. **Styles not applying?** → Scoped styles check — global chahiye to styles.scss me daalo
5. **Signal not updating UI?** → Template me `()` lagaya hai? `{{ count }}` nahi, `{{ count() }}`
6. **Cart not loading?** → X-Session-ID header check, localStorage me guestSessionId hai?
7. **GSAP animation not working?** → `ngAfterViewInit` me hai? DOM ready hona chahiye
8. **Search not working?** → Debounce timer check, 2+ characters type kiye?
9. **Admin page 403?** → User role 'admin' hai? `isAdmin()` check karo
10. **Theme not switching?** → `data-theme` attribute check on `<html>`, CSS vars defined?

---

*Previous: [Part 1 — Infrastructure KT](./01-infrastructure.md)*
*Next: [Part 3 — Backend KT](./03-backend.md)*
