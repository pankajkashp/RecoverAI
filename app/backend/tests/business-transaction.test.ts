/**
 * RecoverAI — Business Transaction & Multiple Payment Attempts Test Suite
 *
 * Covers:
 * 1. One transaction with one failed payment.
 * 2. One transaction with multiple failed payments.
 * 3. Multiple payment IDs under one Razorpay Order.
 * 4. Payment method changes between attempts (UPI -> Card).
 * 5. Customer retries independently and succeeds (attribution: CUSTOMER).
 * 6. RecoverAI retries and succeeds (attribution: RECOVERAI).
 * 7. Customer succeeds before RecoverAI executes.
 * 8. Customer and RecoverAI recovery race condition handling.
 * 9. Multiple recovery requests are idempotent.
 * 10. Duplicate webhook delivery does not corrupt transaction or state.
 * 11. Out-of-order webhook delivery.
 * 12. Failed -> captured state transition for same payment ID.
 * 13. New Razorpay Order correlated to same business transaction via merchant reference.
 * 14. Validation rejection on invalid payment ID for recovery execution.
 * 15. Five failed attempts + sixth successful attempt counts as one ₹200 transaction.
 * 16. Actual recovered amount is credited only once.
 * 17. A successful payment does not trigger another recovery.
 * 18. Dashboard analytics properly separate attempts from transaction monetary volume.
 */

import crypto from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { environment } from "../src/config/env.js";

const prisma = new PrismaClient();
const app = createApp();

const TEST_WEBHOOK_SECRET =
  environment.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret_key";

function signPayload(payload: object, secret: string = TEST_WEBHOOK_SECRET): string {
  const jsonStr = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(jsonStr).digest("hex");
}

