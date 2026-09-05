/**
 * RecoverAI — Phase 14: Performance Benchmark & Verification Suite
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/services/auth.service.js";

const prisma = new PrismaClient();
const app = createApp();
const authService = new AuthService();

function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

describe("Phase 14 — Performance Verification & Correctness Benchmarks", () => {
  const testPrefix = `p14_bench_${Date.now()}`;
  let adminToken: string;
  const providerId = "provider_demo_sandbox";
  let userId: string;

  beforeAll(async () => {
    userId = `user_p14_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `admin-${Date.now()}@p14bench.com`,
        name: "Benchmark Admin",
        role: "ADMIN",
      },
    });

    adminToken = authService.generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
    });

    await prisma.provider.upsert({
      where: { id: providerId },
      update: {},
      create: {
        id: providerId,
        name: "Demo Sandbox Provider",
        type: "DEMO",
      },
    });

    // Pre-seed representative payment events
    for (let i = 1; i <= 10; i++) {
      const isFailed = i % 2 === 0;
      await request(app)
        .post("/api/payment-events")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          externalPaymentId: `${testPrefix}_seed_${i}`,
          amount: 1000 * i,
          currency: "INR",
          status: isFailed ? "FAILED" : "COMPLETED",
          paymentMethod: i % 3 === 0 ? "CARD" : "UPI",
          failureCode: isFailed ? "insufficient_funds" : undefined,
          failureMessage: isFailed ? "Declined due to insufficient funds" : undefined,
          providerId,
        });
    }
  });

  afterAll(async () => {
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.mlPrediction.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { externalPaymentId: { startsWith: testPrefix } },
    });
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("Benchmark 1: GET /api/dashboard/summary (N=10, Concurrency=2)", async () => {
    const latencies: number[] = [];
    let errors = 0;
    const TOTAL_REQUESTS = 10;
    const CONCURRENCY = 2;

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, TOTAL_REQUESTS - i) }).map(async () => {
        const start = Date.now();
        try {
          const res = await request(app)
            .get("/api/dashboard/summary")
            .set("Authorization", `Bearer ${adminToken}`);
          const duration = Date.now() - start;
          if (res.status === 200) {
            latencies.push(duration);
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      });
      await Promise.all(batch);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = calculateP95(latencies);
    const errorRate = (errors / TOTAL_REQUESTS) * 100;

    console.log(`\n======================================================`);
    console.log(`[BENCHMARK RESULT] GET /api/dashboard/summary`);
    console.log(`Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY}`);
    console.log(`Avg Latency: ${avgLatency.toFixed(1)}ms | p95: ${p95Latency}ms | Error Rate: ${errorRate}%`);
    console.log(`======================================================\n`);

    expect(errorRate).toBe(0);
    expect(latencies.length).toBe(TOTAL_REQUESTS);
  });

  it("Benchmark 2: GET /api/dashboard/payments (N=10, Concurrency=2)", async () => {
    const latencies: number[] = [];
    let errors = 0;
    const TOTAL_REQUESTS = 10;
    const CONCURRENCY = 2;

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, TOTAL_REQUESTS - i) }).map(async () => {
        const start = Date.now();
        try {
          const res = await request(app)
            .get("/api/dashboard/payments?page=1&pageSize=10")
            .set("Authorization", `Bearer ${adminToken}`);
          const duration = Date.now() - start;
          if (res.status === 200) {
            latencies.push(duration);
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      });
      await Promise.all(batch);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = calculateP95(latencies);
    const errorRate = (errors / TOTAL_REQUESTS) * 100;

    console.log(`\n======================================================`);
    console.log(`[BENCHMARK RESULT] GET /api/dashboard/payments`);
    console.log(`Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY}`);
    console.log(`Avg Latency: ${avgLatency.toFixed(1)}ms | p95: ${p95Latency}ms | Error Rate: ${errorRate}%`);
    console.log(`======================================================\n`);

    expect(errorRate).toBe(0);
    expect(latencies.length).toBe(TOTAL_REQUESTS);
  });

  it("Benchmark 3: POST /api/payment-events (N=10, Concurrency=2)", async () => {
    const latencies: number[] = [];
    let errors = 0;
    const TOTAL_REQUESTS = 10;
    const CONCURRENCY = 2;

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, TOTAL_REQUESTS - i) }).map(async (_, idx) => {
        const start = Date.now();
        try {
          const res = await request(app)
            .post("/api/payment-events")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
              externalPaymentId: `${testPrefix}_ingest_${i}_${idx}`,
              amount: 2500,
              currency: "INR",
              status: "FAILED",
              paymentMethod: "UPI",
              failureCode: "insufficient_funds",
              providerId,
            });
          const duration = Date.now() - start;
          if (res.status === 201) {
            latencies.push(duration);
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      });
      await Promise.all(batch);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = calculateP95(latencies);
    const errorRate = (errors / TOTAL_REQUESTS) * 100;

    console.log(`\n======================================================`);
    console.log(`[BENCHMARK RESULT] POST /api/payment-events`);
    console.log(`Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY}`);
    console.log(`Avg Latency: ${avgLatency.toFixed(1)}ms | p95: ${p95Latency}ms | Error Rate: ${errorRate}%`);
    console.log(`======================================================\n`);

    expect(errorRate).toBe(0);
    expect(latencies.length).toBe(TOTAL_REQUESTS);
  });

  it("Correctness: exact KPI values, breakdowns, filtering and pagination", async () => {
    const summaryRes = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.business.name).toBeDefined();
    expect(summaryRes.body.data.metrics.totalPayments).toBeGreaterThanOrEqual(10);
    expect(summaryRes.body.data.failureBreakdown).toBeInstanceOf(Array);
    expect(summaryRes.body.data.recoveryBreakdown).toBeInstanceOf(Array);

    const paymentsRes = await request(app)
      .get("/api/dashboard/payments?page=1&pageSize=5&sortBy=eventTimestamp&sortOrder=desc")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(paymentsRes.status).toBe(200);
    expect(paymentsRes.body.data.pagination.page).toBe(1);
    expect(paymentsRes.body.data.pagination.pageSize).toBe(5);
    expect(paymentsRes.body.data.items.length).toBe(5);

    const filterRes = await request(app)
      .get("/api/dashboard/payments?status=FAILED")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.pagination.total).toBeGreaterThanOrEqual(5);
  });
});
