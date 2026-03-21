# Manual Testing Guide — Rajhans Ecommerce

> Run all tests in browser at `http://localhost` with Docker up.
> Admin panel: `http://localhost/admin`

---

## Slice 5 — Cart & Checkout

### TC-5.1: Guest Cart Add Item
1. Logout → Open console → Run:
   ```js
   fetch('/api/v1/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('guestSessionId') }, body: JSON.stringify({ productId: '<ACTIVE_PRODUCT_ID>', qty: 2 }) }).then(r=>r.json()).then(console.log)
   ```
2. **Expected:** `items` array with 1 item, `itemCount: 2`

### TC-5.2: Cart Sidebar
1. Click cart icon in header
2. **Expected:** Sidebar slides in, items visible, qty +/− controls

### TC-5.3: Qty Limit (max 10)
1. Click + until qty = 10
2. **Expected:** + button disabled at 10

### TC-5.4: Wishlist Toggle
1. Console: `fetch('/api/v1/wishlist/<PRODUCT_ID>', { method: 'POST', headers: { 'X-Session-ID': localStorage.getItem('guestSessionId') }, body: '{}' }).then(r=>r.json()).then(console.log)`
2. Go to `/wishlist`
3. **Expected:** Product card with filled heart

### TC-5.5: Checkout Flow (3 steps)
1. Add items → Cart sidebar → "Proceed to Checkout"
2. Step 1: Review items, change qty
3. Step 2: Fill address (all fields required, phone 10 digits, pincode 6 digits)
4. Step 3: Order summary with pricing breakdown

### TC-5.6: Login Merge
1. Add items A(1), B(2) as guest
2. Login (previous session had B(5), C(3))
3. **Expected:** Merged cart: A(1), B(5), C(3) — max qty per product

### TC-5.7: Session ID Required
1. Console: `fetch('/api/v1/cart').then(r=>r.json()).then(console.log)` (no header)
2. **Expected:** 400 "X-Session-ID header is required"

---

## Slice 7 — Payments & Finance

### TC-7.1: Razorpay Payment
1. Add items → Checkout → Fill address → Step 3 → "Place Order"
2. Razorpay modal opens
3. Use test card: `4111 1111 1111 1111`, expiry: any future, CVV: 123
4. **Expected:** Payment verified, redirect to `/orders`

### TC-7.2: Payment Cancelled
1. Place Order → Razorpay modal → Dismiss (X)
2. **Expected:** "Payment cancelled" message, cart intact

### TC-7.3: Wallet Payment
1. Admin credits wallet: console `fetch('/api/v1/wallet/credit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') }, body: JSON.stringify({ userId: JSON.parse(localStorage.getItem('user'))._id, amount: 5000, description: 'Test credit' }) }).then(r=>r.json()).then(console.log)`
2. Checkout → Step 3 → Toggle "Use Wallet Balance"
3. If wallet >= total: no Razorpay modal, instant capture
4. If wallet < total: wallet deducted, Razorpay for remaining

### TC-7.4: Wallet Safe on Dismiss
1. Toggle wallet ON → Place Order → Dismiss Razorpay modal
2. **Expected:** Wallet balance unchanged (not deducted)

### TC-7.5: Invoice Download
1. `/orders` → Find captured order → Click "Invoice"
2. **Expected:** PDF downloads with invoice number, items, GST, total

### TC-7.6: Idempotency
1. Console: Run same `POST /payments/orders` twice with same `X-Idempotency-Key`
2. **Expected:** Same `razorpayOrderId` both times

### TC-7.7: Guest Cannot Pay
1. Logout → Checkout → Place Order
2. **Expected:** Redirect to login, return to checkout after login

### TC-7.8: Admin Payments
1. `/admin/payments` → Stats cards visible (revenue, orders, refunds)
2. Search by order ID or customer name
3. Click order → Detail modal with items, address, status

### TC-7.9: Admin Refund
1. Admin → Payments → Find captured order → Refund button
2. Enter amount + reason → Confirm
3. **Expected:** Refund processed, wallet credited

### TC-7.10: Wallet Page
1. `/wallet` → Balance card + transaction history
2. **Expected:** Credits/debits with amounts and descriptions

### TC-7.11: Admin Wallet Management
1. `/admin/wallets` → Search phone number → View balance + history
2. Credit wallet → Verify balance updates

---

## Slice 8 — Inventory & Fulfillment

### TC-8.1: Create Default Warehouse
1. `/admin/warehouses` → + Add Warehouse
2. Fill all fields, check "Set as default"
3. **Expected:** Warehouse card with "Default" badge

### TC-8.2: Order Created After Payment
1. Place order with payment
2. `/admin/orders`
3. **Expected:** New order ORD-2026-XXXXX with status "Confirmed"

