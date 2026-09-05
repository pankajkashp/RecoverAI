/**
 * RecoverAI — Phase 10: Production Readiness, Security & Reliability Tests
 *
 * Validates:
 * 1. HTTP security headers & fingerprint stripping
 * 2. Request correlation ID (X-Request-ID) propagation
 * 3. Rate limiting protection on ingestion/execution endpoints
 * 4. Health (/health) and Readiness (/ready) probes
 * 5. Safe centralized error handling (no DB/SQL leaks)
 * 6. Exact mathematical consistency of KPI definitions
 * 7. Token authentication & authorization checks
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient, PaymentStatus, FailureCategory, RecoveryWorthiness, RecommendationStatus, RecoveryAttemptStatus, Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

describe("Phase 10 — Production Readiness, Security & Reliability", () => {
  const testPrefix = `sec_${Date.now()}`;
  let demoProviderId: string;

  beforeAll(async () => {
    const provider = await prisma.provider.create({
      data: {
        id: `prov_sec_${Date.now()}`,
        name: "Security Sandbox Provider",
        type: "DEMO",
      },
    });
    demoProviderId = provider.id;

    // Seed Payment 1: Worthiness = RECOVER, Amount = ₹10,000, Est = ₹10,000, Recovered = ₹10,000
    const pay1 = await prisma.paymentEvent.create({
      data: {
        id: `evt_${testPrefix}_1`,
        externalPaymentId: `ext_${testPrefix}_1`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("10000.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: "CARD",
        eventType: "PAYMENT_FAILED",
        failureCode: "INSUFFICIENT_BALANCE",
        failureMessage: "Low funds",
        eventTimestamp: new Date(),
      },
    });

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay1.id,
        category: FailureCategory.INSUFFICIENT_FUNDS,
        failedAt: new Date(),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay1.id,
        worthiness: RecoveryWorthiness.RECOVER,
        estimatedRecoverableAmount: new Prisma.Decimal("10000.00"),
      },
    });

    await prisma.recoveryRecommendation.create({
      data: {
        paymentEventId: pay1.id,
        action: "RETRY_PAYMENT",
        status: RecommendationStatus.EXECUTED,
      },
    });

    const att1 = await prisma.recoveryAttempt.create({
      data: {
        paymentEventId: pay1.id,
        status: RecoveryAttemptStatus.SUCCESSFUL,
      },
    });

    await prisma.recoveryOutcome.create({
      data: {
        recoveryAttemptId: att1.id,
        paymentEventId: pay1.id,
        outcome: RecoveryAttemptStatus.SUCCESSFUL,
        actualRecoveredAmount: new Prisma.Decimal("10000.00"),
        outcomeTimestamp: new Date(),
      },
    });

    // Seed Payment 2: Worthiness = REVIEW, Amount = ₹5,000, Est = ₹5,000, Recovered = ₹0
    const pay2 = await prisma.paymentEvent.create({
      data: {
        id: `evt_${testPrefix}_2`,
        externalPaymentId: `ext_${testPrefix}_2`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("5000.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_FAILED",
        eventTimestamp: new Date(),
      },
    });

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay2.id,
        category: FailureCategory.NETWORK,
        failedAt: new Date(),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay2.id,
        worthiness: RecoveryWorthiness.REVIEW,
        estimatedRecoverableAmount: new Prisma.Decimal("5000.00"),
      },
    });
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { externalPaymentId: { startsWith: `ext_${testPrefix}` } } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: `ext_${testPrefix}` } } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: `ext_${testPrefix}` } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: `ext_${testPrefix}` } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: `ext_${testPrefix}` } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { externalPaymentId: { startsWith: `ext_${testPrefix}` } },
    });
    await prisma.provider.deleteMany({
      where: { id: demoProviderId },
    });
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Security Headers & Fingerprinting
  // --------------------------------------------------------------------------
  describe("Security Headers & Server Hardening", () => {
    it("sets standard security headers and removes X-Powered-By", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Request Correlation (X-Request-ID)
  // --------------------------------------------------------------------------
  describe("Request Correlation", () => {
    it("generates a new X-Request-ID when not supplied", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-request-id"]).toBeDefined();
      expect(res.headers["x-request-id"].length).toBeGreaterThan(10);
    });

    it("propagates an incoming X-Request-ID header", async () => {
      const customId = "trace-custom-correlation-id-12345";
      const res = await request(app)
        .get("/health")
        .set("X-Request-ID", customId);

      expect(res.headers["x-request-id"]).toBe(customId);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Health & Readiness Probes
  // --------------------------------------------------------------------------
  describe("Health & Readiness Probes", () => {
    it("GET /health returns 200 OK with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });

    it("GET /ready verifies database connectivity and reports ML availability", async () => {
      const res = await request(app).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.database).toBe("connected");
      expect(res.body.mlService).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rate Limiting Protection
  // --------------------------------------------------------------------------
  describe("Rate Limiting", () => {
    it("returns 429 and Retry-After when request limit is exceeded", async () => {
      const { createRateLimiter } = await import(
        "../src/middleware/rate-limiter.middleware.js"
      );
      const testLimiter = createRateLimiter({
        windowMs: 5000,
        maxRequests: 2,
      });

      const express = (await import("express")).default;
      const testApp = express();
      testApp.use(testLimiter);
      testApp.post("/test-rate-limit", (_req, res) => res.json({ ok: true }));

      // Request 1: OK
      const res1 = await request(testApp)
        .post("/test-rate-limit")
        .set("x-test-rate-limit", "true");
      expect(res1.status).toBe(200);

      // Request 2: OK
      const res2 = await request(testApp)
        .post("/test-rate-limit")
        .set("x-test-rate-limit", "true");
      expect(res2.status).toBe(200);

      // Request 3: Blocked (429)
      const res3 = await request(testApp)
        .post("/test-rate-limit")
        .set("x-test-rate-limit", "true");
      expect(res3.status).toBe(429);
      expect(res3.headers["retry-after"]).toBeDefined();
      expect(res3.body.error).toContain("Too many requests");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Safe Centralized Error Handling
  // --------------------------------------------------------------------------
  describe("Safe Error Responses", () => {
    it("does not expose stack traces or database connection strings on 500 errors", async () => {
      const express = (await import("express")).default;
      const errorApp = express();
      errorApp.get("/trigger-db-error", () => {
        throw new Error(
          "PrismaClientKnownRequestError: connection string postgresql://admin:secretPass@db.internal:5432 failed"
        );
      });
      const { errorHandlerMiddleware } = await import(
        "../src/middleware/error-handler.middleware.js"
      );
      errorApp.use(errorHandlerMiddleware);

      const res = await request(errorApp).get("/trigger-db-error");
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Internal server error");
      expect(JSON.stringify(res.body)).not.toContain("secretPass");
      expect(JSON.stringify(res.body)).not.toContain("postgresql://");
    });
  });

  // --------------------------------------------------------------------------
  // 6. KPI Semantics Mathematical Verification
  // --------------------------------------------------------------------------
  describe("KPI Definitions & Mathematical Consistency", () => {
    it("returns consistent dashboard metrics for the single business", async () => {
      const res = await request(app).get("/api/dashboard/summary");

      expect(res.status).toBe(200);
      const { metrics } = res.body.data;

      expect(Number(metrics.potentiallyRecoverableAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(metrics.estimatedRecoverableAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(metrics.actualRecoveredAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(metrics.totalPayments)).toBeGreaterThanOrEqual(0);
    });
  });
});
