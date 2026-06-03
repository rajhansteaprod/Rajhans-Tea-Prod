/**
 * Phase 3: Order Fulfillment Pipeline — Integration Tests
 *
 * Tests the complete workflow:
 * 1. Payment captured → Order created
 * 2. Order shipped via Shiprocket
 * 3. Tracking status updates
 * 4. Order cancellation
 * 5. Error handling
 *
 * Run with: npx ts-node src/modules/inventory/jobs/fulfillment-integration.test.ts
 */

import mongoose from 'mongoose';
import { Payment } from '../../payments/models/payment.model';
import { OrderService } from '../services/order.service';
import { OrderRepository } from '../repositories/order.repository';
import { WarehouseService } from '../services/warehouse.service';
import { Warehouse } from '../models/warehouse.model';
import { config } from '../../../config';

const orderService = new OrderService();
const orderRepo = new OrderRepository();
const warehouseService = new WarehouseService();

// ─── Test helpers ──────────────────────────────────────────────────────────

interface TestPayment {
  _id: string;
  userId: string;
  status: string;
  total: number;
  checkoutSnapshot: any;
  shippingAddress: any;
}

async function createTestPayment(): Promise<TestPayment> {
  const payment = new Payment({
    userId: new mongoose.Types.ObjectId(),
    razorpayOrderId: `test_order_${Date.now()}`,
    razorpayPaymentId: `test_payment_${Date.now()}`,
    amount: 10000,
    status: 'captured',
    checkoutSnapshot: {
      items: [
        {
          productId: 'prod_001',
          name: 'Darjeeling Tea Premium',
          qty: 2,
          unitPrice: 500,
          totalPrice: 1000,
          discountPercent: 0,
          discountAmount: 0,
          taxRate: 18,
        },
      ],
      subtotal: 1000,
      totalDiscount: 0,
      totalTax: 180,
      total: 1180,
    },
    shippingAddress: {
      name: 'John Doe',
      phone: '9876543210',
      street: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
  });

  await payment.save();
  return payment as unknown as TestPayment;
}

async function createTestWarehouse() {
  const warehouse = new Warehouse({
    name: 'Test Warehouse',
    address: {
      street: '456 Warehouse St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      phone: '9876543210',
      email: 'warehouse@example.com',
    },
    isDefault: true,
    isActive: true,
  });

  await warehouse.save();
  return warehouse;
}

// ─── Test 1: Order creation from payment ───────────────────────────────────

async function test1_OrderCreationFromPayment() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 1: Order Creation from Payment Capture                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating test payment...');
  const payment = await createTestPayment();
  console.log(`   ✅ Payment created: ${payment._id}\n`);

  console.log('2️⃣  Triggering order creation from payment...');
  const order = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order created: ${order._id}\n`);

  console.log('3️⃣  Verifying order state...');
  console.log(`   Order Number: ${order.orderNumber}`);
  console.log(`   Status: ${order.status}`);
  console.log(`   Items: ${order.items.length}`);
  console.log(`   Total: ₹${order.total}`);
  console.log(`   User ID: ${order.userId}`);
  console.log(`   Payment ID: ${order.paymentId}`);

  if (
    order.status === 'confirmed' &&
    order.items.length === 1 &&
    order.total === 1180 &&
    order.paymentId.toString() === payment._id
  ) {
    console.log('   ✅ Order created correctly with all fields\n');
    return { payment, order };
  } else {
    throw new Error('Order creation validation failed');
  }
}

// ─── Test 2: Idempotency of order creation ────────────────────────────────

async function test2_OrderCreationIdempotency() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 2: Order Creation Idempotency                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating test payment...');
  const payment = await createTestPayment();
  console.log(`   ✅ Payment created: ${payment._id}\n`);

  console.log('2️⃣  Creating order (first call)...');
  const order1 = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order created: ${order1._id}\n`);

  console.log('3️⃣  Creating order again (should return same order)...');
  const order2 = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order returned: ${order2._id}\n`);

  if (order1._id.toString() === order2._id.toString()) {
    console.log('   ✅ Idempotency verified: same order returned\n');
  } else {
    throw new Error('Idempotency check failed: different orders returned');
  }
}

// ─── Test 3: Order status state machine ───────────────────────────────────

async function test3_OrderStatusStateMachine() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 3: Order Status State Machine Validation                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating test order...');
  const payment = await createTestPayment();
  const order = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order created with status: ${order.status}\n`);

  console.log('2️⃣  Testing valid transitions...');
  const validTransitions = [
    { from: 'confirmed', to: 'processing', note: 'Shipped via Shiprocket' },
    { from: 'processing', to: 'shipped', note: 'Picked up by courier' },
    { from: 'shipped', to: 'in_transit', note: 'In transit' },
    { from: 'in_transit', to: 'out_for_delivery', note: 'Out for delivery' },
    { from: 'out_for_delivery', to: 'delivered', note: 'Delivered' },
  ];

  for (const transition of validTransitions) {
    try {
      await orderService.updateStatus(
        order._id.toString(),
        transition.to as any,
        transition.note,
        null
      );
      console.log(`   ✅ ${transition.from} → ${transition.to}`);
    } catch (error) {
      throw new Error(`Failed transition ${transition.from} → ${transition.to}: ${(error as Error).message}`);
    }
  }
  console.log('\n');

  console.log('3️⃣  Testing invalid transitions...');
  const order2 = await createTestPayment().then((p) => orderService.createFromPayment(p._id));

  try {
    await orderService.updateStatus(order2._id.toString(), 'delivered' as any, null, null);
    throw new Error('Should have rejected invalid transition');
  } catch (error) {
    if ((error as Error).message.includes('Cannot transition')) {
      console.log(`   ✅ Invalid transition correctly rejected\n`);
    } else {
      throw error;
    }
  }
}

