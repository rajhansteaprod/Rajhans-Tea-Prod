# Complete End-to-End Flow: Checkout → Shiprocket Delivery

## Overview
This document traces the complete journey of an order from the moment a customer initiates checkout until the package is delivered by Shiprocket courier.

---

## High-Level Flow Diagram

```
CHECKOUT FLOW
↓
Payment Processing (Razorpay)
↓
Order Creation (MongoDB)
↓
BullMQ Fulfillment Queue
↓
Shiprocket Integration
↓
Shipment Creation & AWB Assignment
↓
Pickup & Delivery
```

---

## Phase 1: CHECKOUT FLOW (Frontend)

### Step 1.1: Cart Review
**Location**: `/checkout`

**User Action**: Customer reviews items in cart and clicks "PAY NOW"

**Frontend State**:
- `CartStore.tempCart` contains items
- Checkout wizard shows: Cart → Address → Payment Summary

**APIs Called**: None at this step

**Use**: Display cart items, validate items exist

---

### Step 1.2: Address Collection
**Location**: `/checkout` (Address Step)

**User Action**: Customer enters/selects shipping address

**Form Fields**:
```javascript
{
  fullName: string,
  phone: string,
  email: string,
  street: string,
  city: string,
  state: string,
  pincode: string,
  isDefault: boolean
}
```

**Frontend State**: Address saved in checkout session

**APIs Called**: None (stored locally)

**Use**: Validate address format before payment

---

### Step 1.3: Payment Summary Review
**Location**: `/checkout` (Summary Step)

**User Action**: Review order summary and click "PLACE ORDER"

**Displayed Data**:
- Items with prices
- Shipping address
- Total amount
- Discount (if applicable)

**Frontend State**: Ready to initiate payment

**APIs Called**: None yet

**Use**: Final confirmation before payment

---

## Phase 2: PAYMENT PROCESSING (Razorpay)

### Step 2.1: Create Razorpay Order
**Endpoint**: `POST /api/v1/payments/orders`

**Request**:
```javascript
{
  amount: 50000,           // In paise (₹500)
  currency: "INR",
  receipt: "order-ORD-001",
  notes: {
    orderNumber: "ORD-001"
  }
}
```

**Response**:
```javascript
{
  id: "order_1234567890",     // Razorpay order ID
  entity: "order",
  amount: 50000,
  currency: "INR",
  receipt: "order-ORD-001",
  status: "created"
}
```

**Use**: 
- Create unique payment request in Razorpay
- Get Razorpay order ID to pass to payment modal
- Establish link between our system and Razorpay

---

### Step 2.2: Open Razorpay Payment Modal
**Location**: Frontend (SummaryStepComponent)

**User Action**: "PLACE ORDER" button triggers Razorpay modal

**Razorpay Modal Parameters**:
```javascript
{
  key: "rzp_test_STo8X60gyG9PvZ",        // Public key
  amount: 50000,                          // In paise
  currency: "INR",
  name: "Rajhans Tea",
  description: "Order #ORD-001",
  order_id: "order_1234567890",           // From Step 2.1
  handler: verifyPaymentCallback,         // Success handler
  prefill: {
    email: "customer@example.com",
    contact: "9876543210"
  }
}
```

**Use**:
- Display secure payment form
- Accept card/UPI/wallet payments
- Handle payment securely

---

### Step 2.3: Customer Enters Payment Details
**Location**: Razorpay Modal

**User Action**: Customer enters card/UPI details and completes payment

**What Happens**:
1. Razorpay validates payment method
2. Card/UPI gateway processes transaction
3. Payment succeeds or fails
4. Razorpay returns to app with result

**Use**: Securely process customer payment

---

### Step 2.4: Verify Payment (Frontend)
**Location**: Frontend (SummaryStepComponent)

**Razorpay Response** (Success):
```javascript
{
  razorpay_payment_id: "pay_1234567890",
  razorpay_order_id: "order_1234567890",
  razorpay_signature: "signature_hash"
}
```

**Frontend Action**: Send verification request

**Endpoint**: `POST /api/v1/payments/verify`

**Request**:
```javascript
{
  razorpay_payment_id: "pay_1234567890",
  razorpay_order_id: "order_1234567890",
  razorpay_signature: "signature_hash"
}
```

