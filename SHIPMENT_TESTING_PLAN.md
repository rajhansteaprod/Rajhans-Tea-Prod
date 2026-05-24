# 📋 Shipment Workflow - End-to-End Manual Testing Plan

> **Log File Location:** `backend/logs/shipment.log`
>
> **Monitor Logs:** `tail -f backend/logs/shipment.log`

---

## **PHASE 1: Payment Verification & Order Creation**

### **Step 1.1: Trigger Payment Verification**

**Action:**
```
POST /api/payments/verify
{
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx", 
  "razorpaySignature": "sig_xxx"
}
```

**Expected Logs in shipment.log:**
```
❌ NO LOGS YET (Payment happens in payment.log)
```

**Expected Response:**
```json
{
  "paymentId": "64abc123...",
  "status": "captured"
}
```

**✅ If Success:** Go to Step 1.2  
**❌ If Fails:** 
- Check payment signature verification
- Verify Razorpay credentials in `.env`

---

### **Step 1.2: Check CREATE_ORDER Job Queued**

**Action:**
```
Wait 2-3 seconds for job processing
```

**Check Logs:**
```bash
tail -f backend/logs/shipment.log | grep "CREATE_ORDER\|SHIP_ORDER"
```

**Expected Logs:**
```
[timestamp] ▶ Processing CREATE_ORDER job
[timestamp] ✓ Order found
[timestamp] ▶ SHIP_ORDER auto-queued
```

**✅ If Logs Appear:** SHIP_ORDER should start processing  
**❌ If No Logs:**
- Check BullMQ connection: `redis-cli PING`
- Check fulfillment queue: `redis-cli LLEN fulfillment`
- Check worker status in console

---

## **PHASE 2: Order Shipping via Shiprocket**

### **Step 2.1: Wait for SHIP_ORDER Processing**

**Action:**
```
Wait 3-5 seconds
```

**Check Logs:**
```bash
grep "SHIP_ORDER\|shipOrder" backend/logs/shipment.log
```

**Expected Logs:**
```
[timestamp] ▶ Processing SHIP_ORDER job
[timestamp] 📤 Calling orderService.shipOrder()
[timestamp] ✅ Order shipped via Shiprocket
[timestamp] 📋 Creating shipment tracking document
```

**✅ If All Present:** Order shipped successfully to Shiprocket  
**❌ If Missing:**

**Debug Points:**
```bash
# Check Shiprocket credentials
grep "SHIPROCKET_EMAIL\|SHIPROCKET_PASSWORD" .env

# Check order exists in DB
mongo
> db.orders.findOne({"orderNumber": "ORD-xxx"})

# Check fulfillment error logs
grep "❌" backend/logs/shipment.log | tail -20
```

---

## **PHASE 3: Shipment Document Creation**

### **Step 3.1: Verify Shipment Document Created**

**Check Logs:**
```bash
grep "Starting shipment creation\|Shipment document created" backend/logs/shipment.log
```

**Expected Logs:**
```
[timestamp] ▶ Starting shipment creation from order
[timestamp] ✓ Order found
[timestamp] ✓ Warehouse found
[timestamp] 📦 Creating shipment with order data
[timestamp] 💾 Creating shipment in DB
[timestamp] ✅ Shipment document created successfully
```

**Log Details Should Include:**
```
shipmentId: 507f1f77bcf86cd799439011
orderId: 507f1f77bcf86cd799439012
awbCode: SHP123456789
courierName: Delhivery
pickupDate: 2026-05-24T10:30:00Z
```

**✅ If All Present:** Shipment document created successfully  
**❌ If Missing:**

**Debug Points:**
```bash
# Check shipment in DB
mongo
> db.shipments.findOne({"orderId": ObjectId("...")})

# Check warehouse data
mongo
> db.warehouses.findOne()

# Check Order shiprocket data
mongo
> db.orders.findOne({"_id": ObjectId("...")})
  .shiprocket
```

---

## **PHASE 4: Webhook Handling & Tracking Events**

### **Step 4.1: Simulate Shiprocket Webhook**

