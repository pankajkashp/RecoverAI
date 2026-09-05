/**
 * RecoverAI — Complete Razorpay Recovery Lifecycle & Dashboard Consistency Tests
 *
 * Validates the complete real-world Razorpay recovery lifecycle:
 * 1. RecoveryAttempt created with Razorpay Payment Link ID.
 * 2. payment.captured containing matching reference → RecoveryOutcome SUCCESSFUL.
 * 3. payment_link.paid containing matching Payment Link ID → RecoveryOutcome SUCCESSFUL.
 * 4. Successful payment with no matching RecoveryAttempt → NOT RecoverAI recovery.
 * 5. Unrelated Payment Link with same amount → NOT recovery.
 * 6. Same webhook delivered twice → only one RecoveryOutcome / no double-counting (idempotent).
 * 7. Actual recovered amount comes from confirmed provider amount.
 * 8. BusinessTransaction becomes RECOVERED.
 * 9. Recovery attribution becomes RECOVERAI.
 * 10. Dashboard summary includes actual recovered amount.
 * 11. Dashboard payment lifecycle shows the recovery.
 * 12. Failed/attempted recovery with no provider confirmation does NOT count as recovered.
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

describe("Razorpay Recovery Confirmation & Dashboard Consistency Lifecycle", { timeout: 60000 }, () => {
  let token: string;
  let _razorpayProviderId: string;

  beforeAll(async () => {
    token = "demo_token_single_business";

    // Ensure Razorpay Provider exists
    let provider = await prisma.provider.findFirst({
      where: { type: "RAZORPAY" },
    });

    if (!provider) {
      provider = await prisma.provider.create({
        data: {
          id: `prov_rzp_life_${Date.now()}`,
          name: "Razorpay Test",
          type: "RAZORPAY",
        },
      });
    }
    _razorpayProviderId = provider.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to ingest a failed payment
  async function setupFailedPayment(paymentExtId: string, amount: number = 750.0) {
    const failedWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentExtId,
            amount: Math.round(amount * 100),
            currency: "INR",
            status: "failed",
            method: "card",
            notes: {},
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Card declined: insufficient funds",
            error_source: "bank",
            error_step: "payment_authorization",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(failedWebhook);
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(failedWebhook);

    expect(res.status).toBe(200);

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paymentExtId },
      include: {
        recommendation: true,
        assessment: true,
        businessTransaction: true,
      },
    });

    expect(payment).toBeDefined();
    expect(payment?.recommendation?.action).toBe("RETRY_PAYMENT");
    return payment!;
  }

  // --------------------------------------------------------------------------
  // Test 1, 2, 7, 8, 9, 10, 11: Complete payment.captured recovery confirmation flow
  // --------------------------------------------------------------------------
  it("Lifecycle Flow 1: payment.captured confirms recovery with exact provider amount, updates BT, Rec, and Dashboard", async () => {
    const extId = `pay_life_cap_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 1500.0);

    // Initial Dashboard Summary
    const initialDash = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);
    const initialRecovered = Number(initialDash.body?.data?.metrics?.actualRecoveredAmount ?? 0);
    const initialRecoveredCount = Number(initialDash.body?.data?.metrics?.successfulRecoveryCount ?? 0);

    // 1. Create RecoveryAttempt (stores Razorpay Payment Link ID)
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    expect(execRes.body.data.status).toBe("EXECUTED");
    expect(execRes.body.data.attemptStatus).toBe("ATTEMPTED");
    expect(execRes.body.data.actualRecoveredAmount).toBeNull();
    const attemptId = execRes.body.data.recoveryAttemptId;
    const providerReference = execRes.body.data.providerReference;
    expect(attemptId).toBeDefined();
    expect(providerReference).toMatch(/^plink_/);

    // 12. Unconfirmed recovery attempt does NOT count as recovered
    const midDash = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);
    expect(Number(midDash.body?.data?.metrics?.actualRecoveredAmount ?? 0)).toBe(initialRecovered);

    // 2. Customer pays link -> Razorpay sends payment.captured webhook
    const captureWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_captured_${Date.now()}`,
            amount: 150000, // 1500.00 INR
            currency: "INR",
            status: "captured",
            invoice_id: providerReference,
            order_id: `order_rzp_${Date.now()}`,
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
    // 7. Actual recovered amount comes from confirmed provider amount
    expect(webhookRes.body.actualRecoveredAmount).toBe(1500.0);
    expect(webhookRes.body.recoveryAttemptId).toBe(attemptId);

    // Verify PostgreSQL persistence
    const attemptInDb = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: {
        outcome: true,
        paymentEvent: {
          include: {
            businessTransaction: true,
            recommendation: true,
          },
        },
      },
    });

    expect(attemptInDb).toBeDefined();
    expect(attemptInDb?.status).toBe("SUCCESSFUL");
    expect(attemptInDb?.outcome).toBeDefined();
    expect(attemptInDb?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attemptInDb?.outcome?.actualRecoveredAmount)).toBe(1500.0);
    // 8. BusinessTransaction becomes RECOVERED
    expect(attemptInDb?.paymentEvent.businessTransaction?.status).toBe("RECOVERED");
    // 9. Recovery attribution becomes RECOVERAI
    expect(attemptInDb?.paymentEvent.businessTransaction?.recoveryAttribution).toBe("RECOVERAI");
    // Recommendation updated to EXECUTED
    expect(attemptInDb?.paymentEvent.recommendation?.status).toBe("EXECUTED");

    // 10. Dashboard summary includes actual recovered amount
    const finalDash = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);
    expect(finalDash.status).toBe(200);
    expect(Number(finalDash.body.data.metrics.actualRecoveredAmount)).toBe(initialRecovered + 1500.0);
    expect(Number(finalDash.body.data.metrics.successfulRecoveryCount)).toBe(initialRecoveredCount + 1);

    // 11. Dashboard payment lifecycle returns the recovery attempt and outcome
    const dashPayments = await request(app)
      .get("/api/dashboard/payments")
      .set("Authorization", `Bearer ${token}`);
    expect(dashPayments.status).toBe(200);
    const item = dashPayments.body.data.items.find(
      (p: { id: string }) => p.id === payment.id
    );
    expect(item).toBeDefined();
    expect(item.latestAttempt?.status).toBe("SUCCESSFUL");
    expect(item.latestOutcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(item.latestOutcome?.actualRecoveredAmount)).toBe(1500.0);

    // 6. Same webhook delivered twice -> Idempotent duplicate, only 1 outcome
    const duplicateRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(captureWebhook);

    expect(duplicateRes.status).toBe(200);
    expect(duplicateRes.body.isRecoveryConfirmation).toBe(true);
    expect(duplicateRes.body.message).toContain("idempotent duplicate");

    const outcomesCount = await prisma.recoveryOutcome.count({
      where: { recoveryAttemptId: attemptId },
    });
    expect(outcomesCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Test 3: payment_link.paid webhook recovery confirmation
  // --------------------------------------------------------------------------
  it("Lifecycle Flow 2: payment_link.paid confirms recovery with matching Payment Link ID", async () => {
    const extId = `pay_life_plink_${Date.now()}`;
    const payment = await setupFailedPayment(extId, 3200.0);

    // 1. Create RecoveryAttempt
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });

    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;
    const providerReference = execRes.body.data.providerReference;
    expect(providerReference).toMatch(/^plink_/);

    // 2. Razorpay sends payment_link.paid webhook
    const plinkPaidWebhook = {
      event: "payment_link.paid",
      payload: {
        payment_link: {
          entity: {
            id: providerReference,
            amount: 320000,
            amount_paid: 320000,
            currency: "INR",
            status: "paid",
            order_id: `order_plink_${Date.now()}`,
            notes: {
              paymentEventId: payment.id,
            },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(plinkPaidWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(plinkPaidWebhook);

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("SUCCESSFUL");
    expect(webhookRes.body.actualRecoveredAmount).toBe(3200.0);

    // Verify PostgreSQL persistence
    const attemptInDb = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: {
        outcome: true,
        paymentEvent: { include: { businessTransaction: true } },
      },
    });

    expect(attemptInDb?.status).toBe("SUCCESSFUL");
    expect(attemptInDb?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attemptInDb?.outcome?.actualRecoveredAmount)).toBe(3200.0);
    expect(attemptInDb?.paymentEvent.businessTransaction?.status).toBe("RECOVERED");
    expect(attemptInDb?.paymentEvent.businessTransaction?.recoveryAttribution).toBe("RECOVERAI");
  });

  // --------------------------------------------------------------------------
  // Test 4: Successful payment with no matching RecoveryAttempt -> NOT RecoverAI recovery
  // --------------------------------------------------------------------------
  it("Isolation 1: Successful regular payment with no matching RecoveryAttempt is NOT attributed to RecoverAI", async () => {
    const regularPaymentId = `pay_reg_success_${Date.now()}`;
    const regularWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: regularPaymentId,
            amount: 500000, // 5000.00 INR
            currency: "INR",
            status: "captured",
            method: "upi",
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
    expect(res.body.isRecoveryConfirmation).toBeFalsy();
    expect(res.body.status).toBe("COMPLETED");

    // Ensure NO recovery outcome was created for this payment
    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: regularPaymentId },
      include: { attempts: { include: { outcome: true } } },
    });
    expect(payment).toBeDefined();
    expect(payment?.attempts.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test 5: Unrelated Payment Link with same amount -> NOT recovery
  // --------------------------------------------------------------------------
  it("Isolation 2: Unrelated Payment Link with same amount is NOT matched to existing recovery attempt", async () => {
    // 1. Setup a recovery attempt for ₹4,500
    const failExtId = `pay_unrelated_target_${Date.now()}`;
    const payment = await setupFailedPayment(failExtId, 4500.0);

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentEventId: payment.id });
    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;

    // 2. Incoming webhook for a completely different payment link with the same amount (4500.00 INR)
    const unrelatedPlinkId = `plink_unrelated_${Date.now()}`;
    const unrelatedWebhook = {
      event: "payment_link.paid",
      payload: {
        payment_link: {
          entity: {
            id: unrelatedPlinkId, // Different Payment Link ID!
            amount: 450000,
            amount_paid: 450000,
            currency: "INR",
            status: "paid",
            notes: {},
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const signature = signPayload(unrelatedWebhook);
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(unrelatedWebhook);

    expect(res.status).toBe(200);
    expect(res.body.isRecoveryConfirmation).toBeFalsy(); // Must NOT match!

    // Ensure target recovery attempt remains ATTEMPTED with NO outcome
    const targetAttempt = await prisma.recoveryAttempt.findUnique({
      where: { id: attemptId },
      include: { outcome: true },
    });
    expect(targetAttempt?.status).toBe("ATTEMPTED");
    expect(targetAttempt?.outcome).toBeNull();
  });
});