**Response**:
```javascript
{
  success: true,
  message: "Payment verified",
  payment: {
    _id: "payment_mongodb_id",
    razorpayPaymentId: "pay_1234567890",
    razorpayOrderId: "order_1234567890",
    amount: 50000,
    status: "captured",
    createdAt: "2026-05-12T10:00:00Z"
  }
}
```

**Frontend Next Action**:
1. Clear temporary cart: `CartStore.clearTemporaryCart()`
2. Navigate to: `/order-confirmation?paymentId=pay_1234567890`
3. Display success page with order reference

**Use**:
- Verify payment signature with Razorpay
- Ensure payment wasn't tampered with
- Mark payment as verified in database

---

## Phase 3: ORDER CREATION (Backend - Automatic)

### Step 3.1: Webhook Trigger (payment.captured)
**Trigger**: Razorpay webhook fires when payment is captured

**Webhook Endpoint**: `POST /api/v1/payments/webhook`

**Webhook Payload**:
```javascript
{
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_1234567890",
        order_id: "order_1234567890",
        amount: 50000,
        status: "captured",
        created_at: 1234567890
      }
    }
  }
}
```

**Use**:
- Notify backend when payment is successfully captured
- Trigger order creation regardless of whether user closes browser

---

### Step 3.2: Create Order in MongoDB
**Location**: Backend (PaymentService → createFromPayment)

**Trigger**: Either from webhook OR from payment verification

**Process**:
```javascript
1. Receive Payment document from database
2. Check if order already exists (idempotent)
3. If not exists:
   - Fetch cart items from Cart collection
   - Fetch shipping address from Payment.shippingAddress
   - Create Order document:
     {
       orderNumber: "ORD-001",
       items: [
         { productId, name, quantity, price, total }
       ],
       shippingAddress: {
         fullName,
         phone,
         email,
         street,
         city,
         state,
         pincode
       },
       total: 50000,
       payment: payment._id,
       status: "pending",
       createdAt: timestamp
     }
   - Save to MongoDB Orders collection
```

**Order Document Stored**:
```javascript
{
  _id: ObjectId,
  orderNumber: "ORD-001",
  items: [
    {
      productId: ObjectId,
      name: "Rajhans CTC Tea",
      quantity: 2,
      price: 25000,
      total: 50000
    }
  ],
  shippingAddress: {
    fullName: "John Doe",
    phone: "9876543210",
    email: "john@example.com",
    street: "123 Street",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001"
  },
  total: 50000,
  payment: ObjectId(payment._id),
  status: "pending",
  shiprocket: null,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Use**:
- Create permanent record of customer order
- Link order to payment
- Store all necessary shipping information
- Make order available for admin fulfillment

---

### Step 3.3: Enqueue Fulfillment Job
**Location**: Backend (PaymentService)

**Action**: Add job to BullMQ fulfillment queue

**Job Details**:
```javascript
{
  jobName: "CREATE_ORDER",
  jobData: {
    paymentId: "payment_id",
    orderId: "order_id"
  },
  options: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
}
```

**Use**:
- Queue order for processing
- Ensure order is created even if direct API call fails
- Provide retry mechanism for resilience

---

## Phase 4: FULFILLMENT QUEUE PROCESSING

### Step 4.1: BullMQ Worker Processes Job
**Location**: Backend (FulfillmentWorker)

**Trigger**: Job enters fulfillment queue

**Worker Process**:
```javascript
1. Receive CREATE_ORDER job
2. Call createFromPayment() again
   - Checks if order exists (idempotent)
   - If exists, skip (order already created in Step 3.2)
   - If not exists, create it now
3. Update order status to "confirmed"
4. Mark job as complete
```

**Use**:
- Process order asynchronously
- Handle retries automatically
- Ensure order creation happens even if webhook fails

---

### Step 4.2: Order Status Updated
**Order State Change**: `pending` → `confirmed`

**MongoDB Update**:
```javascript
db.orders.updateOne(
  { _id: orderId },
  {
    $set: {
      status: "confirmed",
      updatedAt: new Date()
    }
  }
)
```

**Use**:
- Mark order as ready for shipment
- Make order visible on admin "Ready to Ship" page

---

## Phase 5: CUSTOMER SEES ORDER CONFIRMATION

### Step 5.1: Order Confirmation Page
**Location**: Frontend (`/order-confirmation?paymentId=pay_xxx`)

**Frontend Actions**:
```javascript
1. Extract paymentId from query param
2. Wait 2.5 seconds (allow BullMQ to process)
3. Call orderStore.loadOrders(1)
   - GET /api/v1/orders?page=1&limit=1
