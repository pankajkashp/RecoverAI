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
import { environment } from "../src/config/env.js";

const prisma = new PrismaClient();
const app = createApp();

const TEST_WEBHOOK_SECRET =
  environment.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret_key";

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

      // Invariant: Initiating recovery returns ATTEMPTED, NOT recovered money
      expect(outcome.status).toBe("ATTEMPTED");
      expect(outcome.actualRecoveredAmount).toBeNull();
      expect(outcome.attemptReference).toMatch(/plink_/);

      // Simulation override can force outcome for specific test scenarios
      const forcedOutcome = await recoveryAdapter.executeRecovery(
        canonicalEvent,
        recommendation,
        { forceOutcome: "SUCCESSFUL" }
      );
      expect(forcedOutcome.status).toBe("SUCCESSFUL");
      expect(forcedOutcome.actualRecoveredAmount).toBe(3000.0);
    });
  });

  describe("Razorpay Empty Array & Webhook Envelope Handling", () => {
    const testAdapter = new RazorpayProviderAdapter();

    it("handles notes: [], acquirer_data: [], and metadata: [] without throwing Zod errors", () => {
      const payloadWithEmptyArrays = {
        entity: "event",
        event: "payment.failed",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_empty_arr_001",
              entity: "payment",
              amount: 50000,
              currency: "INR",
              status: "failed",
              order_id: "order_empty_arr_001",
              method: "upi",
              notes: [], // Razorpay empty associative array
              acquirer_data: [], // Razorpay empty associative array
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Payment failed due to invalid UPI PIN",
              error_reason: "payment_failed",
              error: {
                code: "BAD_REQUEST_ERROR",
                description: "Payment failed due to invalid UPI PIN",
                metadata: [], // Razorpay empty array in error metadata
              },
              created_at: 1724600000,
            },
          },
        },
      };

      const canonical = testAdapter.normalize(payloadWithEmptyArrays, {
        companyId: testCompanyId,
      });

      expect(canonical.externalPaymentId).toBe("pay_rzp_empty_arr_001");
      expect(canonical.amount).toBe(500.0);
      expect(canonical.status).toBe("FAILED");
      expect(canonical.metadata?.notes).toEqual({});
      expect(canonical.metadata?.acquirerData).toEqual({});
    });

    it("normalizes order.paid webhooks containing order and payment entities", () => {
      const orderPaidPayload = {
        entity: "event",
        event: "order.paid",
        contains: ["order", "payment"],
        payload: {
          order: {
            entity: {
              id: "order_rzp_paid_101",
              entity: "order",
              amount: 75000,
              amount_paid: 75000,
              currency: "INR",
              status: "paid",
              notes: [],
              created_at: 1724600000,
            },
          },
          payment: {
            entity: {
              id: "pay_rzp_order_paid_101",
              entity: "payment",
              amount: 75000,
              currency: "INR",
              status: "captured",
              order_id: "order_rzp_paid_101",
              method: "card",
              notes: [],
              created_at: 1724600000,
            },
          },
        },
      };

      const canonical = testAdapter.normalize(orderPaidPayload, {
        companyId: testCompanyId,
      });

      expect(canonical.externalPaymentId).toBe("pay_rzp_order_paid_101");
      expect(canonical.amount).toBe(750.0);
      expect(canonical.status).toBe("COMPLETED");
      expect(canonical.orderReference).toBe("order_rzp_paid_101");
    });

    it("ingests real-world Razorpay webhook with notes: [] via HTTP endpoint without error", async () => {
      const paymentId = `pay_rzp_live_${Date.now()}`;
      const payload = {
        entity: "event",
        account_id: "acc_test_12345",
        event: "payment.failed",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 20000, // 200 INR
              currency: "INR",
              status: "failed",
              order_id: `order_${Date.now()}`,
              invoice_id: null,
              international: false,
              method: "upi",
              amount_refunded: 0,
              refund_status: null,
              captured: false,
              description: "Test payment with empty notes array",
              card_id: null,
              bank: null,
              wallet: null,
              vpa: "customer@upi",
              email: "test@example.com",
              contact: "+919876543210",
              notes: [], // THE EXACT CAUSE OF "expected record, received array"
              fee: null,
              tax: null,
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Payment failed at issuing bank",
              error_source: "bank",
              error_step: "payment_authorization",
              error_reason: "insufficient_funds",
              acquirer_data: [],
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", TEST_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const res = await request(app)
        .post(`/api/webhooks/razorpay?companyId=${testCompanyId}`)
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.externalPaymentId).toBe(paymentId);
      expect(res.body.status).toBe("FAILED");
    });

    it("correctly classifies the actual Razorpay test failure (card authorization gateway failure: BAD_REQUEST_ERROR / payment_failed / gateway) as PROVIDER and not UNKNOWN", async () => {
      const paymentId = `pay_rzp_real_232_${Date.now()}`;
      const payload = {
        entity: "event",
        account_id: "acc_TUKVGUGRV6SA5i",
        event: "payment.failed",
        contains: ["payment"],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 23200, // 232 INR
              currency: "INR",
              status: "failed",
              order_id: `order_real_232_${Date.now()}`,
              invoice_id: null,
              international: false,
              method: "card",
              amount_refunded: 0,
              refund_status: null,
              captured: false,
              description: "Payment failed",
              card_id: "card_real_1007",
              card: {
                id: "card_real_1007",
                entity: "card",
                name: "Test User",
                last4: "1007",
                network: "Visa",
                type: "debit",
                issuer: "DCBL",
                international: false,
                emi: false,
              },
              bank: null,
              wallet: null,
              vpa: null,
              email: "customer@example.com",
              contact: "+919876543210",
              notes: [],
              fee: null,
              tax: null,
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Payment failed",
              error_source: "gateway",
              error_step: "payment_authorization",
              error_reason: "payment_failed",
              acquirer_data: { auth_code: null },
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", TEST_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const res = await request(app)
        .post(`/api/webhooks/razorpay?companyId=${testCompanyId}`)
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.externalPaymentId).toBe(paymentId);

      // Verify failure classification in database
      const dbPayment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: paymentId, companyId: testCompanyId },
        include: { failure: true, assessment: true, recommendation: true },
      });

      expect(dbPayment).toBeDefined();
      expect(dbPayment?.failure?.category).toBe("PROVIDER");
      expect(dbPayment?.failure?.category).not.toBe("UNKNOWN");
      expect(dbPayment?.assessment?.worthiness).toBe("RECOVER");
      expect(Number(dbPayment?.assessment?.estimatedRecoverableAmount)).toBe(232.0);
      expect(dbPayment?.recommendation?.action).toBe("RETRY_PAYMENT");
    });

    it("correctly classifies UPI MPIN failure as AUTHENTICATION", async () => {
      const paymentId = `pay_rzp_upi_mpin_${Date.now()}`;
      const payload = {
        entity: "event",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 50000,
              currency: "INR",
              status: "failed",
              method: "upi",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "UPI PIN entered is incorrect",
              error_source: "customer",
              error_step: "payment_authentication",
              error_reason: "incorrect_upi_pin",
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", TEST_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const res = await request(app)
        .post(`/api/webhooks/razorpay?companyId=${testCompanyId}`)
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbPayment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: paymentId },
        include: { failure: true },
      });

      expect(dbPayment?.paymentMethod).toBe("UPI");
      expect(dbPayment?.failure?.category).toBe("AUTHENTICATION");
    });

    it("correctly classifies acquirer response_code 51 as INSUFFICIENT_FUNDS even if error_reason is generic", async () => {
      const paymentId = `pay_rzp_iso51_${Date.now()}`;
      const payload = {
        entity: "event",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 100000,
              currency: "INR",
              status: "failed",
              method: "credit_card",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Transaction failed",
              acquirer_data: { response_code: "51" },
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", TEST_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const res = await request(app)
        .post(`/api/webhooks/razorpay?companyId=${testCompanyId}`)
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbPayment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: paymentId },
        include: { failure: true, assessment: true },
      });

      expect(dbPayment?.paymentMethod).toBe("CARD");
      expect(dbPayment?.failure?.category).toBe("INSUFFICIENT_FUNDS");
      expect(dbPayment?.assessment?.worthiness).toBe("RECOVER");
    });

    it("correctly classifies UPI collect request expiry as CUSTOMER_ACTION_REQUIRED", async () => {
      const paymentId = `pay_rzp_collect_exp_${Date.now()}`;
      const payload = {
        entity: "event",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 15000,
              currency: "INR",
              status: "failed",
              method: "upi",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Collect request expired by customer",
              error_source: "customer",
              error_reason: "collect_request_expired",
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", TEST_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const res = await request(app)
        .post(`/api/webhooks/razorpay?companyId=${testCompanyId}`)
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbPayment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: paymentId },
        include: { failure: true },
      });

      expect(dbPayment?.failure?.category).toBe("CUSTOMER_ACTION_REQUIRED");
    });
  });
});