### TC-8.3: Stock Deduction
1. Admin → Products → Edit product → Enable "Track Inventory" → Set stock to 50 → Save
2. Place order (qty: 2) → Payment captured
3. **Expected:** Product stock = 48

### TC-8.4: Inventory Dashboard
1. `/admin/inventory`
2. **Tab: Stock Overview** — All tracked products with stock levels, search, sort
3. **Tab: Movements** — Audit log (purchase_deduction entries after orders)
4. **Tab: Alerts** — Low stock / out of stock alerts

### TC-8.5: Manual Stock Adjustment
1. Admin → Inventory → Stock Overview → Click "+" on a product
2. Enter qty: +20, Note: "Restocking"
3. **Expected:** Stock increases, movement log entry created

### TC-8.6: Set Stock Directly
1. Admin → Inventory → Stock Overview → Click "Set" on a product
2. Enter new value: 100, Note: "Inventory count"
3. **Expected:** Stock set to 100, diff shown in movement log

### TC-8.7: Admin Order Status Update
1. `/admin/orders` → Click order → Detail modal
2. Select "processing" → Update
3. **Expected:** Status badge changes, status history shows both entries

### TC-8.8: Cancel Order
1. Find confirmed/processing order → Cancel button → Enter reason
2. **Expected:** Status = cancelled, stock restored

### TC-8.9: Customer Order History
1. Login → `/orders`
2. **Expected:** Order cards with order number, status timeline, tracking info (if shipped)

### TC-8.10: Shipping Rates (API)
```js
fetch('/api/v1/shipping/rates?pincode=400001&weight=0.5').then(r=>r.json()).then(console.log)
```
**Expected:** Empty array (Shiprocket not configured) or rates list

---

## Slice 9 — Pricing Engine

### TC-9.1: Create Price Rule
1. `/admin/pricing` → Price Rules tab → + Add Price Rule
2. Create quantity_tier rule: 1-2 → 0%, 3-5 → 10%, 6+ → 20%
3. **Expected:** Rule visible in list

### TC-9.2: Create Tax Rule
1. `/admin/pricing` → Tax Rules tab → + Add Tax Rule
2. Create: GST 18%, inclusive, global
3. **Expected:** Rule visible in list

### TC-9.3: Pricing Calculation
```js
fetch('/api/v1/pricing/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: '<ID>', basePrice: 1000, qty: 5 }) }).then(r=>r.json()).then(console.log)
```
**Expected:** PriceBreakdown with discount, tax, finalPrice

---

## Slice 10 — Promotions & Growth

### TC-10.1: Create Coupon (Admin)
1. `/admin/coupons` → + Create Coupon
2. Fill: Code: FLAT100, Type: Fixed, Value: 100, Min Order: 500, Valid dates
3. **Expected:** Coupon appears in table with "Active" badge