**Action:**
```bash
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_webhook_token" \
  -d '{
    "order_id": "ORD-xxx",
    "current_status": "PICKED UP",
    "awb": "SHP123456789",
    "courier_name": "Delhivery",
    "location": "Delhi Hub",
    "remark": "Package picked up from warehouse"
  }'
```

**Expected Response:**
```json
{ "status": "ok" }
```

**Check Logs:**
```bash
grep "Shiprocket webhook\|Order status updated\|Tracking event" backend/logs/shipment.log
```

**Expected Logs:**
```
[timestamp] 🔔 Shiprocket webhook received
[timestamp] ✓ Webhook token verified
[timestamp] 📦 Webhook payload
[timestamp] ✓ Order found
[timestamp] 📝 Updating order status
[timestamp] ✅ Order status updated
[timestamp] 📍 Updating tracking info
[timestamp] ✅ Tracking info updated
[timestamp] ✓ Found shipment document
[timestamp] ➕ Adding tracking event
[timestamp] ✅ Tracking event added to shipment
[timestamp] ✅ Webhook processed successfully
```

**✅ If All Present:** Webhook processed, events added  
**❌ If Missing:**

**Debug Points:**
```bash
# Check webhook token
grep "SHIPROCKET_WEBHOOK_TOKEN" .env

# Verify shipment events added
mongo
> db.shipments.findOne({}).events

# Check Order status
mongo
> db.orders.findOne({"_id": ObjectId("...")}).status
> db.orders.findOne({"_id": ObjectId("...")}).statusHistory
```

---

### **Step 4.2: Test Multiple Webhook Events**

**Action:**
Send multiple webhooks simulating delivery journey:

```bash
# Event 1: IN TRANSIT
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -H "x-api-key: your_webhook_token" \
  -d '{"order_id": "ORD-xxx", "current_status": "IN TRANSIT", "location": "Mumbai Hub"}'

# Event 2: OUT FOR DELIVERY
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -d '{"order_id": "ORD-xxx", "current_status": "OUT FOR DELIVERY", "location": "Delivery Agent"}'

# Event 3: DELIVERED
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -d '{"order_id": "ORD-xxx", "current_status": "DELIVERED", "location": "Customer"}'
```

**Check Logs After Each:**
```bash
tail -f backend/logs/shipment.log | grep -E "webhook|event"
```

**Expected Pattern:**
```
Each webhook should show:
  ✓ Token verified
  ✓ Order found
  ✅ Order status updated
  ✅ Tracking event added
  ✅ Webhook processed
```

**✅ If Pattern Consistent:** All events processing correctly  
**❌ If Any Missing:**
- Check webhook payload format
- Verify order exists in DB
- Check shipment document exists

---

## **PHASE 5: Customer Tracking API**

### **Step 5.1: Get Shipment Tracking Details**

**Action:**
```bash
curl -X GET http://localhost:3000/api/inventory/orders/user/{orderId}/shipment \
  -H "Authorization: Bearer {customer_token}"
```

**Expected Response:**
```json
{
  "orderNumber": "ORD-20260524-001",
  "status": "delivered",
  "shipment": {
    "_id": "507f1f77bcf86cd799439011",
    "awbCode": "SHP123456789",
    "courierName": "Delhivery",
    "trackingUrl": "https://track.delhivery.com/...",
    "status": "delivered",
    "pickupScheduledDate": "2026-05-24T10:00:00Z",
    "estimatedDeliveryDate": "2026-05-26T18:00:00Z",
    "events": [
      {
        "status": "picked_up",
        "timestamp": "2026-05-24T10:30:00Z",
        "location": "Delhi Hub",
        "note": "PICKED UP: Package picked up from warehouse"
      },
      {
        "status": "in_transit",
        "timestamp": "2026-05-24T15:00:00Z",
        "location": "Mumbai Hub",
        "note": "IN TRANSIT"
      },
      {
        "status": "out_for_delivery",
        "timestamp": "2026-05-26T08:00:00Z",
        "location": "Delivery Agent",
        "note": "OUT FOR DELIVERY"
      },
      {
        "status": "delivered",
        "timestamp": "2026-05-26T17:30:00Z",
        "location": "Customer",
        "note": "DELIVERED"
      }
    ]
  }
}
```

