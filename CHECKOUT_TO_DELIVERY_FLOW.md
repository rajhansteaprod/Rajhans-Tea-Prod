# End-to-End Checkout to Delivery Flow

Complete API call sequence from buying a product to delivery.

---

## 1️⃣ BUY NOW (Homepage)

```
USER CLICKS "BUY NOW" on product card
    ↓
Frontend: cart.buyNowItem(product, 1)
    ↓ (stores in localStorage temp cart)
Navigate to /checkout
```

---

## 2️⃣ CHECKOUT PAGE LOAD

```
Frontend: GET /checkout page loads
    ↓
Sync temp cart → session cart
    ↓
API CALL: POST /cart/add (for each temp item)
    ├─ Body: { productId, quantity }
    └─ Response: Item added to session
    ↓
API CALL: GET /checkout/summary
    ├─ Body: (none, uses session items)
    └─ Response: { items, subtotal, tax, discount, total, pricing }
    ↓
Display checkout form + address input
```

---

## 3️⃣ ADDRESS VALIDATION & ORDER SUMMARY

```
User fills address + clicks "PAY NOW"
    ↓
Frontend: Validate address (zip, phone, etc)
    ↓
API CALL: POST /checkout/summary (refresh totals)
    ├─ Body: { addressId }
    └─ Response: { items, tax, finalTotal }
    ↓
Store paymentId in signal
```

---

## 4️⃣ PAYMENT INITIATION (Razorpay)

```
User clicks "PAY NOW"
    ↓
API CALL: POST /payments/orders
    ├─ Body: { amount, currency, orderId (temp) }
    ├─ Backend: Creates Razorpay order
    └─ Response: { razorpay_order_id, amount }
    ↓
Frontend: Open Razorpay modal
    ↓
User enters card/UPI details + pays
    ↓
Razorpay modal closes (success)
```

---

## 5️⃣ PAYMENT VERIFICATION

```
Frontend gets: razorpay_payment_id, razorpay_signature
    ↓
API CALL: POST /payments/verify
    ├─ Body: { razorpay_payment_id, razorpay_order_id, signature }
    ├─ Backend: Verify signature with Razorpay
    └─ Response: { success: true, paymentId: "..." }
    ↓
Frontend: Store paymentId
    ↓
Clear temp cart: cart.clearTemporaryCart()
    ↓
Navigate to /order-confirmation?paymentId=...
```

---

## 6️⃣ WEBHOOK (Background) - ORDER CREATION

```
Razorpay sends webhook: payment.captured
    ↓
API ENDPOINT: POST /webhooks/razorpay (auto-called by Razorpay)
    ├─ Body: { event: "payment.captured", payload: { paymentId } }
    ├─ Backend: Verify webhook signature
    └─ Enqueue job: FulfillmentJobs.CREATE_ORDER
    ↓
BullMQ Job (async): CreateOrderJob
    ├─ Input: { paymentId }
    ├─ Database: Create Order document
    ├─ Set status: "order.created"
    └─ Enqueue next job: CREATE_SHIPMENT
```

---

## 7️⃣ ORDER CONFIRMATION PAGE

```
Frontend: /order-confirmation?paymentId=...
    ↓
Display "Payment Successful ✓"
    ↓
After 2.5s delay:
API CALL: GET /orders?limit=1
    ├─ Query param: limit=1 (get latest order)
    └─ Response: [{ orderId, items, total, status }]
    ↓
IF order exists → Show "Order #12345"
IF NOT → Show "Processing... check back in 30s"
    ↓
User clicks "View Orders" → /dashboard
```

---

## 8️⃣ SHIPMENT CREATION (Background)

```
BullMQ Job: CreateShipmentJob
    ├─ Input: { orderId }
    ├─ Fetch Order details
    ├─ Map to Shiprocket format
    └─ Enqueue job: SYNC_TRACKING
    ↓
API CALL: POST /shiprocket/orders (Internal backend call)
    ├─ Body: { orderId, items, address, weight }
    ├─ Shiprocket: Creates shipment, assigns courier
    └─ Response: { shipment_id, tracking_id, courier_name }
    ↓
Database: Update Order
    ├─ shiprocket_id = "..."
    ├─ tracking_id = "..."
    └─ status = "shipment.created"
```

---

## 9️⃣ TRACKING SYNC (Cron Job - Every 5 min)