### TC-10.2: Validate Coupon
```js
fetch('/api/v1/promotions/coupons/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('guestSessionId') },
  body: JSON.stringify({ code: 'FLAT100' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** `{ valid: true, discountAmount: 100, message: "Coupon applied!..." }`

### TC-10.3: Invalid Coupon
1. Validate with code: "DOESNOTEXIST"
2. **Expected:** `{ valid: false, message: "Invalid coupon code" }`

### TC-10.4: Expired Coupon
1. Create coupon with past dates → Validate
2. **Expected:** `{ valid: false, message: "Coupon has expired" }`

### TC-10.5: Min Order Check
1. Create coupon with minOrderAmount: 5000 → Cart total < 5000 → Validate
2. **Expected:** `{ valid: false, message: "Minimum order amount is ₹5000" }`

### TC-10.6: Usage Limit
1. Create coupon with usageLimitTotal: 1 → Use it → Try again
2. **Expected:** Second time: `{ valid: false, message: "Coupon usage limit reached" }`

### TC-10.7: Loyalty Points Page
1. Login → `/loyalty`
2. **Expected:** Points balance, earn/redeem rates, transaction history

### TC-10.8: Loyalty Points Earned After Purchase
1. Place order → Payment captured
2. Check `/loyalty` after a few seconds (BullMQ processes)
3. **Expected:** Points earned entry (e.g., "Earned X points for order ₹Y")

### TC-10.9: Referral Page
1. Login → `/referral`
2. **Expected:** Referral code displayed, Copy button works, stats (0 referrals initially)

### TC-10.10: Active Campaigns (API)
```js
fetch('/api/v1/promotions/campaigns/active').then(r=>r.json()).then(console.log)
```
**Expected:** Empty array (no campaigns created yet) or active campaigns list

### TC-10.11: Edit/Delete Coupon (Admin)
1. `/admin/coupons` → Edit a coupon → Change value → Save
2. **Expected:** Updated value in table
3. Delete coupon → Confirm
4. **Expected:** Removed from table

### TC-10.12: Coupon Deactivation
1. Edit coupon → Uncheck "Active" → Save
2. Validate the code
3. **Expected:** `{ valid: false, message: "Coupon is inactive" }`

---

## Cross-Slice Tests

### TC-X.1: Full Purchase Flow
1. Guest: Browse → Add to cart → Wishlist some items
2. Checkout → Login (redirect back) → Cart merged
3. Apply coupon (if any) → Place Order → Razorpay payment
4. **Expected:** Order created, stock deducted, invoice generated, loyalty points earned

### TC-X.2: Auth Guards
1. Logout → Try `/orders`, `/wallet`, `/loyalty`, `/referral`
2. **Expected:** All redirect to login

### TC-X.3: Admin Auth
1. Login as non-admin → Try `/admin`
2. **Expected:** Redirected (admin guard blocks)

---

## Slice 3 — Search & Discovery

### TC-3.1: Full-Text Search
1. Header search bar → Type "tea" → Press Enter
2. **Expected:** Navigate to `/search?q=tea`, products matching "tea" shown

### TC-3.2: Autocomplete
1. Header search bar → Type "te" (2+ chars)
2. **Expected:** Dropdown with product + category suggestions after 300ms
3. Click a suggestion → navigates to search page

### TC-3.3: No Results
1. Search for "xyznonexistent"
2. **Expected:** "No products found" with friendly illustration + "Clear all filters" if filtered

### TC-3.4: Category Filter
1. Search any term → Click a category in filter sidebar
2. **Expected:** Results filtered to that category, result count updates

### TC-3.5: Price Range Filter
1. Enter min: 100, max: 500 → Click "Go"
2. **Expected:** Only products in ₹100-₹500 range shown

### TC-3.6: Tag Filter
1. Click a tag pill in sidebar
2. **Expected:** Tag becomes active (filled), results filtered

### TC-3.7: Sort Options
1. Search "tea" → Change sort to "Price: Low → High"
2. **Expected:** Products reordered by price ascending

### TC-3.8: In Stock Filter
1. Toggle "In Stock Only"
2. **Expected:** Only products with stock > 0 shown

### TC-3.9: Pagination
1. Search with many results → Click "Next"
2. **Expected:** Page 2 loads, scroll to top

### TC-3.10: Facets
1. Search any term
2. **Expected:** Sidebar shows category counts, price range, tag counts

### TC-3.11: Add to Cart from Search
1. Search → Click "Add to Cart" on a product card
2. **Expected:** Cart sidebar opens with item added

### TC-3.12: Wishlist from Search
1. Search → Click heart on a product
2. **Expected:** Heart fills red, product added to wishlist

### TC-3.13: Popular Searches
```js
fetch('/api/v1/search/popular').then(r=>r.json()).then(console.log)
```
**Expected:** Array of popular search strings (empty initially, fills after searches)

### TC-3.14: Search Analytics (Admin)
```js
fetch('/api/v1/admin/search-analytics', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') }
}).then(r=>r.json()).then(console.log)
```
**Expected:** `{ stats: {...}, popular: [...], zeroResults: [...] }`

### TC-3.15: Browse Without Query
1. Navigate to `/search` (no query)
2. **Expected:** Shows all active products, filters available, sort works

---

## Slice 4 — Personalization & Merchandising

### TC-4.1: Homepage Feed
1. Visit `http://localhost`
2. **Expected:** Homepage shows sections: Trending Now, New Arrivals (product rails)
3. If no products → Hero section with "Browse Products" CTA

