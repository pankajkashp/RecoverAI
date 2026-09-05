/**
 * RecoverAI — Recovery Lifecycle & Critical Trust Invariant Tests (Single Business)
 *
 * Verifies:
 * 1. ATTEMPTED != RECOVERED: Initiating recovery does NOT create recovered revenue.
 * 2. Provider Confirmation: Only verified payment.captured / order.paid webhooks finalize recovery.
 * 3. Idempotency: Duplicate webhooks or duplicate recovery requests do not double-count revenue.
 * 4. Failure Handling: Failed recovery does not increase actualRecoveredAmount.
 * 5. Non-Recovery Isolation: Regular payments do not falsely confirm recovery attempts.
 * 6. Customer Independent Retry: Customer paying independently does NOT cancel recovery attempt.
 * 7. Persistence & Reload: Provider confirmed recovery survives reloads from PostgreSQL.
 * 8. Payment Pages Isolation: Standard Payment Pages failures reach normal pipeline.
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

describe("Recovery Lifecycle & Critical Trust Invariant (Single Business)", { timeout: 60000 }, () => {
  let token: string;

  beforeAll(async () => {
    token = "demo_token_single_business";

    // Ensure Razorpay Provider exists
    const provider = await prisma.provider.findFirst({
      where: { type: "RAZORPAY" },
    });

    if (!provider) {
      await prisma.provider.create({
        data: {
          id: `prov_rzp_trust_${Date.now()}`,
          name: "Razorpay Test",
          type: "RAZORPAY",
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to ingest a failed payment
  async function setupFailedPayment(paymentExtId: string, amount: number = 5000.0) {
    const failedWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentExtId,
            amount: amount * 100, // paise
            currency: "INR",
            status: "failed",
            method: "card",
            notes: {},
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment declined due to insufficient funds",
            error_source: "bank",
            error_step: "payment_authorization",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(failedWebhook);
    const ingestRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(failedWebhook);

    expect(ingestRes.status).toBe(200);

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paymentExtId },
      include: { recommendation: true, assessment: true },
    });

    expect(payment).toBeDefined();
    expect(payment?.recommendation?.action).toBe("RETRY_PAYMENT");
    return payment!;
  }

  // --------------------------------------------------------------------------
  // Test 1: Critical Trust Invariant (ATTEMPTED != RECOVERED)
  // --------------------------------------------------------------------------
  it("CRITICAL TRUST INVARIANT: Initiating recovery sets ATTEMPTED and does NOT increase Actually Recovered", async () => {
    const extId = `pay_fail_trust_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 12000.0);

    // Initial Dashboard Summary
    const initialDash = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);

    const initialActuallyRecovered = Number(
      initialDash.body?.data?.metrics?.actualRecoveredAmount ?? 0
    );

    // Step 1: Initiate Recovery
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    expect(execRes.body.data.status).toBe("EXECUTED");
    expect(execRes.body.data.attemptStatus).toBe("ATTEMPTED");
    expect(execRes.body.data.actualRecoveredAmount).toBeNull();
    const attemptId = execRes.body.data.recoveryAttemptId;

    // Verify recovery attempt is ATTEMPTED in database
    const attemptInDb = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: { outcome: true },
    });

    expect(attemptInDb).toBeDefined();
    expect(attemptInDb?.status).toBe("ATTEMPTED");
    expect(attemptInDb?.outcome).toBeNull(); // CRITICAL: NO outcome yet!

    // Verify Dashboard metrics: actualRecoveredAmount MUST NOT have changed
    const postAttemptDash = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);

    const postAttemptRecovered = Number(
      postAttemptDash.body?.data?.metrics?.actualRecoveredAmount ?? 0
    );

    expect(postAttemptRecovered).toBe(initialActuallyRecovered);
  });

  // --------------------------------------------------------------------------
  // Test 2: Provider Confirmation Flow
  // --------------------------------------------------------------------------
  it("PROVIDER CONFIRMATION: payment.captured confirms recovery and credits exact confirmed amount", async () => {
    const extId = `pay_fail_prov_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 8500.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    // Simulate provider confirming the recovery payment
    const captureWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_captured_${Date.now()}`,
            amount: 850000,
            currency: "INR",
            status: "captured",
            notes: {
              recoveryAttemptId: attemptId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(captureWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(webhookRes.body.actualRecoveredAmount).toBe(8500.0);

    const attemptAfter = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: {
        outcome: true,
        paymentEvent: { include: { businessTransaction: true } },
      },
    });

    expect(attemptAfter?.status).toBe("SUCCESSFUL");
    expect(attemptAfter?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attemptAfter?.outcome?.actualRecoveredAmount)).toBe(8500.0);
    expect(attemptAfter?.paymentEvent.businessTransaction?.status).toBe("RECOVERED");
    expect(attemptAfter?.paymentEvent.businessTransaction?.recoveryAttribution).toBe("RECOVERAI");
  });

  // --------------------------------------------------------------------------
  // Test 3: Idempotency
  // --------------------------------------------------------------------------
  it("IDEMPOTENCY: Duplicate payment.captured webhook delivery does NOT double-count recovery revenue", async () => {
    const extId = `pay_fail_idemp_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 4000.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    const captureWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_idemp_cap_${Date.now()}`,
            amount: 400000,
            currency: "INR",
            status: "captured",
            notes: {
              recoveryAttemptId: attemptId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(captureWebhook);

    // Delivery 1
    const res1 = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);
    expect(res1.status).toBe(200);

    // Delivery 2 (Duplicate)
    const res2 = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);
    expect(res2.status).toBe(200);
    expect(res2.body.isRecoveryConfirmation).toBe(true);
    expect(res2.body.message).toContain("idempotent duplicate");

    const outcomeCount = await prisma.recoveryOutcome.count({
      where: { recoveryAttemptId: attemptId },
    });
    expect(outcomeCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Test 4: Unrelated Payment Captured Isolation
  // --------------------------------------------------------------------------
  it("ISOLATION: Standard payment.captured webhook without recovery notes is ingested normally without touching recovery attempts", async () => {
    const regularPaymentId = `pay_regular_${Date.now()}`;
    const regularWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: regularPaymentId,
            amount: 500000,
            currency: "INR",
            status: "captured",
            method: "card",
            notes: {},
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(regularWebhook);
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(regularWebhook);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isRecoveryConfirmation).toBeUndefined();
    expect(res.body.status).toBe("COMPLETED");
  });

  // --------------------------------------------------------------------------
  // Test 5: Failed Recovery Payment Handling
  // --------------------------------------------------------------------------
  it("FAILED RECOVERY: payment.failed on recovery attempt sets FAILED status with 0 recovered amount", async () => {
    const extId = `pay_fail_retryfail_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 3500.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    const failedRetryWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_retry_declined_${Date.now()}`,
            amount: 350000,
            currency: "INR",
            status: "failed",
            notes: {
              recoveryAttemptId: attemptId,
            },
            error_code: "BAD_REQUEST_ERROR",
            error_reason: "card_declined",
            error_description: "Card was declined by bank",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(failedRetryWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(failedRetryWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("FAILED");
    expect(webhookRes.body.actualRecoveredAmount).toBe(0);

    const attemptAfter = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: { outcome: true },
    });
    expect(attemptAfter?.status).toBe("FAILED");
    expect(Number(attemptAfter?.outcome?.actualRecoveredAmount)).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test 6: E2E Payment Link Correlation (empty notes, invoice_id matching plink)
  // --------------------------------------------------------------------------
  it("PAYMENT LINK RECOVERY: payment.captured with invoice_id=plink confirms recovery without notes", async () => {
    const extId = `pay_e2e_link_fail_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 232.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;
    const providerReference = execRes.body.data.providerReference;
    expect(providerReference).toBeDefined();

    const capturedLinkPaymentWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_captured_via_link_${Date.now()}`,
            amount: 23200,
            currency: "INR",
            status: "captured",
            invoice_id: providerReference,
            order_id: `order_link_${Date.now()}`,
            notes: [],
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(capturedLinkPaymentWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(capturedLinkPaymentWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(webhookRes.body.actualRecoveredAmount).toBe(232.0);

    const attemptAfter = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: {
        outcome: true,
        paymentEvent: { include: { businessTransaction: true } },
      },
    });

    expect(attemptAfter?.status).toBe("SUCCESSFUL");
    expect(attemptAfter?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attemptAfter?.outcome?.actualRecoveredAmount)).toBe(232.0);
    expect(attemptAfter?.paymentEvent.businessTransaction?.status).toBe("RECOVERED");
    expect(attemptAfter?.paymentEvent.businessTransaction?.recoveryAttribution).toBe("RECOVERAI");
  });

  // --------------------------------------------------------------------------
  // Test 7: Customer Independent Retry keeps ATTEMPTED status
  // --------------------------------------------------------------------------
  it("CUSTOMER RETRY: independent customer payment does NOT cancel open recovery attempt", async () => {
    const extId = `pay_cust_retry_fail_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 500.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    const custRetryWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_cust_indep_${Date.now()}`,
            amount: 50000,
            currency: "INR",
            status: "captured",
            order_id: payment.orderReference,
            notes: [],
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(custRetryWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(custRetryWebhook);

    expect(webhookRes.status).toBe(200);

    const attemptAfter = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: { outcome: true },
    });

    expect(attemptAfter?.status).toBe("ATTEMPTED");
    expect(attemptAfter?.outcome).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test 8: Persistence Regression
  // --------------------------------------------------------------------------
  it("PERSISTENCE REGRESSION: provider confirmation -> persist SUCCESSFUL in PostgreSQL -> reload from DB -> still SUCCESSFUL with 232", async () => {
    const extId = `pay_persist_regress_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 232.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;
    const providerReference = execRes.body.data.providerReference;
    expect(providerReference).toBeDefined();

    const captureWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_persist_captured_${Date.now()}`,
            amount: 23200,
            currency: "INR",
            status: "captured",
            invoice_id: providerReference,
            order_id: payment.orderReference,
            notes: [],
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(captureWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(webhookRes.body.actualRecoveredAmount).toBe(232.0);

    const dbAttempt = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: {
        outcome: true,
        paymentEvent: { include: { businessTransaction: true } },
      },
    });

    expect(dbAttempt).toBeDefined();
    expect(dbAttempt?.status).toBe("SUCCESSFUL");
    expect(dbAttempt?.completedAt).not.toBeNull();
    expect(dbAttempt?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(dbAttempt?.outcome?.actualRecoveredAmount)).toBe(232.0);
    expect(dbAttempt?.paymentEvent.businessTransaction?.status).toBe("RECOVERED");
    expect(dbAttempt?.paymentEvent.businessTransaction?.recoveryAttribution).toBe("RECOVERAI");

    // Simulate Dashboard reload
    const dashPaymentsRes = await request(app)
      .get("/api/dashboard/payments")
      .set("Authorization", `Bearer ${token}`);

    expect(dashPaymentsRes.status).toBe(200);
    const item = dashPaymentsRes.body.data.items.find(
      (p: { id: string }) => p.id === payment.id
    );
    expect(item).toBeDefined();
    expect(item.latestAttempt?.status).toBe("SUCCESSFUL");
    expect(item.latestOutcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(item.latestOutcome?.actualRecoveredAmount)).toBe(232);

    // Duplicate webhook
    const duplicateRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);

    expect(duplicateRes.status).toBe(200);
    expect(duplicateRes.body.isRecoveryConfirmation).toBe(true);

    const outcomes = await prisma.recoveryOutcome.findMany({
      where: { recoveryAttemptId: attemptId },
    });
    expect(outcomes.length).toBe(1);
    expect(Number(outcomes[0].actualRecoveredAmount)).toBe(232);
  });

  // --------------------------------------------------------------------------
  // Test 9: Payment Pages Isolation & Normal Ingestion
  // --------------------------------------------------------------------------
  it("PAYMENT PAGES ISOLATION: unrelated Payment Pages payment.failed is NOT intercepted by historical paid links, reaches normal pipeline, and persists PaymentEvent", async () => {
    const histFailed = await setupFailedPayment(`pay_hist_for_link_${Date.now()}`, 100.0);
    const histExecRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: histFailed.id });
    expect(histExecRes.status).toBe(201);
    const histPlink = histExecRes.body.data.providerReference;

    const paymentPageExtId = `pay_page_fail_${Date.now()}`;
    const paymentPageOrderId = `order_page_${Date.now()}`;
    const paymentPageWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentPageExtId,
            amount: 123400,
            currency: "INR",
            status: "failed",
            order_id: paymentPageOrderId,
            invoice_id: null,
            method: "card",
            notes: {
              email: "test@example.com",
              phone: "+919876543210",
            },
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment failed",
            error_source: "gateway",
            error_step: "payment_authorization",
            error_reason: "payment_failed",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(paymentPageWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(paymentPageWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBeFalsy();
    expect(webhookRes.body.success).toBe(true);
    expect(webhookRes.body.eventId).toBeDefined();
    expect(webhookRes.body.status).toBe("FAILED");

    const persistedEvent = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paymentPageExtId },
      include: {
        businessTransaction: true,
        failure: true,
        assessment: true,
        recommendation: true,
      },
    });

    expect(persistedEvent).toBeDefined();
    expect(Number(persistedEvent?.amount)).toBe(1234.0);
    expect(persistedEvent?.status).toBe("FAILED");
    expect(persistedEvent?.orderReference).toBe(paymentPageOrderId);
    expect(persistedEvent?.businessTransaction).toBeDefined();
    expect(persistedEvent?.businessTransaction?.status).toBe("FAILED");
    expect(persistedEvent?.failure).toBeDefined();

    // Genuine recovery confirmation still works
    const genuineRecoveryWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_genuine_recovery_${Date.now()}`,
            amount: 10000,
            currency: "INR",
            status: "captured",
            invoice_id: histPlink,
            order_id: histFailed.orderReference,
            notes: [],
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const genuineSig = signPayload(genuineRecoveryWebhook);
    const genuineRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", genuineSig)
      .send(genuineRecoveryWebhook);

    expect(genuineRes.status).toBe(200);
    expect(genuineRes.body.isRecoveryConfirmation).toBe(true);
    expect(genuineRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(Number(genuineRes.body.actualRecoveredAmount)).toBe(100.0);
  });
});
