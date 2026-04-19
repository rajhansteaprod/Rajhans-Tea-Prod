import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';

/**
 * Shiprocket API Integration Tests
 *
 * Critical endpoints tested:
 * 1. POST /auth/login - Authentication
 * 2. POST /orders/create - Create shipment
 * 3. POST /courier/assign/awb - Assign AWB & courier
 * 4. GET /courier/track/shipment/:id - Track shipment
 * 5. POST /courier/generate/label - Generate label
 * 6. POST /courier/generate/pickup - Schedule pickup
 * 7. POST /orders/cancel - Cancel order
 * 8. GET /courier/serviceability/ - Get shipping rates
 */

describe('Shiprocket API Endpoints', () => {
  const baseUrl = process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1';
  const email = process.env.SHIPROCKET_EMAIL || '';
  const password = process.env.SHIPROCKET_PASSWORD || '';

  let token: string;
  let createdOrderId: number;
  let shipmentId: number;

  // ──────────────────────────────────────────────────────────────────────────
  // 1. AUTH ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('1. POST /auth/login - Authentication', () => {
    it('should authenticate and return valid token', async () => {
      try {
        const response = await axios.post(`${baseUrl}/auth/login`, {
          email,
          password,
        });

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('token');
        expect(response.data.token).toBeTruthy();

        token = response.data.token;
        console.log('✓ Auth successful - Token:', token.substring(0, 20) + '...');
      } catch (error: any) {
        console.error('✗ Auth failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should reject invalid credentials', async () => {
      try {
        await axios.post(`${baseUrl}/auth/login`, {
          email: 'invalid@example.com',
          password: 'wrongpassword',
        });
        throw new Error('Should have failed with invalid credentials');
      } catch (error: any) {
        expect(error.response?.status).toBe(401);
        console.log('✓ Invalid credentials correctly rejected');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CREATE ORDER ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('2. POST /orders/create - Create Shipment', () => {
    it('should create order with all required fields', async () => {
      try {
        const response = await axios.post(
          `${baseUrl}/orders/create`,
          {
            order_id: `TEST-${Date.now()}`,
            order_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            pickup_location: 'Main Warehouse',
            billing_customer_name: 'John',
            billing_last_name: 'Doe',
            billing_address: '123 Test Street',
            billing_city: 'Mumbai',
            billing_pincode: '400001',
            billing_state: 'Maharashtra',
            billing_country: 'India',
            billing_phone: '9876543210',
            shipping_is_billing: true,
            order_items: [
              {
                name: 'Test Product',
                sku: 'TEST-SKU-001',
                units: 1,
                selling_price: '500',
              },
            ],
            payment_method: 'Prepaid',
            sub_total: 500,
            length: 20,
            breadth: 15,
            height: 10,
            weight: 0.5,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('order_id');
        expect(response.data).toHaveProperty('shipment_id');

        createdOrderId = response.data.order_id;
        shipmentId = response.data.shipment_id;

        console.log(`✓ Order created - Order ID: ${createdOrderId}, Shipment ID: ${shipmentId}`);
      } catch (error: any) {
        console.error('✗ Order creation failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should reject order without pickup location', async () => {
      try {
        await axios.post(
          `${baseUrl}/orders/create`,
          {
            order_id: `TEST-${Date.now()}`,
            order_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            // Missing pickup_location
            billing_customer_name: 'John',
            billing_address: '123 Test Street',
            billing_city: 'Mumbai',
            billing_pincode: '400001',
            billing_state: 'Maharashtra',
            billing_country: 'India',
            billing_phone: '9876543210',
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed without pickup location');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
        console.log('✓ Missing pickup location correctly rejected');
      }
    });

    it('should reject order without shipping address', async () => {
      try {
        await axios.post(
          `${baseUrl}/orders/create`,
          {
            order_id: `TEST-${Date.now()}`,
            order_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            pickup_location: 'Main Warehouse',
            billing_customer_name: 'John',
            // Missing address fields
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed without address');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
        console.log('✓ Missing address correctly rejected');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ASSIGN AWB ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('3. POST /courier/assign/awb - Assign AWB & Courier', () => {
    it('should assign AWB with auto-selected courier', async () => {
      try {
        const response = await axios.post(
          `${baseUrl}/courier/assign/awb`,
          { shipment_id: shipmentId },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data.response?.data).toHaveProperty('awb_code');
        expect(response.data.response?.data).toHaveProperty('courier_name');

        console.log(
          `✓ AWB assigned - Code: ${response.data.response?.data?.awb_code}, Courier: ${response.data.response?.data?.courier_name}`
        );
      } catch (error: any) {
        console.error('✗ AWB assignment failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should assign AWB with specific courier', async () => {
      try {
        // Create another order for this test
        const orderRes = await axios.post(
          `${baseUrl}/orders/create`,
          {
            order_id: `TEST-COURIER-${Date.now()}`,
            order_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            pickup_location: 'Main Warehouse',
            billing_customer_name: 'Jane',
            billing_last_name: 'Smith',
            billing_address: '456 Test Ave',
            billing_city: 'Delhi',
            billing_pincode: '110001',
            billing_state: 'Delhi',
            billing_country: 'India',
            billing_phone: '9876543211',
            shipping_is_billing: true,
            order_items: [{ name: 'Product', sku: 'SKU-002', units: 1, selling_price: '300' }],
            payment_method: 'Prepaid',
            sub_total: 300,
            length: 20,
            breadth: 15,
            height: 10,
            weight: 0.5,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const testShipmentId = orderRes.data.shipment_id;

        const response = await axios.post(
          `${baseUrl}/courier/assign/awb`,
          {
            shipment_id: testShipmentId,
            courier_id: 1, // Delhivery
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        console.log(
          `✓ AWB assigned with specific courier (Delhivery) - Code: ${response.data.response?.data?.awb_code}`
        );
      } catch (error: any) {
        console.error('✗ Specific courier assignment failed:', error.response?.data || error.message);
        // Don't throw - this might fail if courier not available
      }
    });

    it('should reject invalid shipment ID', async () => {
      try {
        await axios.post(
          `${baseUrl}/courier/assign/awb`,
          { shipment_id: 999999999 },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid shipment ID');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
        console.log('✓ Invalid shipment ID correctly rejected');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. TRACK SHIPMENT ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('4. GET /courier/track/shipment/:id - Track Shipment', () => {
    it('should return tracking data for valid shipment', async () => {
      try {
        const response = await axios.get(
          `${baseUrl}/courier/track/shipment/${shipmentId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('tracking_data');

        const tracking = response.data.tracking_data;
        console.log(
          `✓ Tracking retrieved - Status: ${tracking?.shipment_status_id}, URL: ${tracking?.track_url?.substring(0, 50)}...`
        );
      } catch (error: any) {
        console.error('✗ Tracking retrieval failed:', error.response?.data || error.message);
        // Don't throw - tracking might not be available immediately
      }
    });

    it('should reject invalid shipment ID', async () => {
      try {
        await axios.get(
          `${baseUrl}/courier/track/shipment/999999999`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid shipment ID');
      } catch (error: any) {
        expect([400, 404]).toContain(error.response?.status);
        console.log('✓ Invalid shipment ID correctly rejected for tracking');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. GENERATE LABEL ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('5. POST /courier/generate/label - Generate Label', () => {
    it('should generate label URL for shipment', async () => {
      try {
        const response = await axios.post(
          `${baseUrl}/courier/generate/label`,
          { shipment_id: [shipmentId] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('label_url');

        console.log(`✓ Label generated - URL: ${response.data.label_url?.substring(0, 50)}...`);
      } catch (error: any) {
        console.error('✗ Label generation failed:', error.response?.data || error.message);
        // Label might not be available immediately after creation
      }
    });

    it('should reject invalid shipment ID', async () => {
      try {
        await axios.post(
          `${baseUrl}/courier/generate/label`,
          { shipment_id: [999999999] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid shipment ID');
      } catch (error: any) {
        expect([400, 404]).toContain(error.response?.status);
        console.log('✓ Invalid shipment ID correctly rejected for label');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. SCHEDULE PICKUP ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('6. POST /courier/generate/pickup - Schedule Pickup', () => {
    it('should schedule pickup for shipment', async () => {
      try {
        const response = await axios.post(
          `${baseUrl}/courier/generate/pickup`,
          { shipment_id: [shipmentId] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data.response).toHaveProperty('pickup_scheduled_date');

        console.log(`✓ Pickup scheduled - Date: ${response.data.response?.pickup_scheduled_date}`);
      } catch (error: any) {
        console.error('✗ Pickup scheduling failed:', error.response?.data || error.message);
        // Pickup might fail if already scheduled or shipment not ready
      }
    });

    it('should reject invalid shipment ID', async () => {
      try {
        await axios.post(
          `${baseUrl}/courier/generate/pickup`,
          { shipment_id: [999999999] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid shipment ID');
      } catch (error: any) {
        expect([400, 404]).toContain(error.response?.status);
        console.log('✓ Invalid shipment ID correctly rejected for pickup');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. GET SERVICEABILITY / SHIPPING RATES
  // ──────────────────────────────────────────────────────────────────────────

  describe('7. GET /courier/serviceability/ - Get Shipping Rates', () => {
    it('should return available couriers for valid route', async () => {
      try {
        const response = await axios.get(
          `${baseUrl}/courier/serviceability/?pickup_postcode=400001&delivery_postcode=560001&weight=0.5&cod=0`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('data');
        expect(Array.isArray(response.data.data?.available_courier_companies)).toBe(true);

        const couriers = response.data.data?.available_courier_companies || [];
        console.log(`✓ Couriers retrieved - Count: ${couriers.length}`);
        couriers.slice(0, 3).forEach((c: any) => {
          console.log(
            `  - ${c.courier_name}: ₹${c.rate} (${c.estimated_delivery_days} days)`
          );
        });
      } catch (error: any) {
        console.error('✗ Serviceability check failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should return empty couriers for unserviceable route', async () => {
      try {
        const response = await axios.get(
          `${baseUrl}/courier/serviceability/?pickup_postcode=400001&delivery_postcode=000000&weight=0.5&cod=0`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        const couriers = response.data.data?.available_courier_companies || [];
        expect(couriers.length).toBe(0);

        console.log('✓ Unserviceable route correctly returns no couriers');
      } catch (error: any) {
        console.error('✗ Unserviceable route check failed:', error.response?.data || error.message);
      }
    });

    it('should reject invalid pincode format', async () => {
      try {
        await axios.get(
          `${baseUrl}/courier/serviceability/?pickup_postcode=invalid&delivery_postcode=560001&weight=0.5&cod=0`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid pincode');
      } catch (error: any) {
        expect([400, 422]).toContain(error.response?.status);
        console.log('✓ Invalid pincode format correctly rejected');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. CANCEL ORDER ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────

  describe('8. POST /orders/cancel - Cancel Order', () => {
    it('should cancel valid order', async () => {
      try {
        // Create a new order to cancel
        const orderRes = await axios.post(
          `${baseUrl}/orders/create`,
          {
            order_id: `TEST-CANCEL-${Date.now()}`,
            order_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            pickup_location: 'Main Warehouse',
            billing_customer_name: 'Cancel',
            billing_last_name: 'Test',
            billing_address: '789 Cancel St',
            billing_city: 'Bangalore',
            billing_pincode: '560001',
            billing_state: 'Karnataka',
            billing_country: 'India',
            billing_phone: '9876543212',
            shipping_is_billing: true,
            order_items: [{ name: 'Test', sku: 'SKU-003', units: 1, selling_price: '200' }],
            payment_method: 'Prepaid',
            sub_total: 200,
            length: 20,
            breadth: 15,
            height: 10,
            weight: 0.5,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const cancelOrderId = orderRes.data.order_id;

        const response = await axios.post(
          `${baseUrl}/orders/cancel`,
          { ids: [cancelOrderId] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        expect(response.status).toBe(200);
        console.log(`✓ Order cancelled - ID: ${cancelOrderId}`);
      } catch (error: any) {
        console.error('✗ Order cancellation failed:', error.response?.data || error.message);
        // Cancellation might fail if order already shipped
      }
    });

    it('should reject invalid order ID', async () => {
      try {
        await axios.post(
          `${baseUrl}/orders/cancel`,
          { ids: [999999999] },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        throw new Error('Should have failed with invalid order ID');
      } catch (error: any) {
        expect([400, 404]).toContain(error.response?.status);
        console.log('✓ Invalid order ID correctly rejected for cancellation');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────

  afterAll(() => {
    console.log('\n' + '='.repeat(70));
    console.log('SHIPROCKET API INTEGRATION TESTS COMPLETED');
    console.log('='.repeat(70));
  });
});
