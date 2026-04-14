# 🎯 Loading Strategy Guide - Option A (Hierarchical)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Global Navigation Loading               │
│  NavigationLoaderService → PageLoaderComponent (top-level)  │
│  - Shows on route change only                               │
│  - 200ms debounce (prevents flicker)                        │
│  - NO loader on initial page load                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│            Component-Level Data Loading (Independent)        │
│  Each component manages its own loading state                │
│  - ProductsPageComponent.loading                             │
│  - OrderListComponent.loading                                │
│  - etc.                                                      │
│                                                              │
│  BUT: Skip showing if global navigation is in progress      │
│  Use: LoaderContextService.isNavigating() to check          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   HTTP Request Loading                       │
│  LoadingService + LoadingBarComponent (overlay)             │
│  - Shows when API calls are in progress                     │
│  - Separate from navigation                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ How to Update Existing Components

### BEFORE (Current Pattern - Can show double loaders)

```typescript
// ProductsPageComponent.ts
export class ProductsPageComponent implements OnInit {
  readonly loading = signal(false);

  ngOnInit() {
    this.loading.set(true);
    this.catalog.getProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      }
    });
  }
}
```

```html
<!-- products-page.html -->
@if (loading()) {
  <div class="skeleton-loader">...</div>
}
<div class="products-grid">...</div>
```

**Problem:** Shows component loader even during route navigation (double loaders!)

---

### AFTER (Updated Pattern - Smart loader suppression)

```typescript
// ProductsPageComponent.ts
import { LoaderContextService } from '../../../core/services/loader-context.service';

export class ProductsPageComponent implements OnInit {
  readonly loading = signal(false);
  readonly loaderContext = inject(LoaderContextService);

  ngOnInit() {
    this.loading.set(true);
    this.catalog.getProducts().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      }
    });
  }
}
```

```html
<!-- products-page.html -->
<!-- Only show component loader if:
     1. Data is still loading AND
     2. Global navigation is NOT in progress
-->
@if (loading() && !loaderContext.isNavigating()) {
  <div class="skeleton-loader">...</div>
}
<div class="products-grid">...</div>
```

**Result:** 
- ✅ On route change: Global PageLoader shows (cleaner)
- ✅ Component loader only shows if data is still loading AFTER navigation completes
- ✅ No double loaders!

---

## 📋 Quick Checklist for Your 19+ Components

For each component with its own `loading` signal:

```typescript
// 1. Inject LoaderContextService
readonly loaderContext = inject(LoaderContextService);

// 2. In template, add condition check:
@if (loading() && !loaderContext.isNavigating()) {
  <my-loader />
}
```

That's it! No TypeScript changes needed.

---

## 🎯 When to Use Each Loader

### Use PageLoader (Global Navigation)
- ✅ User clicks route link
- ✅ Route changes to `/products` or `/admin/orders`
- ✅ New page component initializes
- Component's ngOnInit fires AFTER navigation completes

### Use Component Loader
- ✅ User filters products on /products page
- ✅ User searches in admin list
- ✅ Data refetch within the same page
- ✅ Form submission
- Router doesn't change (same page, same component)

### Use HTTP Loading Bar (LoadingService)
- ✅ Background API calls (user doesn't navigate away)
- ✅ Polling endpoints
- ✅ Silent refreshes

---

## 🚨 Common Mistakes to Avoid

### ❌ WRONG: Show loader for ALL loading
```html
@if (loading()) {
  <loader />  <!-- Shows even during route navigation! -->
}
```

### ✅ RIGHT: Skip if navigating
```html
@if (loading() && !loaderContext.isNavigating()) {
  <loader />  <!-- Only shows for data loading within same page -->
}
```

---

## 💡 Why This Architecture Works

| Scenario | Global Loader | Component Loader | Result |
|----------|---|---|---|
| User navigates to /products | ✅ Shows | ⏸️ Suppressed | Single loader (clean) |
| Products page loads, then user filters | ❌ Doesn't show | ✅ Shows | Single loader (component's) |
| Fast navigation (<200ms) | ⏭️ Debounced (no show) | ⏸️ Suppressed | No loader (smooth!) |
| Initial page load | ❌ Skipped (SSR) | ⏸️ Suppressed | No loader (instant!) |

---

## 📚 Service Reference

### NavigationLoaderService
```typescript
inject(NavigationLoaderService);

// Public API:
.isLoading()              // Signal: true if showing loader
.isNavigating()           // Signal: true if route change in progress
.isInitialLoad()          // Signal: true on first page load only
.isCurrentlyNavigating()  // Function: check in ngOnInit
.isFirstLoad()            // Function: check for SSR optimization
```

### LoaderContextService
```typescript
readonly loaderContext = inject(LoaderContextService);

// In templates:
loaderContext.isNavigating()    // Signal: am I being skipped by global nav?
loaderContext.isLoading()       // Signal: is global nav in progress?
loaderContext.isInitialLoad()   // Signal: is this the first load?

// In TypeScript:
loaderContext.shouldSkipComponentLoader()  // Function: should I hide my loader?
```

---

## 🎬 Real-World Example Flow

### User clicks "Products" link

```
1. User clicks router link
   ↓
2. NavigationStart event
   ↓
3. isInitialLoad check:
   - If true: Skip loader, mark as done
   - If false: Start 200ms debounce timer
   ↓
4a. Navigation completes < 200ms → Debounce timer cancelled, NO loader shown
4b. Navigation completes > 200ms → Loader shows, user sees feedback
   ↓
5. NavigationEnd event
   ↓
6. Route activates, ProductsPageComponent.ngOnInit fires
   ↓
7. Component sets loading = true
   ↓
8. Template checks: loading() && !loaderContext.isNavigating()
   - loading = true ✓
   - isNavigating = false ✓ (navigation completed)
   - Result: Component loader shows
   ↓
9. API response arrives
   ↓
10. Component sets loading = false
    ↓
11. Loader disappears
```

---

## ✨ Benefits of This Approach

✅ **No double loaders** - Only one visual feedback at a time  
✅ **Better perceived performance** - Fast navigations feel instant (no flicker)  
✅ **SSR optimized** - No loader on initial page load  
✅ **Minimal refactoring** - Just add 1 line to templates  
✅ **Clear separation** - Nav loading ≠ Data loading ≠ HTTP loading  
✅ **Production-grade** - Handles edge cases (cancel, error, etc.)  

---

## 🔗 Files Changed

```
Created:
├── navigation-loader.service.ts (core/services/)
├── loader-context.service.ts (core/services/)
└── LOADER_STRATEGY_GUIDE.md (this file)

Modified:
├── page-loader.component.ts
├── app.component.ts
└── [Your 19+ components] (update templates only)
```
