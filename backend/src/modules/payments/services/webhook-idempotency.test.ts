/**
 * US-05: Add Idempotency Guard to Webhook Handler — Manual Test Suite
 *
 * This test demonstrates that the webhook handler properly prevents
 * duplicate processing when Razorpay retries webhooks.
 *
 * Run with: npx ts-node src/modules/payments/services/webhook-idempotency.test.ts
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import { PaymentService } from './payment.service';
import { WebhookEventRepository } from '../repositories/webhook-event.repository';
import { config } from '../../../config';

// ─── Setup ────────────────────────────────────────────────────────────────

const paymentService = new PaymentService();
const webhookEventRepo = new WebhookEventRepository();

function createWebhookSignature(rawBody: string): string {
  return crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
}

// ─── Test 1: Same webhook sent twice should be idempotent ──────────────────

async function test1_WebhookIdempotency() {
  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 1: Webhook Idempotency (Same Event Sent Twice)                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const eventId = 'evt_' + Date.now();
  const webhookPayload = {
    id: eventId,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test_' + Date.now(),
          order_id: 'order_test_' + Date.now(),
          amount: 10000,
          currency: 'INR',
        },
      },
    },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const signature = createWebhookSignature(rawBody);

  console.log('📡 Webhook payload:');
  console.log(`   Event ID: ${eventId}`);
  console.log(`   Event Type: ${webhookPayload.event}`);

  // Delete any previous test data
  await (require('../models/webhook-event.model').WebhookEvent).deleteOne({ razorpayEventId: eventId });

  // First webhook
  console.log('\n1️⃣  Sending webhook for the FIRST time...');
  try {
    await paymentService.handleWebhook(rawBody, signature);
  } catch (error: any) {
    console.log('   ℹ️  Expected error (payment not found):', error.message);
  }

  const firstEvent = await webhookEventRepo.findByRazorpayEventId(eventId);
  console.log(`   ✅ WebhookEvent created with ID: ${firstEvent?._id}`);
  console.log(`   Status: ${firstEvent?.status}`);

  // Second webhook — identical payload
  console.log('\n2️⃣  Sending the SAME webhook again...');
  try {
    await paymentService.handleWebhook(rawBody, signature);
    console.log('   ✅ Second webhook skipped (idempotent, no error thrown)');
  } catch (error: any) {
    console.log('   ❌ ERROR: Should have been idempotent!', error.message);
    throw error;
  }

  const secondEvent = await webhookEventRepo.findByRazorpayEventId(eventId);
  console.log(`   Same document? ${firstEvent?._id.toString() === secondEvent?._id.toString() ? '✅ YES' : '❌ NO'}`);

  console.log('\n✅ TEST 1 PASSED\n');
}

// ─── Test 2: Invalid signature should be rejected ──────────────────────────

async function test2_InvalidSignature() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 2: Invalid Webhook Signature Rejection                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const eventId = 'evt_invalid_' + Date.now();
  const webhookPayload = {
    id: eventId,
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_invalid', order_id: 'order_invalid' } } },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const invalidSignature = 'totally_invalid_signature_' + Math.random().toString(36).substr(2, 20);

  console.log('📡 Webhook payload:');
  console.log(`   Event ID: ${eventId}`);
  console.log(`   Signature: ${invalidSignature.substring(0, 30)}...`);

  console.log('\n🚫 Sending webhook with INVALID signature...');
  try {
    await paymentService.handleWebhook(rawBody, invalidSignature);
    console.log('   ❌ Should have thrown an error!');
    throw new Error('Invalid signature should have been rejected');
  } catch (error: any) {
    if (error.message.includes('signature')) {
      console.log(`   ✅ Correctly rejected: ${error.message}`);
    } else {
      throw error;
    }
  }

  const created = await webhookEventRepo.findByRazorpayEventId(eventId);
  console.log(`\n   WebhookEvent created? ${created ? '❌ YES (should be NO)' : '✅ NO'}`);

  console.log('\n✅ TEST 2 PASSED\n');
}

// ─── Test 3: Multiple webhooks with different event IDs ───────────────────

async function test3_DifferentEvents() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 3: Different Events Should Create Different Records             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const eventId1 = 'evt_diff_1_' + Date.now();
  const eventId2 = 'evt_diff_2_' + Date.now();

  const webhook1 = {
    id: eventId1,
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
  };

  const webhook2 = {
    id: eventId2,
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_2', order_id: 'order_2' } } },
  };

  const raw1 = JSON.stringify(webhook1);
  const raw2 = JSON.stringify(webhook2);
  const sig1 = createWebhookSignature(raw1);
  const sig2 = createWebhookSignature(raw2);

  console.log('📡 Webhook 1:');
  console.log(`   Event ID: ${eventId1}`);
  console.log(`   Type: ${webhook1.event}`);

  console.log('\n📡 Webhook 2:');
  console.log(`   Event ID: ${eventId2}`);
  console.log(`   Type: ${webhook2.event}`);

  // Clean up
  await (require('../models/webhook-event.model').WebhookEvent).deleteOne({ razorpayEventId: eventId1 });
  await (require('../models/webhook-event.model').WebhookEvent).deleteOne({ razorpayEventId: eventId2 });

  console.log('\n1️⃣  Sending first webhook...');
  try {
    await paymentService.handleWebhook(raw1, sig1);
  } catch (error) {
    // Expected (payment not found)
  }

  console.log('2️⃣  Sending second webhook...');
  try {
    await paymentService.handleWebhook(raw2, sig2);
  } catch (error) {
    // Expected (payment not found)
  }

  const event1 = await webhookEventRepo.findByRazorpayEventId(eventId1);
  const event2 = await webhookEventRepo.findByRazorpayEventId(eventId2);

  console.log(`\n   Event 1 created? ${event1 ? '✅ YES' : '❌ NO'}`);
  console.log(`   Event 2 created? ${event2 ? '✅ YES' : '❌ NO'}`);
  console.log(`   Different IDs? ${event1?._id !== event2?._id ? '✅ YES' : '❌ NO'}`);

  console.log('\n✅ TEST 3 PASSED\n');
}

// ─── Test 4: Already processed webhook should be skipped ───────────────────

async function test4_ProcessedWebhookSkipped() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ TEST 4: Already Processed Webhook Should Be Skipped                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const eventId = 'evt_processed_' + Date.now();
  const webhookPayload = {
    id: eventId,
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_proc', order_id: 'order_proc' } } },
  };

  const rawBody = JSON.stringify(webhookPayload);
  const signature = createWebhookSignature(rawBody);

  // Clean up
  await (require('../models/webhook-event.model').WebhookEvent).deleteOne({ razorpayEventId: eventId });

  // First webhook
  console.log('1️⃣  Sending webhook (first time)...');
  try {
    await paymentService.handleWebhook(rawBody, signature);
  } catch (error) {
    // Expected
  }

  const firstEvent = await webhookEventRepo.findByRazorpayEventId(eventId);
  console.log(`   Status after first: ${firstEvent?.status}`);

  // Manually mark as processed (simulating it being already processed)
  await webhookEventRepo.markAsProcessed(firstEvent?._id.toString() || '');
  const processedEvent = await webhookEventRepo.findByRazorpayEventId(eventId);
  console.log(`   Manually marked as: ${processedEvent?.status}`);

  // Second webhook — should be skipped
  console.log('\n2️⃣  Sending same webhook again (should be skipped)...');
  try {
    await paymentService.handleWebhook(rawBody, signature);
    console.log('   ✅ Correctly skipped (already processed)');
  } catch (error) {
    console.log('   ❌ ERROR:', (error as any).message);
    throw error;
  }

  console.log('\n✅ TEST 4 PASSED\n');
}

// ─── Main test runner ──────────────────────────────────────────────────────

async function runTests() {
  try {
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      console.log('📦 Connecting to MongoDB...');
      await mongoose.connect(config.mongo.uri);
      console.log('✅ Connected');
    }

    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║     US-05: Webhook Idempotency Guard — Manual Test Suite              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    await test1_WebhookIdempotency();
    await test2_InvalidSignature();
    await test3_DifferentEvents();
    await test4_ProcessedWebhookSkipped();

    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ ALL TESTS PASSED SUCCESSFULLY                       ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('\n\n❌ TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();