4. Poll for 8 seconds until order appears
5. Display order details when found
```

**GET /api/v1/orders Response**:
```javascript
{
  success: true,
  data: [
    {
      _id: ObjectId,
      orderNumber: "ORD-001",
      items: [...],
      shippingAddress: {...},
      total: 50000,
      status: "confirmed",
      createdAt: timestamp
    }
  ],
  meta: {
    page: 1,
    limit: 1,
    total: 1
  }
}
```

**Confirmation Page Display**:
```
✅ Payment Successful!
Thank You For Your Order

Order Number: ORD-001
Total: ₹500
Status: Confirmed

[View My Orders] [Continue Shopping]
```

**Use**:
- Confirm to customer their order was received
- Show order number for reference
- Allow customer to track order

---

## Phase 6: ADMIN CREATES SHIPMENT

### Step 6.1: Admin Navigates to Ready to Ship
**Location**: Frontend (`/admin/shipments/ready-to-ship`)

**API Call**: `GET /api/v1/admin/orders?status=confirmed`

**Response**:
```javascript
{
  success: true,
  data: [
    {
      _id: ObjectId,
      orderNumber: "ORD-001",
      total: 50000,
      items: [...],
      shippingAddress: {...},
      status: "confirmed",
      shiprocket: null
    }
  ],
  meta: {
    page: 1,
    total: 1,
    totalPages: 1
  }
}
```

**Display**: Table showing all confirmed orders with "Ship Now" buttons

**Use**:
- Show admin all orders ready for shipment
- Enable admin to initiate fulfillment

---

### Step 6.2: Admin Clicks "Ship Now" on Order
**Location**: Frontend (Ready to Ship component)

**Action**: Modal opens asking for:
- Pickup Location (dropdown)
- Courier (optional - auto-assign if not selected)

**Use**:
- Collect warehouse/pickup location
- Allow custom courier selection

---

### Step 6.3: Create Shipment API Call
**Endpoint**: `POST /api/v1/admin/shipments/create`

**Request**:
```javascript
{
  orderId: ObjectId,
  pickupLocationId: "warehouse-1",
  courierChoice: "delhivery"  // optional
}
```

**Use**:
- Initiate shipment creation process
- Link order to shipment

---

## Phase 7: SHIPROCKET INTEGRATION

### Step 7.1: Authenticate with Shiprocket
**Shiprocket Endpoint**: `POST https://apiv2.shiprocket.in/v1/auth/login`

**Request**:
```javascript
{
  email: "your-shiprocket-email@example.com",
  password: "your-shiprocket-password"
}
```

**Response**:
```javascript
{
  token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  expires_in: 777600,
  message: "Token generated successfully"
}
```

**Stored**: Token cached in backend for subsequent requests

**Use**:
- Get authorization token for all Shiprocket API calls
- Token valid for ~9 days, auto-refreshes

---

### Step 7.2: Create Order in Shiprocket
**Shiprocket Endpoint**: `POST https://apiv2.shiprocket.in/v1/orders/create`

**Request** (transformed from Order):
```javascript
{
  order_id: "ORD-001",
  order_date: "2026-05-12 10:30:00",
  pickup_location: "Main Warehouse",
  
  // Billing Details
  billing_customer_name: "John Doe",
  billing_address: "123 Street",
  billing_city: "Mumbai",
  billing_pincode: "400001",
  billing_state: "Maharashtra",
  billing_country: "India",
  billing_phone: "9876543210",
  billing_email: "john@example.com",
  
  // Order Items
  order_items: [
    {
      name: "Rajhans CTC Tea",
      sku: "TEA-001",
      units: 2,
      selling_price: 25000,
      discount: 0,
      tax: 0,
      hsn_code: "0902"
    }
  ],
  
  // Pricing
  payment_method: "Prepaid",
  sub_total: 50000,
  length: 20,
  breadth: 15,
  height: 10,
  weight: 0.5
}
```