### TC-4.2: Track Product View
```js
fetch('/api/v1/personalization/track-view', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('guestSessionId') },
  body: JSON.stringify({ productId: '<ACTIVE_PRODUCT_ID>' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** `202 { success: true, message: "View tracked" }`

### TC-4.3: Recently Viewed
1. Track 3-4 product views (TC-4.2)
2. `GET /api/v1/personalization/recently-viewed` with X-Session-ID header
3. **Expected:** Products in reverse chronological order

### TC-4.4: Trending Products
```js
fetch('/api/v1/personalization/trending').then(r=>r.json()).then(console.log)
```
**Expected:** Array of products (most viewed or featured fallback)

### TC-4.5: Product Recommendations
```js
fetch('/api/v1/personalization/product/<PRODUCT_ID>/recommendations').then(r=>r.json()).then(console.log)
```
**Expected:** `{ frequentlyBoughtTogether: [...], similar: [...], alsoViewed: [...] }`

### TC-4.6: Upsell
```js
fetch('/api/v1/personalization/product/<PRODUCT_ID>/upsell').then(r=>r.json()).then(console.log)
```
**Expected:** Products in same category with higher price

### TC-4.7: Cart Cross-sell
```js
fetch('/api/v1/personalization/cart/cross-sell?productIds=<ID1>,<ID2>').then(r=>r.json()).then(console.log)
```
**Expected:** Complementary products (empty if no co-purchase data yet)

### TC-4.8: Active Banners
```js
fetch('/api/v1/personalization/banners').then(r=>r.json()).then(console.log)
```
**Expected:** Array of active banners (empty initially)

### TC-4.9: Admin — Create Banner
1. `/admin/merchandising` → Banners tab → + Add Banner
2. Fill title, image URL, link, position
3. **Expected:** Banner appears in list
4. Visit homepage → banner carousel shows

### TC-4.10: Admin — Create Merchandising Rule
1. `/admin/merchandising` → Rules tab → + Create Rule
2. Type: Automated, Section: Trending, Strategy: Most Viewed
3. **Expected:** Rule in list with "automated" badge
4. Click "Evaluate" → cachedProductIds populated

### TC-4.11: Admin — Manual Rule
1. Create rule: Type: Manual, Section: Recommended
2. (Future: product picker UI — for now, products pinned via API)
3. **Expected:** Rule active, manual badge

### TC-4.12: Homepage Sections
1. Create merchandising rules for different sections
2. Visit homepage
3. **Expected:** Each section shows products from its rule (cached or fallback)

---

## Slice 11 — Reviews & UGC

### TC-11.1: Submit Review
```js
fetch('/api/v1/reviews/products/<PRODUCT_ID>/reviews', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') },
  body: JSON.stringify({ rating: 5, title: 'Great product!', body: 'Really loved the quality and taste.' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** 201, review created. If purchased → auto-approved + "Verified Purchase"

### TC-11.2: Duplicate Review
1. Submit review for same product again
2. **Expected:** 409 "You have already reviewed this product"

### TC-11.3: Get Product Reviews
```js
fetch('/api/v1/reviews/products/<PRODUCT_ID>/reviews').then(r=>r.json()).then(console.log)
```
**Expected:** Paginated approved reviews with user info

### TC-11.4: Rating Summary
```js
fetch('/api/v1/reviews/products/<PRODUCT_ID>/summary').then(r=>r.json()).then(console.log)
```
**Expected:** `{ averageRating: 5, totalReviews: 1, distribution: { 1:0, 2:0, 3:0, 4:0, 5:1 } }`

### TC-11.5: Helpful Vote (toggle)
```js
fetch('/api/v1/reviews/reviews/<REVIEW_ID>/vote', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') }
}).then(r=>r.json()).then(console.log)
```
**Expected:** First time: `{ action: "added" }`. Second time: `{ action: "removed" }`

### TC-11.6: Report Review
```js
fetch('/api/v1/reviews/reviews/<REVIEW_ID>/report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') },
  body: JSON.stringify({ reason: 'spam', details: 'Looks fake' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** `{ reported: true }`

### TC-11.7: Submit Question
```js
fetch('/api/v1/reviews/products/<PRODUCT_ID>/questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') },
  body: JSON.stringify({ questionText: 'Is this product organic?' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** 201, question created (auto-approved)

### TC-11.8: Submit Answer
```js
fetch('/api/v1/reviews/questions/<QUESTION_ID>/answers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') },
  body: JSON.stringify({ body: 'Yes, 100% organic certified.' })
}).then(r=>r.json()).then(console.log)
```
**Expected:** `{ answered: true }`. Admin answers get `isAdminAnswer: true`

### TC-11.9: Bad Words Auto-Flag
1. Submit review with title containing "scam" or "fraud"
2. **Expected:** Status = "pending" (not auto-approved even if verified purchaser)

### TC-11.10: Admin Moderation
1. `/admin/moderation`
2. **Expected:** Stats cards (approved, pending, reported, avg rating)
3. Pending reviews tab → Approve/Reject buttons
4. Approve → review visible publicly, rating recomputed
5. Reject → review hidden, reason stored

### TC-11.11: Admin Reply
1. Admin → Moderation → Click Reply on a review → Type reply → Send
2. **Expected:** Admin reply visible on the review

### TC-11.12: Pin Review
1. Admin → Moderation → Click Pin on a review
2. **Expected:** Review appears first in product reviews (isPinned: true)

### TC-11.13: My Reviews
```js
fetch('/api/v1/reviews/my-reviews', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('accessToken') }
}).then(r=>r.json()).then(console.log)
```
**Expected:** User's submitted reviews with status badges

---

*Last updated: 2026-03-22 — Slices 3, 4, 5, 7, 8, 9, 10, 11*