```
Cron Job: Runs every 5 minutes
    ↓
Find all active orders with tracking_id
    ↓
FOR EACH order:
    API CALL: GET /shiprocket/tracking/:tracking_id
    ├─ Shiprocket: Returns latest status
    ├─ Status can be: "pending", "in_transit", "out_for_delivery", "delivered"
    └─ Response: { status, location, eta }
    ↓
Database: Update Order
    ├─ shipping_status = "in_transit"
    ├─ current_location = "Delhi Hub"
    └─ updated_at = now
```

---

## 🔟 ORDER HISTORY PAGE (/dashboard)

```
User: Clicks "My Orders" in dashboard
    ↓
API CALL: GET /orders?page=1&limit=10
    ├─ Query: User's orders sorted by date
    └─ Response: [
       {
         orderId: "ORD#12345",
         items: [...],
         total: 999,
         status: "in_transit",
         shipping_status: "in_transit",
         tracking_id: "ABC123",
         created_at: "2026-05-04"
       }
    ]
    ↓
Display order cards with status badge
    ↓
User clicks order → /dashboard/orders/:orderId
```

---

## 1️⃣1️⃣ ORDER DETAIL PAGE

```
API CALL: GET /orders/:orderId
    ├─ Response: {
    │   orderId, items, total, tax,
    │   address: { name, phone, zip, city },
    │   shipping: { tracking_id, courier, current_location, eta },
    │   status: "in_transit",
    │   timeline: [
    │     { event: "order.created", time: "2026-05-04 10:00" },
    │     { event: "shipment.created", time: "2026-05-04 11:30" },
    │     { event: "in_transit", time: "2026-05-04 14:00" },
    │     { event: "out_for_delivery", time: "2026-05-05 09:00" },
    │     { event: "delivered", time: "2026-05-05 17:30" }
    │   ]
    │ }
    └─
Display:
    ├─ Order items table
    ├─ Shipping address
    ├─ Real-time tracking with map
    ├─ Delivery timeline (visual)
    └─ Courier details
```

---

## 1️⃣2️⃣ DELIVERY COMPLETE ✓

```
Shiprocket webhook: shipment.delivered
    ↓
Backend: Update Order status → "delivered"
    ↓
Frontend: Order card shows ✓ "Delivered"
    ↓
Show review/feedback option
```

---

## API Calls Summary (In Order)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | POST | `/cart/add` | Add temp cart items to session |
| 2 | GET | `/checkout/summary` | Get order totals with pricing |
| 3 | POST | `/payments/orders` | Create Razorpay order |
| 4 | POST | `/payments/verify` | Verify payment with Razorpay |
| 5 | 🔄 | POST `/webhooks/razorpay` | Razorpay webhook → Create order job |
| 6 | GET | `/orders?limit=1` | Poll for newly created order |
| 7 | 🔄 | POST `/shiprocket/orders` | Shipment creation job |
| 8 | 🔄 | GET `/shiprocket/tracking` | Cron: Sync tracking (every 5min) |
| 9 | GET | `/orders` | Get user's order list |
| 10 | GET | `/orders/:orderId` | Get order details with tracking |

---

## Key Technical Points

### Frontend Flows
- **Buy Now**: Uses `buyNowItem()` (temp cart in localStorage)
- **Checkout**: Syncs temp cart to session, fetches pricing
- **Payment**: Opens Razorpay modal, verifies on success
- **Confirmation**: Polls order creation with 2.5s delay + 8s timeout
- **Dashboard**: Shows orders with live tracking updates

### Backend Flows
- **Payments**: Webhook-driven order creation (non-blocking BullMQ job)
- **Fulfillment**: Job chain: CREATE_ORDER → CREATE_SHIPMENT
- **Tracking**: Cron job syncs Shiprocket status every 5 minutes
- **Orders**: Full tracking timeline with status updates

### Error Handling
- Payment verification failures → Show error, keep order in draft
- Shipment creation failures → Retry with exponential backoff
- Tracking sync failures → Continue, retry on next cron run

---

## Testing Checklist

- [ ] Buy Now → adds to temp cart
- [ ] Checkout page loads with pricing
- [ ] Address validation works
- [ ] Payment modal opens and accepts test card
- [ ] Payment verification succeeds
- [ ] Order created within 3 seconds
- [ ] Order confirmation page shows order number
- [ ] Temp cart cleared after payment
- [ ] Order appears in dashboard
- [ ] Tracking updates every 5 minutes
- [ ] Order detail page shows timeline
- [ ] Status changes when delivered

---

Generated: 2026-05-04