**Response**:
```javascript
{
  success: true,
  order_id: 123456789,        // Shiprocket's order ID
  shipment_id: 987654321,
  message: "Order created successfully"
}
```

**Stored in MongoDB Order**:
```javascript
{
  shiprocket: {
    orderId: 123456789,
    shipmentId: 987654321,
    status: "CREATED"
  }
}
```

**Use**:
- Create order in Shiprocket system
- Get shipment ID for subsequent operations
- Establish link between our order and Shiprocket shipment

---

### Step 7.3: Assign AWB and Courier
**Shiprocket Endpoint**: `POST https://apiv2.shiprocket.in/v1/courier/assign/awb`

**Request**:
```javascript
{
  shipment_id: 987654321,
  courier_id: 1,              // Delhivery courier ID
  is_active: 1
}
```

**Response**:
```javascript
{
  success: true,
  response: {
    data: {
      awb_code: "DL123456789",
      courier_name: "Delhivery",
      courier_company_id: 1,
      shipment_id: 987654321
    }
  }
}
```

**Stored in MongoDB Order**:
```javascript
{
  shiprocket: {
    orderId: 123456789,
    shipmentId: 987654321,
    awbCode: "DL123456789",
    courierName: "Delhivery",
    status: "ASSIGNED"
  }
}
```

**Use**:
- Assign courier to shipment
- Get AWB (Air Way Bill) code for tracking
- Enable customer to track package

---

### Step 7.4: Generate Shipping Label (Optional)
**Shiprocket Endpoint**: `POST https://apiv2.shiprocket.in/v1/courier/generate/label`

**Request**:
```javascript
{
  shipment_id: 987654321
}
```

**Response**:
```javascript
{
  success: true,
  label_url: "https://shiprocket.co/labels/DL123456789.pdf",
  message: "Label generated successfully"
}
```

**Use**:
- Generate shipping label PDF
- Print and attach to package
- Enable Delhivery to pickup package

---

### Step 7.5: Schedule Pickup (Optional)
**Shiprocket Endpoint**: `POST https://apiv2.shiprocket.in/v1/courier/generate/pickup`

**Request**:
```javascript
{
  shipment_id: 987654321,
  pickup_date: "2026-05-13"
}
```

**Response**:
```javascript
{
  success: true,
  pickup_scheduled: true,
  pickup_date: "2026-05-13",
  pickup_time_slot: "09:00 AM - 05:00 PM"
}
```

**Use**:
- Schedule courier pickup from warehouse
- Delhivery will arrive on specified date
- Package picked up and sent to distribution center

---

## Phase 8: SHIPMENT TRACKING

### Step 8.1: Track Shipment Status (Real-time)
**Shiprocket Endpoint**: `GET https://apiv2.shiprocket.in/v1/courier/track/shipment/{shipment_id}`

**Request**:
```
GET /v1/courier/track/shipment/987654321
Authorization: Bearer {token}
```

**Response**:
```javascript
{
  shipments: [
    {
      id: 987654321,
      order_id: "ORD-001",
      awb_code: "DL123456789",
      status: "in_transit",
      courier_name: "Delhivery",
      tracking_data: {
        track_url: "https://track.delhivery.com/DL123456789",
        events: [
          {
            location: "Mumbai DC",
            status: "in_transit",
            timestamp: "2026-05-13 02:30:00",
            description: "Package in transit"
          },
          {
            location: "Main Warehouse",
            status: "picked_up",
            timestamp: "2026-05-13 01:00:00",
            description: "Package picked up"
          }
        ]
      }
    }
  ]
}
```

**Frontend Display** (Customer Dashboard):
```
Order #ORD-001
Status: In Transit 📦
AWB: DL123456789

Tracking Updates:
✓ Picked Up - May 13, 1:00 AM
  Location: Main Warehouse
  
→ In Transit - May 13, 2:30 AM
  Location: Mumbai DC
  
○ Out for Delivery - Pending
○ Delivered - Pending

[View Full Tracking →](https://track.delhivery.com/DL123456789)
```

