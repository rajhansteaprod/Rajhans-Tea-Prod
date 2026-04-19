# Shiprocket API Quick Reference Card

## Base URL
```
https://apiv2.shiprocket.in/v1
```

## All Requests Require
```
Header: Authorization: Bearer {token}
Header: Content-Type: application/json
```

---

## 1️⃣ Authentication
```
POST /auth/login
Body: { email, password }
Returns: { token, expires_in: 864000 }
Token lifespan: 10 days (refresh at 9 days)
```

---

## 2️⃣ Create Shipment (Most Important)
```
POST /orders/create
Body: {
  order_id*,
  order_date*,
  pickup_location*,
  billing_customer_name*,
  billing_last_name,
  billing_address*,
  billing_city*,
  billing_pincode*,
  billing_state*,
  billing_country*,
  billing_phone*,
  shipping_is_billing: true,
  order_items*: [
    { name*, sku*, units*, selling_price* }
  ],
  payment_method: "Prepaid",
  sub_total*,
  length, breadth, height, weight
}
Returns: { order_id, shipment_id }
Error 400: Missing required fields or invalid pincode
```

---

## 3️⃣ Assign Courier & Get AWB
```
POST /courier/assign/awb
Body: {
  shipment_id*,
  courier_id  // Optional: 1=Delhivery, 2=FedEx, 3=DHL
}
Returns: {
  response: {
    data: {
      awb_code,
      courier_name,
      courier_company_id
    }
  }
}
Error 400: Invalid shipment ID or no couriers available
```

---

## 4️⃣ Track Shipment
```
GET /courier/track/shipment/{shipmentId}
Returns: {
  tracking_data: {
    shipment_status_id,
    shipment_status,
    track_url,
    etd,
    shipment_track_activities: [
      { date, location, activity }
    ]
  }
}
Error 404: Shipment not found
```

---

## 5️⃣ Generate AWB Label
```
POST /courier/generate/label
Body: { shipment_id: [id] }
Returns: { label_url }
Error 404: Shipment not found
Note: Only works after courier assignment
```

---

## 6️⃣ Schedule Pickup
```
POST /courier/generate/pickup
Body: { shipment_id: [id] }
Returns: {
  response: {
    pickup_scheduled_date
  }
}
Error 404: Shipment not found
```

---

## 7️⃣ Get Available Couriers & Rates
```
GET /courier/serviceability/?pickup_postcode=400001&delivery_postcode=560001&weight=0.5&cod=0
Returns: {
  data: {
    available_courier_companies: [
      {
        courier_company_id,
        courier_name,
        rate,
        estimated_delivery_days,
        cod
      }
    ]
  }
}
Empty array: No couriers available for route
```

---

## 8️⃣ Cancel Order
```
POST /orders/cancel
Body: { ids: [order_id1, order_id2] }
Returns: { status: "success" }
Error 404: Order not found
```

---

## Status Codes Reference

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | ✅ Continue |
| 400 | Bad Request | ❌ Check request body |
| 401 | Unauthorized | 🔑 Refresh token |
| 404 | Not Found | 🔍 Verify IDs |
| 500 | Server Error | ⚠️ Retry or escalate |

---

## Common Error Messages

```
"Pickup location not found"
→ Wrong warehouse ID, check Shiprocket warehouse mapping

"Delivery Pincode is not serviceable"
→ Pincode not covered by any courier, show to user

"No couriers available"
→ No couriers for route, suggest alternative pincodes

"Shipment already exists"
→ Can't create duplicate, check if already created

"Invalid auth token"
→ Token expired, refresh it

"Order already shipped"
→ Can't cancel, shipment already in transit
```

---

## Test Data

### Test Pincodes (Always Serviceable)
- Pickup: `400001` (Mumbai)
- Delivery: `560001` (Bangalore)

### Test Pincodes (Unserviceable)
- Delivery: `000000` (Invalid)

### Test Couriers
- Delhivery: `1`
- FedEx: `2`
- DHL: `3`

---

## Implementation Checklist

- [ ] Store Shiprocket email/password in `.env`
- [ ] Initialize provider: `new ShiprocketProvider()`
- [ ] Get token on first call, cache for 9 days
- [ ] Call createOrder() with pickup location
- [ ] Call generateAWB() to assign courier
- [ ] Save order_id & shipment_id in database
- [ ] Handle all error codes gracefully
- [ ] Log all API calls for debugging
- [ ] Monitor token expiry time

---

## Code Examples

### Node.js Fetch
```javascript
const token = await getToken();
const res = await fetch('https://apiv2.shiprocket.in/v1/orders/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ order_id, order_date, ... })
});
const data = await res.json();
```

### Our ShiprocketService
```typescript
const result = await shiprocketService.createShipment({
  orderId: '123',
  pickupLocationId: 'warehouse-1',
  courierId: 1
});
// Returns: { shipmentId, awbCode, courierName, ... }
```

### Error Handling
```javascript
try {
  const result = await shiprocketService.createShipment(data);
  return { success: true, data: result };
} catch (error) {
  // Error already logged by provider
  return { success: false, error: error.message };
}
```

---

## Monitoring & Debugging

### Enable Logs
```bash
export DEBUG=shiprocket:*
export LOG_LEVEL=debug
```

### Check Token Cache
```javascript
// Token is cached in memory with 9-day expiry
// Auto-refreshes on first call after expiry
console.log(`Token expires at: ${this.tokenExpiry}`);
```

### Test Single Endpoint
```bash
curl -X POST https://apiv2.shiprocket.in/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"password"}'
```

---

## Performance Tips

1. **Batch Operations**: Use bulk endpoint for multiple orders
2. **Caching**: Token is cached for 9 days
3. **Concurrency**: Create shipments in parallel for bulk orders
4. **Retry Logic**: Retry on 5xx errors (3 times with backoff)
5. **Webhook**: Use webhooks for status updates instead of polling

---

## When to Use Each Endpoint

| Task | Endpoint |
|------|----------|
| Create single shipment | POST /orders/create |
| Create bulk shipments | POST /orders/create (loop) |
| Get AWB code | POST /courier/assign/awb |
| Track order | GET /courier/track/shipment/:id |
| Print label | POST /courier/generate/label |
| Schedule pickup | POST /courier/generate/pickup |
| Show rate options | GET /courier/serviceability/ |
| Cancel shipment | POST /orders/cancel |

---

## Shiprocket Dashboard Links

- **Prod Dashboard**: https://shiprocket.in
- **Tracking Page**: https://shiprocket.in/tracking/
- **API Docs**: https://apiv2.shiprocket.in/docs
- **Webhook Docs**: https://shiprocket.in/api-documentation/webhooks

---

## Emergency Contacts

- Shiprocket Support: support@shiprocket.in
- API Issues: api@shiprocket.in
- Account Issues: accounts@shiprocket.in

---

**Last Updated**: April 19, 2026  
**API Version**: v1  
**Status**: ✅ All endpoints tested and working
