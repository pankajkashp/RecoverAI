/**
 * RecoverAI — Phase 11: Razorpay Sandbox Integration Tests
 *
 * Validates:
 * 1. RazorpayProviderAdapter normalization and schema translation
 * 2. ProviderRegistry resolution for RAZORPAY
 * 3. Razorpay webhook signature verification (HMAC SHA256)
 * 4. Ingestion of Razorpay webhooks through the existing core payment pipeline
 * 5. Webhook idempotency (duplicate webhook deliveries)
 * 6. Razorpay Test Recovery Adapter execution
 */

import crypto from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import {
  RazorpayProviderAdapter,
  RazorpayRecoveryAdapter,
  ProviderRegistry,
  type RazorpayWebhookPayload,
} from "@recoverai/integrations";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

const TEST_WEBHOOK_SECRET = "test_webhook_secret_key";

function signPayload(payload: object, secret: string = TEST_WEBHOOK_SECRET): string {
  const jsonStr = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(jsonStr).digest("hex");
}

describe("Phase 11 — Razorpay Sandbox Integration", () => {
  const testCompanyId = `company_rzp_${Date.now()}`;
  let razorpayProviderId: string;

  beforeAll(async () => {
    // 1. Seed Company
    await prisma.company.create({
      data: {
        id: testCompanyId,
        name: "Razorpay Test Merchant Corp",
      },
    });

    // 2. Seed Provider
    const provider = await prisma.provider.create({
      data: {
        id: `prov_rzp_${Date.now()}`,
        name: "Razorpay Test Provider",
        type: "RAZORPAY",
      },
    });
    razorpayProviderId = provider.id;
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { companyId: testCompanyId } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { companyId: testCompanyId } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { companyId: testCompanyId } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { companyId: testCompanyId } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { companyId: testCompanyId } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { companyId: testCompanyId },
    });
    await prisma.provider.deleteMany({
      where: { id: razorpayProviderId },
    });
    await prisma.company.deleteMany({
      where: { id: testCompanyId },
    });
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Adapter & Registry Unit Tests
  // --------------------------------------------------------------------------
  describe("RazorpayProviderAdapter & Registry", () => {
    const adapter = new RazorpayProviderAdapter();

    it("registers and resolves RazorpayProviderAdapter in ProviderRegistry", () => {
      const resolved = ProviderRegistry.getInstance().getAdapter("RAZORPAY");
      expect(resolved).toBeDefined();
      expect(resolved.providerType).toBe("RAZORPAY");
    });

    it("normalizes a failed Razorpay webhook payload into CanonicalPaymentEvent", () => {
      const webhookPayload: RazorpayWebhookPayload = {
        entity: "event",
        event: "payment.failed",
        account_id: "acc_test_123",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_fail_001",
              entity: "payment",
              amount: 250000, // 2,500.00 INR (paise)
              currency: "INR",
              status: "failed",
              order_id: "order_test_999",
              invoice_id: null,
              international: false,
              method: "card",
              card_id: "card_test_111",
              card: {
                id: "card_test_111",
                entity: "card",
                name: "John Doe",
                last4: "4242",
                network: "Visa",
                type: "credit",
                issuer: "HDFC",
              },
              bank: "HDFC",
              wallet: null,
              vpa: null,
              email: "john.doe@example.com",
              contact: "+919876543210",
              notes: {
                company_id: testCompanyId,
                customer_id: "cust_rzp_99",
              },
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Card issuer declined payment due to insufficient balance",
              error_source: "bank",
              error_step: "payment_authorization",
              error_reason: "insufficient_funds",
              created_at: 1724600000,
              acquirer_data: { auth_code: "AUTH_001" },
            },
          },
        },
      };

      const canonical = adapter.normalize(webhookPayload);

      expect(canonical.externalPaymentId).toBe("pay_rzp_fail_001");
      expect(canonical.companyId).toBe(testCompanyId);
      expect(canonical.amount).toBe(2500.0); // Converted from paise
      expect(canonical.currency).toBe("INR");
      expect(canonical.status).toBe("FAILED");
      expect(canonical.eventType).toBe("PAYMENT_FAILED");
      expect(canonical.paymentMethod).toBe("CARD");
      expect(canonical.failureCode).toBe("insufficient_funds");
      expect(canonical.failureMessage).toBe(
        "Card issuer declined payment due to insufficient balance"
      );
      expect(canonical.failureCategory).toBe("INSUFFICIENT_FUNDS");
      expect(canonical.customerReference).toBe("cust_rzp_99");
      expect(canonical.eventTimestamp).toEqual(new Date(1724600000 * 1000));
      expect(canonical.metadata?.provider).toBe("RAZORPAY");
      expect(canonical.metadata?.orderId).toBe("order_test_999");
      expect(canonical.metadata?.card).toEqual(
        expect.objectContaining({ last4: "4242", network: "Visa" })
      );
    });

    it("normalizes a captured Razorpay payment event into CanonicalPaymentEvent", () => {
      const webhookPayload: RazorpayWebhookPayload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_cap_002",
              entity: "payment",
              amount: 50000, // 500.00 INR
              currency: "INR",
              status: "captured",
              method: "upi",
              vpa: "customer@okhdfc",
              notes: { companyId: testCompanyId },
              created_at: 1724600100,
              acquirer_data: {},
            },
          },
        },
      };

      const canonical = adapter.normalize(webhookPayload);

      expect(canonical.externalPaymentId).toBe("pay_rzp_cap_002");
      expect(canonical.amount).toBe(500.0);
      expect(canonical.status).toBe("COMPLETED");
      expect(canonical.eventType).toBe("PAYMENT_COMPLETED");
      expect(canonical.paymentMethod).toBe("UPI");
      expect(canonical.failureCode).toBeNull();
      expect(canonical.metadata?.vpa).toBe("customer@okhdfc");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Webhook Signature Verification
  // --------------------------------------------------------------------------
  describe("Webhook Signature Security", () => {
    it("rejects webhook requests with missing X-Razorpay-Signature header (400)", async () => {
      const payload = { entity: "event", event: "payment.failed" };
      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Missing X-Razorpay-Signature");
    });

    it("rejects webhook requests with invalid signature (400)", async () => {
      const payload = { entity: "event", event: "payment.failed" };
      const invalidSignature = "invalid_hex_signature_hash_value_1234567890abcdef";

      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .set("X-Razorpay-Signature", invalidSignature)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Invalid Razorpay webhook signature");
    });

    it("accepts webhook requests with valid HMAC SHA256 signature", async () => {
      const payload = {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_rzp_sig_${Date.now()}`,
              entity: "payment",
              amount: 10000, // 100 INR
              currency: "INR",
              status: "captured",
              method: "upi",
              notes: { company_id: testCompanyId },
              created_at: Math.floor(Date.now() / 1000),
              acquirer_data: {},
            },
          },
        },
      };

      const validSig = signPayload(payload);

      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .set("X-Razorpay-Signature", validSig)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isDuplicate).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Full Ingestion Pipeline & Idempotency
  // --------------------------------------------------------------------------
  describe("Razorpay Webhook -> Core Pipeline Ingestion & Idempotency", () => {
    const extPaymentId = `pay_rzp_pipeline_${Date.now()}`;

    const failedPayload: RazorpayWebhookPayload = {
      entity: "event",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: extPaymentId,
            entity: "payment",
            amount: 750000, // 7,500.00 INR
            currency: "INR",
            status: "failed",
            method: "card",
            card: {
              last4: "8888",
              network: "MasterCard",
              type: "debit",
            },
            notes: {
              company_id: testCompanyId,
              customer_id: "cust_rzp_pipe_1",
            },
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment declined by customer bank due to low funds",
            error_source: "bank",
            error_step: "payment_authorization",
            error_reason: "insufficient_funds",
            created_at: Math.floor(Date.now() / 1000),
            acquirer_data: {},
          },
        },
      },
    };

    it("ingests failed Razorpay event and triggers failure analysis, recovery intelligence, and recommendation in DB", async () => {
      const signature = signPayload(failedPayload);

      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .set("X-Razorpay-Signature", signature)
        .send(failedPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isDuplicate).toBe(false);
      expect(res.body.externalPaymentId).toBe(extPaymentId);

      // Verify records in PostgreSQL
      const payment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: extPaymentId, companyId: testCompanyId },
        include: {
          failure: true,
          assessment: true,
          recommendation: true,
        },
      });

      expect(payment).toBeDefined();
      expect(payment?.status).toBe("FAILED");
      expect(Number(payment?.amount)).toBe(7500.0);
      expect(payment?.paymentMethod).toBe("CARD");

      // Failure Analysis
      expect(payment?.failure?.category).toBe("INSUFFICIENT_FUNDS");

      // Recovery Assessment
      expect(payment?.assessment?.worthiness).toBe("RECOVER");
      expect(Number(payment?.assessment?.estimatedRecoverableAmount)).toBe(7500.0);

      // Recovery Recommendation
      expect(payment?.recommendation?.action).toBe("RETRY_PAYMENT");
      expect(payment?.recommendation?.status).toBe("RECOMMENDED");
    });

    it("safely handles duplicate Razorpay webhook delivery (idempotency)", async () => {
      const signature = signPayload(failedPayload);

      // Re-send the exact same webhook payload
      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .set("X-Razorpay-Signature", signature)
        .send(failedPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isDuplicate).toBe(true);

      // Verify that NO duplicate records were created in the database
      const count = await prisma.paymentEvent.count({
        where: { externalPaymentId: extPaymentId, companyId: testCompanyId },
      });
      expect(count).toBe(1);

      const failureCount = await prisma.paymentFailure.count({
        where: { paymentEvent: { externalPaymentId: extPaymentId } },
      });
      expect(failureCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Razorpay Test Recovery Adapter
  // --------------------------------------------------------------------------
  describe("RazorpayRecoveryAdapter", () => {
    const recoveryAdapter = new RazorpayRecoveryAdapter();

    it("executes test recovery in Sandbox mode without real customer charges", async () => {
      const canonicalEvent = new RazorpayProviderAdapter().normalize({
        id: "pay_rzp_rec_test",
        amount: 300000,
        currency: "INR",
        status: "failed",
        method: "card",
        created_at: Math.floor(Date.now() / 1000),
        notes: { company_id: testCompanyId },
        error_reason: "insufficient_funds",
      });

      const recommendation = {
        action: "RETRY_PAYMENT" as const,
        status: "RECOMMENDED" as const,
        reason: "Automatic retry recommended",
        confidence: 0.9,
        ruleSource: "deterministic-rules-v1",
        mlUsed: false,
        mlProbability: null,
        recommendedAt: new Date(),
      };

      const outcome = await recoveryAdapter.executeRecovery(
        canonicalEvent,
        recommendation
      );

      expect(outcome.status).toBe("SUCCESSFUL");
      expect(outcome.actualRecoveredAmount).toBe(3000.0);
      expect(outcome.attemptReference).toContain("att_rzp_test_");
    });
  });
});