**Use**:
- Provide real-time tracking to customer
- Show delivery progress
- Update status automatically

---

### Step 8.2: Order Status Updated During Transit
**MongoDB Update** (triggered by webhook from Shiprocket):
```javascript
db.orders.updateOne(
  { _id: orderId },
  {
    $set: {
      status: "shipped",
      "shiprocket.trackingUrl": "https://track.delhivery.com/DL123456789",
      "shiprocket.trackingEvents": [...]
    }
  }
)
```

**Use**:
- Keep customer's view up-to-date
- Store tracking history for reference

---

## Phase 9: DELIVERY CONFIRMATION

### Step 9.1: Package Out for Delivery
**Shiprocket Webhook**: `shipment.out_for_delivery`

**Payload**:
```javascript
{
  event: "shipment.out_for_delivery",
  shipment_id: 987654321,
  awb_code: "DL123456789",
  status: "out_for_delivery",
  timestamp: "2026-05-14 08:00:00",
  location: "Mumbai"
}
```

**MongoDB Update**:
```javascript
{
  status: "out_for_delivery",
  "shiprocket.lastUpdateAt": "2026-05-14 08:00:00"
}
```

**Use**:
- Notify customer package is arriving today
- Update tracking status in real-time

---

### Step 9.2: Package Delivered
**Shiprocket Webhook**: `shipment.delivered`

**Payload**:
```javascript
{
  event: "shipment.delivered",
  shipment_id: 987654321,
  awb_code: "DL123456789",
  status: "delivered",
  delivered_at: "2026-05-14 03:30:00 PM",
  delivery_location: "Customer Address",
  signature: "John Doe"
}
```

**MongoDB Update**:
```javascript
db.orders.updateOne(
  { _id: orderId },
  {
    $set: {
      status: "delivered",
      "shiprocket.deliveredAt": "2026-05-14 03:30:00 PM",
      "shiprocket.signedBy": "John Doe"
    }
  }
)
```

**Frontend Display** (Customer Dashboard):
```
Order #ORD-001 ✅ DELIVERED

Delivered on: May 14, 3:30 PM
Signed by: John Doe
Location: 123 Street, Mumbai

✓ Order Confirmed
✓ Payment Captured
✓ Shipped
✓ In Transit
✓ Delivered

[Leave Review] [Order Again]
```

**Use**:
- Confirm successful delivery to customer
- Complete order lifecycle
- Enable customer feedback

---

### Step 9.3: Customer Receives and Confirms
**Action**: Customer receives package and confirms in app (optional)

**Frontend**: Click "Mark as Received"

**MongoDB Update**:
```javascript
{
  status: "received",
  receivedAt: new Date(),
  receivedNotes: "Package received in good condition"
}
```

**Use**:
- Final confirmation order journey is complete
- Collect customer feedback on delivery experience

---

## Complete API Map

| Phase | System | Endpoint | Method | Purpose |
|-------|--------|----------|--------|---------|
| 1.1-1.3 | Frontend | - | - | Cart & Address Review |
| 2.1 | Backend | `/api/v1/payments/orders` | POST | Create Razorpay order |
| 2.2-2.3 | Razorpay | `https://razorpay.com/checkout` | Modal | Payment processing |
| 2.4 | Backend | `/api/v1/payments/verify` | POST | Verify payment signature |
| 3.1 | Razorpay | Webhook | POST | Payment captured notification |
| 3.2 | Backend | - | - | Create order in MongoDB |
| 3.3 | Backend | - | - | Enqueue BullMQ job |
| 4.1-4.2 | Backend | - | - | Process fulfillment queue |
| 5.1 | Backend | `/api/v1/orders` | GET | Fetch customer orders |
| 6.1 | Backend | `/api/v1/admin/orders?status=confirmed` | GET | List ready-to-ship orders |
| 6.3 | Backend | `/api/v1/admin/shipments/create` | POST | Create shipment |
| 7.1 | Shiprocket | `/v1/auth/login` | POST | Authenticate |
| 7.2 | Shiprocket | `/v1/orders/create` | POST | Create order in Shiprocket |
| 7.3 | Shiprocket | `/v1/courier/assign/awb` | POST | Assign courier & AWB |
| 7.4 | Shiprocket | `/v1/courier/generate/label` | POST | Generate shipping label |
| 7.5 | Shiprocket | `/v1/courier/generate/pickup` | POST | Schedule pickup |
| 8.1 | Shiprocket | `/v1/courier/track/shipment/{id}` | GET | Get tracking updates |
| 9.1-9.2 | Shiprocket | Webhook | POST | Delivery status updates |
| 9.3 | Backend | `/api/v1/orders/{id}/mark-received` | PATCH | Confirm receipt |

