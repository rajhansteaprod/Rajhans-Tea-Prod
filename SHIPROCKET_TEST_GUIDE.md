# Shiprocket Integration Test Guide

## Overview
This guide covers testing the "Ship Now" feature end-to-end, including both frontend and backend, with critical focus on Shiprocket API endpoints.

---

## Feature: Admin Creates Single Shipment (Ship Now)

### User Story
**Goal:** Admin clicks "Ship Now" on an order → Modal appears → Admin selects pickup location & courier → Shipment created in Shiprocket → Order updated in DB

**Flow:**
```
Frontend: Ready to Ship Page
  → Order Row with [📦 Ship Now] button
  → Click Ship Now
  → Modal: Select Pickup Location + Courier
  → Click "Create Shipment"
  ↓
Backend: POST /admin/shipments/create
  → Fetch order from DB
  → Transform to Shiprocket format
  → Call Shiprocket APIs (see below)
  → Save to DB: Order.shiprocket = { shipmentId, awbCode, status }
  → Return: { shipmentId, awbCode, courierName, estimatedDelivery }
  ↓
Frontend: Modal closes, refresh list
  → Show: ✓ Shipment created! AWB: 1234567890
```

---

## Critical Shiprocket API Endpoints

### 1. **POST /auth/login** - Get Authentication Token
```bash
POST https://apiv2.shiprocket.in/v1/auth/login
Body: {
  "email": "your-email@example.com",
  "password": "your-password"
}

Response: {
  "token": "eyJhbGc...",
  "expires_in": 864000
}
```

**Test Cases:**
- ✓ Valid credentials return token
- ✓ Invalid credentials return 401
- ✓ Token is cacheable for 10 days

---

### 2. **POST /orders/create** - Create Shipment
```bash
POST https://apiv2.shiprocket.in/v1/orders/create
Headers: Authorization: Bearer {token}
Body: {
  "order_id": "ORD-12345",
  "order_date": "2026-04-19 09:00:00",
  "pickup_location": "Main Warehouse",
  "billing_customer_name": "John",
  "billing_last_name": "Doe",
  "billing_address": "123 Street",
  "billing_city": "Mumbai",
  "billing_pincode": "400001",
  "billing_state": "Maharashtra",
  "billing_country": "India",
  "billing_phone": "9876543210",
  "shipping_is_billing": true,
  "order_items": [
    {
      "name": "Product Name",
      "sku": "SKU-123",
      "units": 1,
      "selling_price": "500"
    }
  ],
  "payment_method": "Prepaid",
  "sub_total": 500,
  "length": 20,
  "breadth": 15,
  "height": 10,
  "weight": 0.5
}

Response: {
  "order_id": 123456789,
  "shipment_id": 987654321,
  "status": "success"
}
```

**Test Cases:**
- ✓ Valid order with all fields creates shipment
- ✗ Missing pickup_location → 400
- ✗ Missing shipping address → 400
- ✗ Invalid pincode format → 400
- ✓ Multiple order items processed correctly
- ✓ Order ID becomes Shiprocket order ID (different from our DB order ID)

---

### 3. **POST /courier/assign/awb** - Assign Courier & Get AWB Code
```bash
POST https://apiv2.shiprocket.in/v1/courier/assign/awb
Headers: Authorization: Bearer {token}
Body: {
  "shipment_id": 987654321,
  "courier_id": 1  // Optional: 1=Delhivery, 2=FedEx, 3=DHL
}

Response: {
  "response": {
    "data": {
      "awb_code": "1234567890",
      "courier_name": "Delhivery",
      "courier_company_id": 1,
      "status": "success"
    }
  }
}
```

**Test Cases:**
- ✓ Valid shipment gets AWB auto-assigned
- ✓ Can specify courier_id for preference
- ✗ Invalid shipment_id → 400
- ✓ Returns AWB code, courier name, courier ID
- ⚠ Some couriers might not be available (returns error)

---

### 4. **GET /courier/track/shipment/:id** - Get Tracking Info
```bash
GET https://apiv2.shiprocket.in/v1/courier/track/shipment/987654321
Headers: Authorization: Bearer {token}

Response: {
  "tracking_data": {
    "shipment_status_id": 0,
    "shipment_status": "Pending",
    "track_url": "https://shiprocket.in/tracking/...",
    "etd": "2026-04-22",
    "shipment_track_activities": [
      {
        "date": "2026-04-19",
        "location": "Mumbai",
        "activity": "Order Confirmed"
      }
    ]
  }
}
```