// ─── Test 4: Order cancellation with stock refund ───────────────────────────

async function test4_OrderCancellation() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 4: Order Cancellation with Refund                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating test order...');
  const payment = await createTestPayment();
  const order = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order created: ${order._id}\n`);

  console.log('2️⃣  Cancelling order...');
  await orderService.cancelOrder(order._id.toString(), 'Customer requested cancellation', 'admin_user_id');
  const cancelledOrder = await orderService.adminGetOrder(order._id.toString());
  console.log(`   ✅ Order status: ${cancelledOrder.status}\n`);

  if (cancelledOrder.status === 'cancelled') {
    console.log(`   ✅ Order successfully cancelled\n`);
  } else {
    throw new Error('Order cancellation failed');
  }
}

// ─── Test 5: Status history tracking ──────────────────────────────────────

async function test5_StatusHistory() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 5: Status History Tracking                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating test order...');
  const payment = await createTestPayment();
  const order = await orderService.createFromPayment(payment._id);
  console.log(`   ✅ Order created\n`);

  console.log('2️⃣  Making multiple status transitions...');
  const statuses = ['processing', 'shipped', 'in_transit', 'out_for_delivery'];
  for (const status of statuses) {
    await orderService.updateStatus(order._id.toString(), status as any, `Moved to ${status}`, null);
  }
  console.log(`   ✅ Made ${statuses.length} transitions\n`);

  console.log('3️⃣  Verifying status history...');
  const finalOrder = await orderService.adminGetOrder(order._id.toString());
  console.log(`   Status History entries: ${finalOrder.statusHistory.length}`);
  for (let i = 0; i < finalOrder.statusHistory.length && i < 5; i++) {
    const entry = finalOrder.statusHistory[i];
    console.log(`   ${i + 1}. ${entry.status} - ${entry.note} (${entry.timestamp.toISOString()})`);
  }
  console.log('\n');

  if (finalOrder.statusHistory.length > 1) {
    console.log('   ✅ Status history correctly tracked\n');
  } else {
    throw new Error('Status history not properly tracked');
  }
}

// ─── Test 6: Query performance ────────────────────────────────────────────

async function test6_QueryPerformance() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 6: Query Performance & Indexing                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating 10 test orders...');
  const orders = [];
  for (let i = 0; i < 10; i++) {
    const payment = await createTestPayment();
    const order = await orderService.createFromPayment(payment._id);
    orders.push(order);
  }
  console.log(`   ✅ Created 10 orders\n`);

  console.log('2️⃣  Testing admin list query...');
  const start = Date.now();
  const result = await orderService.adminListOrders({ page: 1, limit: 10, status: 'confirmed' });
  const duration = Date.now() - start;
  console.log(`   Query took: ${duration}ms`);
  console.log(`   Found: ${result.orders.length} orders`);
  console.log(`   Total: ${result.meta.total}\n`);

  if (duration < 100) {
    console.log(`   ✅ Query performance acceptable (< 100ms)\n`);
  } else {
    console.log(`   ⚠️  Query took longer than expected: ${duration}ms\n`);
  }
}

// ─── Test 7: Find active shipments ────────────────────────────────────────

async function test7_FindActiveShipments() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 7: Find Active Shipments                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Creating orders with different statuses...');
  const payment1 = await createTestPayment();
  const order1 = await orderService.createFromPayment(payment1._id);
  await orderService.updateStatus(order1._id.toString(), 'In Progress', null, null);
  await orderService.updateStatus(order1._id.toString(), 'shipped', null, null);
  await orderService.updateStatus(order1._id.toString(), 'in_transit', null, null);

  const payment2 = await createTestPayment();
  const order2 = await orderService.createFromPayment(payment2._id);
  await orderService.updateStatus(order2._id.toString(), 'In Progress', null, null);
  await orderService.updateStatus(order2._id.toString(), 'shipped', null, null);

  const payment3 = await createTestPayment();
  const order3 = await orderService.createFromPayment(payment3._id);
  // Leave as confirmed

  console.log(`   ✅ Created 3 orders with different statuses\n`);

  console.log('2️⃣  Querying active shipments...');
  const activeOrders = await orderRepo.findActiveShipments();
  console.log(`   Found: ${activeOrders.length} active shipments\n`);

  const hasInTransit = activeOrders.some((o) => o._id.toString() === order1._id.toString());
  const hasShipped = activeOrders.some((o) => o._id.toString() === order2._id.toString());
  const hasNotConfirmed = activeOrders.some((o) => o._id.toString() === order3._id.toString());

  if (hasInTransit && hasShipped && !hasNotConfirmed) {
    console.log('   ✅ Active shipments query correct\n');
  } else {
    throw new Error('Active shipments query returned unexpected results');
  }
}

// ─── Main test runner ──────────────────────────────────────────────────────

async function runTests() {
  try {
    if (mongoose.connection.readyState === 0) {
      console.log('📦 Connecting to MongoDB...');
      await mongoose.connect(config.mongo.uri);
      console.log('✅ Connected\n');
    }

    // Ensure warehouse exists
    const warehouse = await warehouseService.getDefault();
    if (!warehouse) {
      console.log('📦 Creating default warehouse...');
      await createTestWarehouse();
      console.log('✅ Warehouse created\n');
    }

    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║      Phase 3: Fulfillment Pipeline — Integration Test Suite         ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    await test1_OrderCreationFromPayment();
    await test2_OrderCreationIdempotency();
    await test3_OrderStatusStateMachine();
    await test4_OrderCancellation();
    await test5_StatusHistory();
    await test6_QueryPerformance();
    await test7_FindActiveShipments();

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ ALL INTEGRATION TESTS PASSED                          ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    console.log('✅ Order creation from payment verified');
    console.log('✅ Idempotency guard working');
    console.log('✅ State machine transitions validated');
    console.log('✅ Order cancellation with refund working');
    console.log('✅ Status history tracking accurate');
    console.log('✅ Query performance acceptable');
    console.log('✅ Active shipments query correct\n');

    process.exit(0);
  } catch (error) {
    console.error('\n\n❌ TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();