**Check Logs:**
```bash
grep "Fetching shipment tracking\|Shipment tracking returned" backend/logs/shipment.log
```

**Expected Logs:**
```
[timestamp] ▶ Fetching shipment tracking for customer
[timestamp] ✓ Order ownership verified
[timestamp] 🔍 Searching for shipment document
[timestamp] ✓ Shipment document found
[timestamp] ✅ Shipment tracking returned to customer
```

**✅ If Response Complete with Events:** Full tracking available  
**❌ If Missing Events:**
- Check webhooks were actually processed
- Verify events in Shipment document: `db.shipments.findOne({}).events`

---

## **PHASE 6: Error Scenarios & Recovery**

### **Scenario 6.1: Invalid Webhook Token**

**Action:**
```bash
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -H "x-api-key: WRONG_TOKEN" \
  -d '{...}'
```

**Expected:**
- HTTP 400 response
- Log: `❌ Invalid webhook token`

**✅ If Logged & Rejected:** Security working  
**❌ If Accepted:** Check webhook token validation

---

### **Scenario 6.2: Webhook for Non-existent Order**

**Action:**
```bash
curl -X POST http://localhost:3000/api/inventory/webhooks/shiprocket \
  -H "x-api-key: correct_token" \
  -d '{"order_id": "NONEXISTENT", "current_status": "PICKED UP"}'
```

**Expected Logs:**
```
🔔 Shiprocket webhook received
✓ Webhook token verified
⚠ Order not found
✅ Webhook processed successfully
```

**✅ If Gracefully Handled:** Webhook idempotent  
**❌ If Error:** Check order lookup logic

---

### **Scenario 6.3: Shipment Not Found**

**Action:**
```
Try to get shipment tracking for order without shipment created
```

**Expected Response:**
```json
{
  "orderNumber": "ORD-xxx",
  "status": "confirmed",
  "shipment": null,
  "message": "Shipment not yet created for this order"
}
```

**Expected Logs:**
```
⚠ Shipment document not found
```

**✅ If Graceful Response:** Good error handling  
**❌ If Error:** Check shipment lookup

---

## **Complete Log Checklist**

### **All Phases Success Indicators:**

```bash
# Count success indicators
grep "✅" backend/logs/shipment.log | wc -l

# Should see approximately:
# Phase 1: 2 logs (Order creation)
# Phase 2: 4 logs (Shipping)
# Phase 3: 2 logs (Shipment creation)
# Phase 4: 8+ logs (Webhook + events)
# Phase 5: 2 logs (Tracking API)
# = ~18+ total ✅ logs for full flow
```

---

## **Quick Debugging Commands**

```bash
# Monitor all shipment logs in real-time
tail -f backend/logs/shipment.log

# Filter by status
grep "✅" backend/logs/shipment.log  # Success
grep "❌" backend/logs/shipment.log  # Errors
grep "⚠" backend/logs/shipment.log   # Warnings

# Check specific phase
grep "SHIP_ORDER" backend/logs/shipment.log
grep "webhook" backend/logs/shipment.log
grep "Tracking event" backend/logs/shipment.log

# Database verification
mongo
> db.shipments.find()           # All shipments
> db.shipments.findOne().events # Events for one shipment
> db.orders.findOne().status    # Order status
```

---

## **Testing Workflow**

```
PHASE 1 ✓ → PHASE 2 ✓ → PHASE 3 ✓ → PHASE 4 ✓ → PHASE 5 ✓
   ↓          ↓           ↓          ↓           ↓
 Logs OK   Logs OK      Logs OK    Logs OK     Logs OK
   ✅         ✅           ✅         ✅          ✅

If ANY phase fails:
  1. Check logs in shipment.log
  2. Use debug commands above
  3. Fix issue
  4. Re-test from that phase
```

---

**Ready for testing? Start with PHASE 1!** 🚀