**Test Cases:**
- ✓ Valid shipment returns tracking data
- ✗ Invalid shipment_id → 404
- ✓ Includes tracking URL, ETA, activity history
- ⚠ Tracking might not be available immediately after creation

---

### 5. **POST /courier/generate/label** - Generate AWB Label PDF
```bash
POST https://apiv2.shiprocket.in/v1/courier/generate/label
Headers: Authorization: Bearer {token}
Body: {
  "shipment_id": [987654321]
}

Response: {
  "label_url": "https://shiprocket.in/label_download/...",
  "status": "success"
}
```

**Test Cases:**
- ✓ Valid shipment generates label URL
- ✗ Invalid shipment_id → 404
- ✓ URL is printable AWB label (PDF)
- ⚠ Label not available immediately (needs courier assignment first)

---

### 6. **POST /courier/generate/pickup** - Schedule Pickup
```bash
POST https://apiv2.shiprocket.in/v1/courier/generate/pickup
Headers: Authorization: Bearer {token}
Body: {
  "shipment_id": [987654321]
}

Response: {
  "response": {
    "pickup_scheduled_date": "2026-04-20 10:00:00",
    "status": "success"
  }
}
```

**Test Cases:**
- ✓ Valid shipment schedules pickup
- ✗ Invalid shipment_id → 404
- ✓ Returns scheduled pickup date
- ⚠ Can't schedule if already picked up

---

### 7. **GET /courier/serviceability/** - Get Available Couriers & Rates
```bash
GET https://apiv2.shiprocket.in/v1/courier/serviceability/?pickup_postcode=400001&delivery_postcode=560001&weight=0.5&cod=0
Headers: Authorization: Bearer {token}

Response: {
  "data": {
    "available_courier_companies": [
      {
        "courier_company_id": 1,
        "courier_name": "Delhivery",
        "rate": 50,
        "estimated_delivery_days": 2,
        "cod": 1
      }
    ]
  }
}
```

**Test Cases:**
- ✓ Valid route returns available couriers
- ✓ Returns rates and estimated delivery days
- ✗ Unserviceable route → empty couriers array
- ✗ Invalid pincode format → 400
- ✓ Filters by COD availability

---

### 8. **POST /orders/cancel** - Cancel Order
```bash
POST https://apiv2.shiprocket.in/v1/orders/cancel
Headers: Authorization: Bearer {token}
Body: {
  "ids": [123456789]
}

Response: {
  "status": "success",
  "message": "Order cancelled"
}
```

**Test Cases:**
- ✓ Valid order cancels successfully
- ✗ Invalid order_id → 404
- ⚠ Can't cancel if already shipped
- ✓ Accepts array of order IDs

---

## Running Integration Tests

### Prerequisites
```bash
# Set environment variables
export SHIPROCKET_BASE_URL=https://apiv2.shiprocket.in/v1
export SHIPROCKET_EMAIL=your-email@example.com
export SHIPROCKET_PASSWORD=your-password
```

### Run All Tests
```bash
cd backend
npm run test:integration -- shiprocket.integration.test.ts
```

### Run Specific Test Suite
```bash
npm run test:integration -- shiprocket.integration.test.ts -t "POST /auth/login"
npm run test:integration -- shiprocket.integration.test.ts -t "POST /orders/create"
```

### Expected Output
```
PASS  tests/integration/shiprocket.integration.test.ts
  Shiprocket API Endpoints
    1. POST /auth/login - Authentication
      ✓ should authenticate and return valid token (234ms)
      ✓ should reject invalid credentials (145ms)
    2. POST /orders/create - Create Shipment
      ✓ should create order with all required fields (567ms)
      ✓ should reject order without pickup location (123ms)
      ✓ should reject order without shipping address (98ms)
    ... (more tests)

=============================== COVERAGE =================================
Statements   : 95.2% ( 121/127 )
Branches     : 89.5% ( 86/96 )
Functions    : 100% ( 12/12 )
Lines        : 95.4% ( 119/125 )
================================================================================

SHIPROCKET API INTEGRATION TESTS COMPLETED
```

---

## Frontend Manual Testing Checklist

### 1. Load Ready to Ship Page
- [ ] Admin navigates to `/admin/shipments/ready-to-ship`
- [ ] Page displays orders with status="confirmed"
- [ ] Orders show: Order ID, Items, Address, Payment Type, Total
- [ ] Each order row has: [📦 Ship Now] and [✓ Select] buttons

