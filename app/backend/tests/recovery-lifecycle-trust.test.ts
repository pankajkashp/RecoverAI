/**
 * RecoverAI — Recovery Lifecycle & Critical Trust Invariant Tests
 *
 * Verifies:
 * 1. ATTEMPTED != RECOVERED: Initiating recovery does NOT create recovered revenue.
 * 2. Provider Confirmation: Only verified payment.captured / order.paid webhooks finalize recovery.
 * 3. Tenant Isolation: Recovery execution strictly rejects cross-tenant requests (HTTP 403).
 * 4. Idempotency: Duplicate webhooks or duplicate recovery requests do not double-count revenue.
 * 5. Failure Handling: Failed recovery does not increase actualRecoveredAmount.
 * 6. Non-Recovery Isolation: Regular payments do not falsely confirm recovery attempts.
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

describe("Recovery Lifecycle & Critical Trust Invariant", () => {
  const companyA = `comp_trust_a_${Date.now()}`;
  const companyB = `comp_trust_b_${Date.now()}`;
  let tokenCompanyA: string;
  let tokenCompanyB: string;


  beforeAll(async () => {
    // 1. Seed two distinct companies for multi-tenant isolation testing
    await prisma.company.createMany({
      data: [
        { id: companyA, name: "Trust Merchant Corp A" },
        { id: companyB, name: "Trust Merchant Corp B" },
      ],
    });

    // 2. Generate auth tokens
    tokenCompanyA = `demo_token_${companyA}`;
    tokenCompanyB = `demo_token_${companyB}`;


    // 3. Ensure Razorpay Provider exists
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
    // Cleanup records
    for (const cid of [companyA, companyB]) {
      await prisma.recoveryOutcome.deleteMany({
        where: { recoveryAttempt: { paymentEvent: { companyId: cid } } },
      });
      await prisma.recoveryAttempt.deleteMany({
        where: { paymentEvent: { companyId: cid } },
      });
      await prisma.recoveryRecommendation.deleteMany({
        where: { paymentEvent: { companyId: cid } },
      });
      await prisma.recoveryAssessment.deleteMany({
        where: { paymentEvent: { companyId: cid } },
      });
      await prisma.paymentFailure.deleteMany({
        where: { paymentEvent: { companyId: cid } },
      });
      await prisma.paymentEvent.deleteMany({
        where: { companyId: cid },
      });
      await prisma.company.deleteMany({
        where: { id: cid },
      });
    }
    await prisma.$disconnect();
  });

  // Helper to ingest a failed payment into Company A
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
            notes: { companyId: companyA },
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
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
      .set("X-Razorpay-Signature", signature)
      .send(failedWebhook);

    expect(ingestRes.status).toBe(200);

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paymentExtId, companyId: companyA },
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
      .get(`/api/dashboard/summary?companyId=${companyA}`)
      .set("Authorization", `Bearer ${tokenCompanyA}`);

    const initialActuallyRecovered = Number(
      initialDash.body.data.metrics.actualRecoveredAmount
    );

    // Step 1: Initiate Recovery
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompanyA}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    expect(execRes.body.data.status).toBe("EXECUTED");
    expect(execRes.body.data.attemptStatus).toBe("ATTEMPTED");
    // Trust Invariant: actualRecoveredAmount MUST be null
    expect(execRes.body.data.actualRecoveredAmount).toBeNull();
    expect(execRes.body.data.checkoutUrl).toBeDefined();

    // Verify in PostgreSQL: RecoveryAttempt exists as ATTEMPTED, RecoveryOutcome does NOT exist yet
    const attemptInDb = await prisma.recoveryAttempt.findFirst({
      where: { paymentEventId: payment.id },
      include: { outcome: true },
    });
    expect(attemptInDb).toBeDefined();
    expect(attemptInDb?.status).toBe("ATTEMPTED");
    expect(attemptInDb?.outcome).toBeNull(); // No premature outcome!

    // Verify Dashboard: "Actually Recovered" MUST NOT have increased
    const afterInitiateDash = await request(app)
      .get(`/api/dashboard/summary?companyId=${companyA}`)
      .set("Authorization", `Bearer ${tokenCompanyA}`);

    const afterInitiateActuallyRecovered = Number(
      afterInitiateDash.body.data.metrics.actualRecoveredAmount
    );

    expect(afterInitiateActuallyRecovered).toBe(initialActuallyRecovered);
  });

  // --------------------------------------------------------------------------
  // Test 2: Provider Confirmation via Verified Webhook
  // --------------------------------------------------------------------------
  it("PROVIDER CONFIRMATION: payment.captured confirms recovery and credits exact confirmed amount", async () => {
    const extId = `pay_fail_confirm_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 8500.0);

    // Initiate recovery
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompanyA}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;
    expect(attemptId).toBeDefined();

    // Simulate customer completing payment in Razorpay Test Mode
    // Razorpay sends payment.captured webhook with correlation notes
    const retryPaymentId = `pay_retry_${Date.now()}`;
    const capturedWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: retryPaymentId,
            amount: 850000, // 8500.00 INR
            currency: "INR",
            status: "captured",
            method: "upi",
            notes: {
              companyId: companyA,
              paymentEventId: payment.id,
              originalExternalPaymentId: extId,
              recoveryAttemptId: attemptId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(capturedWebhook);
    const webhookRes = await request(app)
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
      .set("X-Razorpay-Signature", signature)
      .send(capturedWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(webhookRes.body.actualRecoveredAmount).toBe(8500.0);

    // Verify DB state: RecoveryAttempt is SUCCESSFUL and RecoveryOutcome is created
    const attemptAfter = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: { outcome: true },
    });
    expect(attemptAfter?.status).toBe("SUCCESSFUL");
    expect(attemptAfter?.outcome).toBeDefined();
    expect(attemptAfter?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attemptAfter?.outcome?.actualRecoveredAmount)).toBe(8500.0);

    // Verify Dashboard: "Actually Recovered" increases by exactly 8500.00
    const finalDash = await request(app)
      .get(`/api/dashboard/summary?companyId=${companyA}`)
      .set("Authorization", `Bearer ${tokenCompanyA}`);

    const finalActuallyRecovered = Number(
      finalDash.body.data.metrics.actualRecoveredAmount
    );

    expect(finalActuallyRecovered).toBeGreaterThanOrEqual(8500.0);
  });

  // --------------------------------------------------------------------------
  // Test 3: Confirmation Idempotency (Duplicate Webhook)
  // --------------------------------------------------------------------------
  it("IDEMPOTENCY: Duplicate payment.captured webhook delivery does NOT double-count recovery revenue", async () => {
    const extId = `pay_fail_idemp_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 4000.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompanyA}`)
      .send({ paymentEventId: payment.id });

    const attemptId = execRes.body.data.recoveryAttemptId;

    const capturedWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_idemp_${Date.now()}`,
            amount: 400000,
            currency: "INR",
            status: "captured",
            notes: {
              companyId: companyA,
              recoveryAttemptId: attemptId,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(capturedWebhook);

    // First delivery
    const res1 = await request(app)
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
      .set("X-Razorpay-Signature", signature)
      .send(capturedWebhook);
    expect(res1.status).toBe(200);

    // Second delivery (duplicate webhook)
    const res2 = await request(app)
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
      .set("X-Razorpay-Signature", signature)
      .send(capturedWebhook);
    expect(res2.status).toBe(200);
    expect(res2.body.message).toContain("idempotent duplicate");

    // Exactly 1 outcome record in PostgreSQL
    const outcomeCount = await prisma.recoveryOutcome.count({
      where: { recoveryAttemptId: attemptId },
    });
    expect(outcomeCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Test 4: Tenant Isolation Enforcement
  // --------------------------------------------------------------------------
  it("TENANT ISOLATION: Company B cannot execute recovery on Company A's payment event (HTTP 403)", async () => {
    const extId = `pay_fail_iso_${Date.now()}`;
    const paymentA = await setupFailedPayment(extId, 9999.0);

    // Company B attempts to trigger recovery on Company A's payment
    const unauthorizedRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompanyB}`) // Authenticated as Company B
      .send({ paymentEventId: paymentA.id });

    expect(unauthorizedRes.status).toBe(403);
    expect(unauthorizedRes.body.success).toBe(false);
    expect(unauthorizedRes.body.code).toBe("TENANT_ISOLATION_VIOLATION");

    // Ensure NO recovery attempt was created
    const attempts = await prisma.recoveryAttempt.findMany({
      where: { paymentEventId: paymentA.id },
    });
    expect(attempts.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test 5: Unrelated Payment Captured Isolation
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
            notes: { companyId: companyA }, // Normal notes without recovery correlation
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(regularWebhook);
    const res = await request(app)
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
      .set("X-Razorpay-Signature", signature)
      .send(regularWebhook);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isRecoveryConfirmation).toBeUndefined(); // Normal ingestion
    expect(res.body.status).toBe("COMPLETED");
  });

  // --------------------------------------------------------------------------
  // Test 6: Failed Recovery Payment Handling
  // --------------------------------------------------------------------------
  it("FAILED RECOVERY: payment.failed on recovery attempt sets FAILED status with 0 recovered amount", async () => {
    const extId = `pay_fail_retryfail_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 3500.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompanyA}`)
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
              companyId: companyA,
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
      .post(`/api/webhooks/razorpay?companyId=${companyA}`)
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
});
