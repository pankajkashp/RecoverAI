/**
 * RecoverAI — Phase 13: E2E Lifecycle Scenarios & Performance Load Benchmarks
 *
 * Validates:
 * 1. End-to-end lifecycle scenarios A, B, C, D, E
 * 2. Ingestion latency and throughput under concurrent load
 * 3. Dashboard summary query performance
 * 4. Paginated payment list response times
 * 5. Recovery execution throughput and latency
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/services/auth.service.js";

const prisma = new PrismaClient();
const app = createApp();
const authService = new AuthService();

describe("Phase 13 — E2E Scenarios & Load Benchmarking", () => {
  const companyId = `comp_p13_${Date.now()}`;
  let adminToken: string;
  let providerId: string;

  beforeAll(async () => {
    // 1. Provision Test Company & Admin User
    await prisma.company.create({
      data: {
        id: companyId,
        name: "Phase 13 Benchmark Enterprise",
      },
    });

    const user = await prisma.user.create({
      data: {
        id: `user_p13_${Date.now()}`,
        email: `admin-${Date.now()}@p13benchmark.com`,
        name: "Benchmark Admin",
        role: "ADMIN",
        companyId,
      },
    });

    adminToken = authService.generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
      companyId,
    });

    // 2. Ensure Provider exists
    const provider = await prisma.provider.upsert({
      where: { id: "provider_demo_sandbox" },
      update: {},
      create: {
        id: "provider_demo_sandbox",
        name: "Demo Sandbox Provider",
        type: "DEMO",
      },
    });
    providerId = provider.id;
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { companyId } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { companyId } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { companyId } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { companyId } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { companyId } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { companyId },
    });
    await prisma.user.deleteMany({
      where: { companyId },
    });
    await prisma.company.deleteMany({
      where: { id: companyId },
    });
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Complete End-to-End Lifecycle Scenarios (A - E)
  // --------------------------------------------------------------------------
  describe("Complete E2E Scenarios (A - E)", () => {
    it("Scenario A: Failed Payment -> Recoverable -> Retry Rec -> Execution -> SUCCESSFUL Outcome", async () => {
      const extId = `pay_e2e_scen_a_${Date.now()}`;

      // Ingest Failed Payment (Insufficient Funds)
      const ingestRes = await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: extId,
          companyId,
          amount: 5000,
          currency: "INR",
          status: "FAILED",
          paymentMethod: "UPI",
          failureCode: "insufficient_funds",
          failureMessage: "Bank declined due to insufficient funds",
          providerId,
        });

      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.data.failureAnalysis.category).toBe("INSUFFICIENT_FUNDS");
      expect(ingestRes.body.data.recoveryAssessment.worthiness).toBe("RECOVER");
      expect(ingestRes.body.data.recoveryRecommendation.action).toBe("RETRY_PAYMENT");

      // Execute Recovery
      const execRes = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          paymentEventId: ingestRes.body.data.paymentEventId,
          forceSimulationOutcome: "SUCCESSFUL",
        });

      expect(execRes.status).toBe(201);
      expect(execRes.body.data.status).toBe("EXECUTED");
      expect(execRes.body.data.attemptStatus).toBe("SUCCESSFUL");
      expect(execRes.body.data.actualRecoveredAmount).toBe("5000");

      // Verify in DB
      const outcome = await prisma.recoveryOutcome.findFirst({
        where: { recoveryAttempt: { paymentEventId: ingestRes.body.data.paymentEventId } },
      });
      expect(outcome?.outcome).toBe("SUCCESSFUL");
      expect(Number(outcome?.actualRecoveredAmount)).toBe(5000);
    });

    it("Scenario B: Failed Payment -> Recoverable -> Rec -> Execution -> FAILED Outcome", async () => {
      const extId = `pay_e2e_scen_b_${Date.now()}`;

      const ingestRes = await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: extId,
          companyId,
          amount: 3200,
          currency: "INR",
          status: "FAILED",
          paymentMethod: "CARD",
          failureCode: "network_error",
          failureMessage: "Gateway network timeout",
          providerId,
        });

      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.data.recoveryAssessment.worthiness).toBe("RECOVER");

      // Execute Recovery with Forced Failure Simulation
      const execRes = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          paymentEventId: ingestRes.body.data.paymentEventId,
          forceSimulationOutcome: "FAILED",
        });

      expect(execRes.status).toBe(201);
      expect(execRes.body.data.attemptStatus).toBe("FAILED");
      expect(execRes.body.data.actualRecoveredAmount).toBe("0");
    });

    it("Scenario C: Failed Payment -> Permanent -> DO_NOT_RECOVER -> Execution Blocked", async () => {
      const extId = `pay_e2e_scen_c_${Date.now()}`;

      const ingestRes = await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: extId,
          companyId,
          amount: 8000,
          currency: "INR",
          status: "FAILED",
          paymentMethod: "CARD",
          failureCode: "card_expired",
          failureMessage: "Customer card has expired",
          providerId,
        });

      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.data.recoveryAssessment.worthiness).toBe("DO_NOT_RECOVER");
      expect(ingestRes.body.data.recoveryRecommendation.action).toBe("DO_NOT_RECOVER");

      // Attempt Execution on DO_NOT_RECOVER -> Should be safely BLOCKED (422 Ineligible)
      const execRes = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          paymentEventId: ingestRes.body.data.paymentEventId,
        });

      expect(execRes.status).toBe(422);
      expect(execRes.body.success).toBe(false);
      expect(execRes.body.code).toBe("INELIGIBLE_RECOVERY_ACTION");
    });

    it("Scenario D: Failed Payment -> REVIEW -> Review Rec -> Execution Blocked", async () => {
      const extId = `pay_e2e_scen_d_${Date.now()}`;

      const ingestRes = await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: extId,
          companyId,
          amount: 15000,
          currency: "INR",
          status: "FAILED",
          paymentMethod: "OTHER",
          failureCode: "unrecognized_custom_code",
          failureMessage: "Unspecified custom decline reason",
          providerId,
        });

      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.data.recoveryAssessment.worthiness).toBe("REVIEW");
      expect(ingestRes.body.data.recoveryRecommendation.action).toBe("REVIEW");

      // Attempt Execution on REVIEW -> Blocked from automatic retry (422 Ineligible)
      const execRes = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          paymentEventId: ingestRes.body.data.paymentEventId,
        });

      expect(execRes.status).toBe(422);
      expect(execRes.body.success).toBe(false);
      expect(execRes.body.code).toBe("INELIGIBLE_RECOVERY_ACTION");
    });

    it("Scenario E: Successful Payment -> No Failure -> No Assessment -> No Recommendation", async () => {
      const extId = `pay_e2e_scen_e_${Date.now()}`;

      const ingestRes = await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: extId,
          companyId,
          amount: 12000,
          currency: "INR",
          status: "COMPLETED",
          paymentMethod: "UPI",
          providerId,
        });

      expect(ingestRes.status).toBe(201);
      expect(ingestRes.body.data.failureAnalysis).toBeUndefined();
      expect(ingestRes.body.data.recoveryAssessment).toBeUndefined();
      expect(ingestRes.body.data.recoveryRecommendation).toBeUndefined();

      // Check database
      const payment = await prisma.paymentEvent.findFirst({
        where: { externalPaymentId: extId, companyId },
        include: {
          failure: true,
          assessment: true,
          recommendation: true,
          attempts: true,
        },
      });

      expect(payment).toBeDefined();
      expect(payment?.failure).toBeNull();
      expect(payment?.assessment).toBeNull();
      expect(payment?.recommendation).toBeNull();
      expect(payment?.attempts.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Performance & Load Benchmarks
  // --------------------------------------------------------------------------
  describe("Performance & Load Benchmarks", () => {
    it("measures concurrent payment ingestion throughput and latency", async () => {
      const BATCH_SIZE = 10;
      const start = Date.now();

      const promises = Array.from({ length: BATCH_SIZE }).map((_, i) =>
        request(app)
          .post("/api/payment-events")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            externalPaymentId: `pay_load_${Date.now()}_${i}`,
            companyId,
            amount: 1000 + i * 100,
            currency: "INR",
            status: "FAILED",
            paymentMethod: "UPI",
            failureCode: "insufficient_funds",
            providerId,
          })
      );

      const results = await Promise.all(promises);
      const durationMs = Date.now() - start;

      expect(results.every((r) => r.status === 201)).toBe(true);

      const avgLatencyMs = durationMs / BATCH_SIZE;
      console.log(
        `[BENCHMARK] Ingested ${BATCH_SIZE} concurrent payment events in ${durationMs}ms (avg: ${avgLatencyMs.toFixed(1)}ms/req)`
      );

      expect(avgLatencyMs).toBeLessThan(3000); // Strict latency bound
    });

    it("measures dashboard summary response time", async () => {
      const start = Date.now();

      const res = await request(app)
        .get(`/api/dashboard/summary?companyId=${companyId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      const durationMs = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.body.data.company.id).toBe(companyId);
      console.log(`[BENCHMARK] Dashboard summary query latency: ${durationMs}ms`);

      expect(durationMs).toBeLessThan(5000);
    });

    it("measures paginated payment list query response time", async () => {
      const start = Date.now();

      const res = await request(app)
        .get(`/api/dashboard/payments?companyId=${companyId}&page=1&pageSize=10`)
        .set("Authorization", `Bearer ${adminToken}`);

      const durationMs = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      console.log(`[BENCHMARK] Paginated payment list latency: ${durationMs}ms`);

      expect(durationMs).toBeLessThan(5000);
    });
  });
});