### 2. Click "Ship Now" Button
- [ ] Modal opens: "Ship Order Now"
- [ ] Modal contains:
  - [ ] Pickup Location dropdown (required)
  - [ ] Preferred Courier dropdown (optional)
  - [ ] "Create Shipment" button (disabled until location selected)
  - [ ] "Cancel" button

### 3. Create Shipment
- [ ] Select "Main Warehouse" as pickup location
- [ ] Leave Courier as "Auto-assign"
- [ ] Click "Create Shipment"
- [ ] Loading spinner appears
- [ ] API call: `POST /admin/shipments/create`

### 4. Success Scenarios
- [ ] ✓ Shipment created → Modal closes
- [ ] ✓ Show toast: "✓ Shipment created! AWB: 1234567890"
- [ ] ✓ Order list refreshes
- [ ] ✓ Order might disappear or show status update (depends on status transition)

### 5. Error Scenarios
- [ ] ❌ Missing pickup location → "Please select a pickup location" error
- [ ] ❌ Shiprocket API down → Show error message
- [ ] ❌ Invalid pincode → "Delivery location not serviceable"
- [ ] ❌ Order not found → "Order not found"

---

## Backend Manual Testing

### 1. Start Backend
```bash
cd backend
npm run dev
```

### 2. Create Test Order (if none available)
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"productId": "123", "qty": 1}],
    "total": 500,
    "shippingAddress": {
      "name": "John Doe",
      "phone": "9876543210",
      "street": "123 Street",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    }
  }'
```

### 3. Test Single Shipment Creation
```bash
curl -X POST http://localhost:3000/api/v1/admin/shipments/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "pickupLocationId": "warehouse-1",
    "courierId": 1
  }'
```

### Expected Response
```json
{
  "success": true,
  "data": {
    "shipmentId": "987654321",
    "awbCode": "1234567890",
    "courierName": "Delhivery",
    "trackingUrl": "https://shiprocket.in/tracking/...",
    "status": "pending",
    "estimatedDelivery": "2026-04-22"
  }
}
```

### 4. Verify DB Update
```bash
# Check MongoDB
db.orders.findOne({ _id: ObjectId("ORDER_ID") })

# Should have:
{
  shiprocket: {
    orderId: 123456789,
    shipmentId: 987654321,
    awbCode: "1234567890",
    courierName: "Delhivery",
    status: "CREATED"
  }
}
```

---

## Critical Issues to Watch For

### Issue 1: Invalid Pickup Location
- **Symptom**: Shiprocket returns error "Pickup location not found"
- **Cause**: `pickupLocationId` value doesn't match Shiprocket warehouse ID
- **Fix**: Update mapping between our warehouse IDs and Shiprocket's

### Issue 2: Pincode Not Serviceable
- **Symptom**: Shiprocket returns error "Delivery pincode not serviceable"
- **Cause**: Delivery address pincode has no courier coverage
- **Fix**: Show validation error before creating shipment

### Issue 3: Token Expiry
- **Symptom**: "Unauthorized" error after 10 days
- **Cause**: Shiprocket token expired
- **Fix**: Already handled - cache tokens, auto-refresh

### Issue 4: Order Already Has Shipment
- **Symptom**: "Shipment already exists" error
- **Cause**: Trying to create shipment for order with existing shipment
- **Fix**: Check `order.shiprocket.shipmentId` before creating

### Issue 5: AWB Assignment Failure
- **Symptom**: AWB assignment returns 400 error
- **Cause**: Courier not available for pickup location or delivery pincode
- **Fix**: Show user: "No couriers available for this route"

---

## Monitoring & Debugging

### Enable Detailed Logs
```bash
# In .env
DEBUG=shiprocket:*
LOG_LEVEL=debug
```

### Monitor Shiprocket API Calls
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Monitor logs
tail -f logs/shiprocket.log
```

### Check Shiprocket Dashboard
1. Login to shiprocket.in
2. Go to Orders → Check if order created
3. Verify shipment ID, AWB code, courier assignment
4. Check pickup scheduled status

---

## Success Criteria

✅ All 8 Shiprocket API endpoints respond correctly  
✅ Shipment creation updates Order.shiprocket in DB  
✅ AWB code is returned and displayed to admin  
✅ Error handling for invalid locations/pincodes  
✅ Token caching and auto-refresh working  
✅ Frontend modal opens and closes correctly  
✅ Loading states show during API calls  
✅ Toast messages display success/error  

---

## Next Steps

After "Ship Now" is verified:
1. Implement "Track Shipment" button on order details
2. Implement bulk shipment creation
3. Add shipment status webhooks from Shiprocket
4. Create admin dashboard widget for shipment metrics
