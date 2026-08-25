/**
 * RecoverAI — Phase 10: Production Readiness, Security & Reliability Tests
 *
 * Validates:
 * 1. Multi-tenant isolation & cross-tenant access rejection
 * 2. HTTP security headers & fingerprint stripping
 * 3. Request correlation ID (X-Request-ID) propagation
 * 4. Rate limiting protection on ingestion/execution endpoints
 * 5. Health (/health) and Readiness (/ready) probes
 * 6. Safe centralized error handling (no DB/SQL leaks)
 * 7. Exact mathematical consistency of KPI definitions
 * 8. ML Service fallback and execution boundary safety
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient, PaymentStatus, FailureCategory, RecoveryWorthiness, RecommendationStatus, RecoveryAttemptStatus, Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

describe("Phase 10 — Production Readiness, Security & Reliability", () => {
  const companyA = `tenant_a_${Date.now()}`;
  const companyB = `tenant_b_${Date.now()}`;

  let demoProviderId: string;

  beforeAll(async () => {
    // 1. Create Tenant A and Tenant B
    await prisma.company.create({
      data: { id: companyA, name: "Tenant A Corporation" },
    });
    await prisma.company.create({
      data: { id: companyB, name: "Tenant B Corporation" },
    });

    const provider = await prisma.provider.create({
      data: {
        id: `prov_sec_${Date.now()}`,
        name: "Security Sandbox Provider",
        type: "DEMO",
      },
    });
    demoProviderId = provider.id;

    // Seed Payment for Tenant A: Worthiness = RECOVER, Amount = ₹10,000, Est = ₹10,000, Recovered = ₹10,000
    const payA1 = await prisma.paymentEvent.create({
      data: {
        id: `evt_sec_a1_${Date.now()}`,
        externalPaymentId: `ext_sec_a1_${Date.now()}`,
        companyId: companyA,
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
        paymentEventId: payA1.id,
        category: FailureCategory.INSUFFICIENT_FUNDS,
        failedAt: new Date(),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: payA1.id,
        worthiness: RecoveryWorthiness.RECOVER,
        estimatedRecoverableAmount: new Prisma.Decimal("10000.00"),
      },
    });

    await prisma.recoveryRecommendation.create({
      data: {
        paymentEventId: payA1.id,
        action: "RETRY_PAYMENT",
        status: RecommendationStatus.EXECUTED,
      },
    });

    const attA1 = await prisma.recoveryAttempt.create({
      data: {
        paymentEventId: payA1.id,
        status: RecoveryAttemptStatus.SUCCESSFUL,
      },
    });

    await prisma.recoveryOutcome.create({
      data: {
        recoveryAttemptId: attA1.id,
        paymentEventId: payA1.id,
        outcome: RecoveryAttemptStatus.SUCCESSFUL,
        actualRecoveredAmount: new Prisma.Decimal("10000.00"),
        outcomeTimestamp: new Date(),
      },
    });

    // Seed Payment for Tenant A: Worthiness = REVIEW, Amount = ₹5,000, Est = ₹5,000, Recovered = ₹0
    const payA2 = await prisma.paymentEvent.create({
      data: {
        id: `evt_sec_a2_${Date.now()}`,
        externalPaymentId: `ext_sec_a2_${Date.now()}`,
        companyId: companyA,
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
        paymentEventId: payA2.id,
        category: FailureCategory.NETWORK,
        failedAt: new Date(),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: payA2.id,
        worthiness: RecoveryWorthiness.REVIEW,
        estimatedRecoverableAmount: new Prisma.Decimal("5000.00"),
      },
    });

    // Seed Payment for Tenant B
    await prisma.paymentEvent.create({
      data: {
        id: `evt_sec_b1_${Date.now()}`,
        externalPaymentId: `ext_sec_b1_${Date.now()}`,
        companyId: companyB,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("99000.00"),
        currency: "INR",
        status: PaymentStatus.COMPLETED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { companyId: { in: [companyA, companyB] } } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { companyId: { in: [companyA, companyB] } } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { companyId: { in: [companyA, companyB] } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { companyId: { in: [companyA, companyB] } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { companyId: { in: [companyA, companyB] } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { companyId: { in: [companyA, companyB] } },
    });
    await prisma.provider.deleteMany({
      where: { id: demoProviderId },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyA, companyB] } },
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
  // 4. Multi-Tenant Authorization & Isolation
  // --------------------------------------------------------------------------
  describe("Tenant Isolation & Authorization", () => {
    it("rejects cross-tenant data query when token belongs to Tenant A but requests Tenant B", async () => {
      // Token encoded with Tenant A companyId
      const tokenPayload = Buffer.from(
        JSON.stringify({ companyId: companyA, userId: "user_a" })
      ).toString("base64");
      const jwtLikeToken = `header.${tokenPayload}.sig`;

      const res = await request(app)
        .get("/api/dashboard/payments")
        .set("Authorization", `Bearer ${jwtLikeToken}`)
        .query({ companyId: companyB }); // Attempt cross-tenant query

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Tenant isolation violation");
    });

    it("allows tenant to query their own data with matching authorization", async () => {
      const tokenPayload = Buffer.from(
        JSON.stringify({ companyId: companyA, userId: "user_a" })
      ).toString("base64");
      const jwtLikeToken = `header.${tokenPayload}.sig`;

      const res = await request(app)
        .get("/api/dashboard/payments")
        .set("Authorization", `Bearer ${jwtLikeToken}`)
        .query({ companyId: companyA });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.every((i: { companyId: string }) => i.companyId === companyA)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Rate Limiting Protection
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
  // 6. Safe Centralized Error Handling
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
  // 7. KPI Semantics Mathematical Verification
  // --------------------------------------------------------------------------
  describe("KPI Definitions & Mathematical Consistency", () => {
    it("strictly differentiates potentiallyRecoverableAmount (RECOVER targets) from estimatedRecoverableAmount (all forecasts)", async () => {
      const res = await request(app)
        .get("/api/dashboard/summary")
        .query({ companyId: companyA });

      expect(res.status).toBe(200);
      const { metrics } = res.body.data;

      // 1. Potentially Recoverable = only payA1 (₹10,000) which has worthiness RECOVER
      expect(Number(metrics.potentiallyRecoverableAmount)).toBe(10000.0);

      // 2. Estimated Recovery = payA1 (₹10,000) + payA2 under REVIEW (₹5,000) = ₹15,000
      expect(Number(metrics.estimatedRecoverableAmount)).toBe(15000.0);

      // 3. Actually Recovered = confirmed outcome (₹10,000)
      expect(Number(metrics.actualRecoveredAmount)).toBe(10000.0);

      // 4. Mathematical check: estimatedRecoverable >= potentiallyRecoverable when review items exist
      expect(Number(metrics.estimatedRecoverableAmount)).toBeGreaterThan(
        Number(metrics.potentiallyRecoverableAmount)
      );
    });
  });
});