---

## Data Flow Diagram

```
CUSTOMER                          BACKEND                       SHIPROCKET
    │                              │                                 │
    │──── Cart Items ──────────────>│                                 │
    │                              │                                 │
    │──── Shipping Address ──────>│                                 │
    │                              │                                 │
    │──── PAY NOW ───────────────>│                                 │
    │         (Create Razorpay order)                               │
    │                              │─ POST /auth/login ────────────>│
    │                              │<────────── Bearer Token ───────│
    │<──── Razorpay Modal ────────│                                 │
    │  [Enter Card Details]        │                                 │
    │                              │                                 │
    │──── Payment Confirmation ───>│                                 │
    │                              │─ Verify Signature              │
    │                              │                                 │
    │<──── Success Page ───────────│                                 │
    │  (Order Confirmation)        │                                 │
    │                              │─ POST /orders/create ─────────>│
    │                              │<────── Shipment ID ────────────│
    │                              │                                 │
    │                              │─ POST /courier/assign/awb ────>│
    │                              │<────── AWB Code ───────────────│
    │<──── Tracking Page ────────────── GET /track/shipment ───────>│
    │  [Real-time Updates]         │<──── Tracking Events ──────────│
    │                              │                                 │
    │<──── DELIVERED ─────────────────── Webhook Notification ─────│
```

---

## Key Observations

### 1. **Idempotent Order Creation**
- Order can be created from:
  - Payment verification API (Step 2.4)
  - Webhook handler (Step 3.1)
  - BullMQ worker retry (Step 4.1)
- System checks if order exists before creating (idempotent guard)
- Ensures no duplicate orders even with retries

### 2. **Asynchronous Processing**
- Order doesn't exist immediately after checkout
- 2-5 second delay for BullMQ to process
- Improves resilience: works even if browser closes

### 3. **Real-time Tracking**
- Shiprocket sends webhooks for status updates
- Backend stores tracking events
- Frontend polls or receives push notifications
- Customer always sees latest status

### 4. **Data Transformation**
- Order data in our format (MongoDB)
- Transformed to Shiprocket format (vendor-specific)
- Ensures compatibility across systems

### 5. **Error Handling**
- Payment fails → Order not created
- Shiprocket unavailable → Retry via BullMQ
- Pincode not serviceable → Show error to admin
- Courier not available → Auto-fallback or manual selection

---

## Timeline: Start to Finish

```
0:00 - Customer clicks "PAY NOW"
0:01 - Razorpay order created
0:02 - Payment modal opens
2:30 - Customer completes payment
2:31 - Signature verified, order created in MongoDB
2:32 - BullMQ job enqueued
3:00 - BullMQ processes job (idempotent check)
3:05 - Customer sees order on confirmation page

[Admin actions next day]
Day 1, 10:00 - Admin navigates to Ready to Ship
Day 1, 10:05 - Admin clicks "Ship Now"
Day 1, 10:06 - Shiprocket order created
Day 1, 10:07 - AWB assigned, label generated
Day 1, 11:00 - Pickup scheduled

[Courier delivery]
Day 2, 01:00 - Delhivery picks up from warehouse
Day 2, 02:30 - In transit to Mumbai DC
Day 3, 08:00 - Out for delivery
Day 3, 03:30 PM - ✅ Delivered to customer
```

---

## Summary

This complete flow ensures:
✅ Secure payment processing with Razorpay
✅ Reliable order creation (idempotent, resilient)
✅ Seamless Shiprocket integration
✅ Real-time tracking for customers
✅ Admin control over fulfillment
✅ Error handling at every step
✅ Professional delivery experience