describe("Business Transaction & Multi-Attempt Payment Model", { timeout: 60000 }, () => {
  const testPrefix = `bt_test_${Date.now()}`;
  const authToken = "demo_token_single_business";

  beforeAll(async () => {
    const provider = await prisma.provider.findFirst({
      where: { type: "RAZORPAY" },
    });
    if (!provider) {
      await prisma.provider.create({
        data: {
          id: `prov_rzp_bt_${Date.now()}`,
          name: "Razorpay Test",
          type: "RAZORPAY",
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } },
    });
    await prisma.mlPrediction.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: "pay_" } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { externalPaymentId: { startsWith: "pay_" } },
    });
    await prisma.businessTransaction.deleteMany({
      where: { merchantReference: { startsWith: "order_" } },
    });
    await prisma.$disconnect();
  });

  // Helper to simulate incoming Razorpay webhook
  async function postWebhook(payload: object) {
    const signature = signPayload(payload);
    return request(app)
      .post("/api/webhooks/razorpay")
      .set("x-razorpay-signature", signature)
      .set("Content-Type", "application/json")
      .send(payload);
  }

  // --------------------------------------------------------------------------
  // Scenario 1: One transaction with one failed payment
  // --------------------------------------------------------------------------
  it("1. One transaction with one failed payment creates a FAILED BusinessTransaction", async () => {
    const payId = `pay_single_fail_${Date.now()}`;
    const orderId = `order_single_fail_${Date.now()}`;

    const res = await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: orderId,
            amount: 20000, // ₹200.00
            currency: "INR",
            status: "failed",
            method: "upi",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            error_description: "Account has insufficient balance",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payId },
      include: { businessTransaction: true },
    });

    expect(payment).not.toBeNull();
    expect(payment?.businessTransaction).not.toBeNull();
    expect(payment?.businessTransaction?.status).toBe("FAILED");
    expect(Number(payment?.businessTransaction?.amount)).toBe(200);
    expect(payment?.orderReference).toBe(orderId);
  });

  // --------------------------------------------------------------------------
  // Scenario 2 & 3: Multiple payment IDs under one Razorpay Order
  // --------------------------------------------------------------------------
  it("2 & 3. Multiple payment IDs under one Razorpay Order attach to same BusinessTransaction", async () => {
    const orderId = `order_multi_${Date.now()}`;
    const pay1 = `pay_multi_1_${Date.now()}`;
    const pay2 = `pay_multi_2_${Date.now()}`;

    // Attempt 1: UPI failure
    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay1,
            order_id: orderId,
            amount: 20000, // ₹200
            currency: "INR",
            status: "failed",
            method: "upi",
            error_code: "BAD_REQUEST_ERROR",
            error_description: "UPI pin expired",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    // Attempt 2: Card failure under SAME order
    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay2,
            order_id: orderId,
            amount: 20000, // ₹200
            currency: "INR",
            status: "failed",
            method: "card",
            error_code: "GATEWAY_ERROR",
            error_description: "Card declined by issuing bank",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const p1 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: pay1 },
    });
    const p2 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: pay2 },
    });

    expect(p1?.businessTransactionId).toBeDefined();
    expect(p2?.businessTransactionId).toBeDefined();
    // Both payment events share the exact same business transaction ID
    expect(p1?.businessTransactionId).toBe(p2?.businessTransactionId);

    // Business transaction still reflects ₹200 volume, not ₹400
    const bt = await prisma.businessTransaction.findUnique({
      where: { id: p1!.businessTransactionId! },
      include: { payments: true },
    });
    expect(Number(bt?.amount)).toBe(200);
    expect(bt?.payments.length).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Payment method changes between attempts
  // --------------------------------------------------------------------------
  it("4. Payment method changes between attempts are preserved at attempt level without creating new transactions", async () => {
    const orderId = `order_methods_${Date.now()}`;
    const payUpi = `pay_meth_upi_${Date.now()}`;
    const payCard = `pay_meth_card_${Date.now()}`;

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payUpi,
            order_id: orderId,
            amount: 35000,
            currency: "INR",
            status: "failed",
            method: "upi",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payCard,
            order_id: orderId,
            amount: 35000,
            currency: "INR",
            status: "failed",
            method: "card",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const event1 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payUpi },
    });
    const event2 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payCard },
    });

    expect(event1?.paymentMethod).toBe("UPI");
    expect(event2?.paymentMethod).toBe("CARD");
    expect(event1?.businessTransactionId).toBe(event2?.businessTransactionId);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Customer retries and succeeds independently
  // --------------------------------------------------------------------------
  it("5. Customer retries and succeeds: marks transaction RECOVERED with CUSTOMER attribution", async () => {
    const orderId = `order_cust_retry_${Date.now()}`;
    const payFail = `pay_cust_fail_${Date.now()}`;
    const paySuccess = `pay_cust_succ_${Date.now()}`;

    // 1. Initial failure
    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payFail,
            order_id: orderId,
            amount: 50000, // ₹500
            currency: "INR",
            status: "failed",
            method: "upi",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    // 2. Customer retries independently with success
    const res = await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paySuccess,
            order_id: orderId,
            amount: 50000,
            currency: "INR",
            status: "captured",
            method: "card",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    expect(res.status).toBe(200);

    const failEvent = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payFail },
    });
    const bt = await prisma.businessTransaction.findUnique({
      where: { id: failEvent!.businessTransactionId! },
    });

    expect(bt?.status).toBe("RECOVERED");
    expect(bt?.recoveryAttribution).toBe("CUSTOMER");
  });

  // --------------------------------------------------------------------------
  // Scenario 6: RecoverAI retries and succeeds via provider webhook confirmation
  // --------------------------------------------------------------------------
  it("6. RecoverAI retries and succeeds: marks transaction RECOVERED with RECOVERAI attribution", async () => {
    const payFail = `pay_rec_fail_${Date.now()}`;
    const orderId = `order_rec_succ_${Date.now()}`;

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payFail,
            order_id: orderId,
            amount: 25000,
            currency: "INR",
            status: "failed",
            method: "card",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payFail },
    });

    // Execute recovery
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    expect(execRes.status).toBe(201);
    expect(execRes.body.data.attemptStatus).toBe("ATTEMPTED");
    const attemptId = execRes.body.data.recoveryAttemptId;

    // Simulate provider confirmation webhook with recovery metadata notes
    const confirmRes = await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_rec_conf_${Date.now()}`,
            amount: 25000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              recoveryAttemptId: attemptId,
              paymentEventId: payFail,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.isRecoveryConfirmation).toBe(true);
    expect(confirmRes.body.outcomeStatus).toBe("SUCCESSFUL");

    const bt = await prisma.businessTransaction.findUnique({
      where: { id: payment!.businessTransactionId! },
    });
    expect(bt?.status).toBe("RECOVERED");
    expect(bt?.recoveryAttribution).toBe("RECOVERAI");
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Customer succeeds before RecoverAI executes
  // --------------------------------------------------------------------------
  it("7. Customer succeeds before RecoverAI executes: subsequent recovery execution returns ALREADY_EXECUTED", async () => {
    const orderId = `order_cust_first_${Date.now()}`;
    const pay1 = `pay_cf_1_${Date.now()}`;
    const pay2 = `pay_cf_2_${Date.now()}`;

    // Failure
    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay1,
            order_id: orderId,
            amount: 15000,
            currency: "INR",
            status: "failed",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment1 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: pay1 },
    });

    // Customer succeeds before user triggers RecoverAI
    await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pay2,
            order_id: orderId,
            amount: 15000,
            currency: "INR",
            status: "captured",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    // Now user tries to execute recovery for the first failed attempt
    const res = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment1!.id });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ALREADY_EXECUTED");
    expect(res.body.data.message).toContain("already been successfully recovered");
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Customer and RecoverAI race condition
  // --------------------------------------------------------------------------
  it("8. Customer and RecoverAI race: transaction is settled once and does not double credit", async () => {
    const orderId = `order_race_${Date.now()}`;
    const payFail = `pay_race_fail_${Date.now()}`;

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payFail,
            order_id: orderId,
            amount: 20000,
            currency: "INR",
            status: "failed",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payFail },
    });

    // Recovery is initiated
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;

    // Customer independently pays via normal checkout
    await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_race_cust_${Date.now()}`,
            order_id: orderId,
            amount: 20000,
            currency: "INR",
            status: "captured",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    // Late recovery webhook confirmation arrives
    const confRes = await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_race_rec_${Date.now()}`,
            amount: 20000,
            currency: "INR",
            status: "captured",
            notes: {
              recoveryAttemptId: attemptId,
              paymentEventId: payFail,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    expect(confRes.status).toBe(200);

    // Transaction status remains valid and only one business transaction exists
    const bt = await prisma.businessTransaction.findUnique({
      where: { id: payment!.businessTransactionId! },
    });
    expect(bt?.status).toBe("RECOVERED");
    expect(Number(bt?.amount)).toBe(200);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Multiple recovery requests are idempotent
  // --------------------------------------------------------------------------
  it("9. Multiple recovery execution requests on the same business transaction are idempotent", async () => {
    const orderId = `order_idem_rec_${Date.now()}`;
    const payId = `pay_idem_rec_${Date.now()}`;

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: orderId,
            amount: 18000,
            currency: "INR",
            status: "failed",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payId },
    });

    // Request 1: Initiates recovery
    const res1 = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    expect(res1.status).toBe(201);
    const initialAttemptId = res1.body.data.recoveryAttemptId;

    // Request 2: Duplicate click while recovery is still pending
    const res2 = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    expect(res2.status).toBe(200);
    expect(res2.body.data.status).toBe("ALREADY_EXECUTED");
    expect(res2.body.data.recoveryAttemptId).toBe(initialAttemptId);

    // Verify only ONE recovery attempt exists in DB for this transaction
    const attempts = await prisma.recoveryAttempt.findMany({
      where: { paymentEventId: payment!.id },
    });
    expect(attempts.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Duplicate webhook delivery
  // --------------------------------------------------------------------------
  it("10. Duplicate webhook delivery does not create duplicate business records or corrupt transaction", async () => {
    const payId = `pay_dup_hook_${Date.now()}`;
    const orderId = `order_dup_hook_${Date.now()}`;

    const payload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: orderId,
            amount: 12000,
            currency: "INR",
            status: "failed",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const first = await postWebhook(payload);
    expect(first.status).toBe(200);
    expect(first.body.isDuplicate).toBe(false);

    const second = await postWebhook(payload);
    expect(second.status).toBe(200);
    expect(second.body.isDuplicate).toBe(true);

    const count = await prisma.paymentEvent.count({
      where: { externalPaymentId: payId },
    });
    expect(count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 11 & 12: Failed -> Captured state transition (late webhook)
  // --------------------------------------------------------------------------
  it("11 & 12. Failed -> captured state transition updates transaction status to RECOVERED", async () => {
    const payId = `pay_transition_${Date.now()}`;
    const orderId = `order_transition_${Date.now()}`;

    // 1. Ingest failed webhook
    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: orderId,
            amount: 45000, // ₹450
            currency: "INR",
            status: "failed",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const before = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payId },
      include: { businessTransaction: true },
    });
    expect(before?.status).toBe("FAILED");
    expect(before?.businessTransaction?.status).toBe("FAILED");

    // 2. Later, captured webhook arrives for the SAME payment ID
    const transRes = await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: orderId,
            amount: 45000,
            currency: "INR",
            status: "captured",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    expect(transRes.status).toBe(200);
    expect(transRes.body.isDuplicate).toBe(false);
    expect(transRes.body.status).toBe("COMPLETED");

    const after = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payId },
      include: { businessTransaction: true },
    });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.businessTransaction?.status).toBe("RECOVERED");
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Correlation across different Razorpay Orders via merchant transaction ID
  // --------------------------------------------------------------------------
  it("13. Two different Razorpay Orders correlate to same BusinessTransaction when merchantReference is available", async () => {
    const merchantTxId = `merchant_ref_${Date.now()}`;
    const orderA = `order_diff_a_${Date.now()}`;
    const orderB = `order_diff_b_${Date.now()}`;
    const pay1 = `pay_diff_1_${Date.now()}`;
    const pay2 = `pay_diff_2_${Date.now()}`;

    // Order A with merchant transaction ID
    const res1 = await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: pay1,
            order_id: orderA,
            amount: 75000,
            currency: "INR",
            status: "failed",
            method: "card",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            error_description: "Card declined",
            notes: {
              transaction_id: merchantTxId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });
    expect(res1.status).toBe(200);

    // Order B (a completely new Razorpay Order) for the SAME underlying merchant transaction
    const res2 = await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: pay2,
            order_id: orderB,
            amount: 75000,
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              transaction_id: merchantTxId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });
    expect(res2.status).toBe(200);

    const event1 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: pay1 },
    });
    const event2 = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: pay2 },
    });

    expect(event1?.businessTransactionId).toBeDefined();
    expect(event2?.businessTransactionId).toBeDefined();
    // Proven: Different Razorpay Orders correlate to the exact same BusinessTransaction!
    expect(event1?.businessTransactionId).toBe(event2?.businessTransactionId);

    const bt = await prisma.businessTransaction.findUnique({
      where: { id: event1!.businessTransactionId! },
    });
    expect(bt?.merchantReference).toBe(merchantTxId);
    expect(bt?.status).toBe("RECOVERED");
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Non-existent recommendation rejection
  // --------------------------------------------------------------------------
  it("14. Rejects recovery execution for non-existent payment event", async () => {
    const res = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: "non_existent_event_id_000000" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Scenario 15 & 18: 5 failed attempts + 1 successful attempt = ONE ₹200 transaction
  // --------------------------------------------------------------------------
  it("15 & 18. Five failed attempts + sixth successful attempt counts as exactly ONE ₹200 transaction in volume", async () => {
    const orderId = `order_5fail_1succ_${Date.now()}`;

    // 5 failed attempts
    for (let i = 1; i <= 5; i++) {
      await postWebhook({
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: `pay_5f_${i}_${Date.now()}`,
              order_id: orderId,
              amount: 20000, // ₹200 each
              currency: "INR",
              status: "failed",
              method: i % 2 === 0 ? "card" : "upi",
              error_code: "PAYMENT_FAILED",
              error_reason: "insufficient_funds",
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      });
    }

    // 6th attempt: customer succeeds
    await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_5f_6_success_${Date.now()}`,
            order_id: orderId,
            amount: 20000, // ₹200
            currency: "INR",
            status: "captured",
            method: "upi",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const bt = await prisma.businessTransaction.findFirst({
      where: { orderReference: orderId },
      include: { payments: true },
    });

    expect(bt).not.toBeNull();
    expect(bt?.payments.length).toBe(6);
    expect(Number(bt?.amount)).toBe(200);
    expect(bt?.status).toBe("RECOVERED");
  }, 60000);

  // --------------------------------------------------------------------------
  // Scenario 16: Actual recovered amount credited only once
  // --------------------------------------------------------------------------
  it("16. Actual recovered amount is credited only once even if multiple confirmations or webhooks arrive", async () => {
    const payFail = `pay_once_fail_${Date.now()}`;
    const orderId = `order_once_${Date.now()}`;

    await postWebhook({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: payFail,
            order_id: orderId,
            amount: 30000, // ₹300
            currency: "INR",
            status: "failed",
            error_code: "PAYMENT_FAILED",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: payFail },
    });

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    const confPayload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_once_conf_${Date.now()}`,
            amount: 30000,
            currency: "INR",
            status: "captured",
            notes: {
              recoveryAttemptId: attemptId,
              paymentEventId: payFail,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    // First webhook confirmation
    const c1 = await postWebhook(confPayload);
    expect(c1.status).toBe(200);
    expect(c1.body.actualRecoveredAmount).toBe(300);

    // Duplicate webhook confirmation
    const c2 = await postWebhook(confPayload);
    expect(c2.status).toBe(200);
    expect(c2.body.message).toContain("Recovery already confirmed");

    const outcomes = await prisma.recoveryOutcome.findMany({
      where: { recoveryAttemptId: attemptId },
    });
    expect(outcomes.length).toBe(1);
    expect(Number(outcomes[0].actualRecoveredAmount)).toBe(300);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: A successful payment does not trigger another recovery
  // --------------------------------------------------------------------------
  it("17. A successful payment does not trigger another recovery", async () => {
    const orderId = `order_succ_no_rec_${Date.now()}`;
    const paySucc = `pay_succ_norec_${Date.now()}`;

    // Direct successful payment
    await postWebhook({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paySucc,
            order_id: orderId,
            amount: 15000,
            currency: "INR",
            status: "captured",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paySucc },
      include: { recommendation: true },
    });

    // Successful payment has NO recovery recommendation
    expect(payment?.recommendation).toBeNull();

    // Trying to execute recovery for this payment returns 404 recommendation not found
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ paymentEventId: payment!.id });

    expect(execRes.status).toBe(404);
  });
});
