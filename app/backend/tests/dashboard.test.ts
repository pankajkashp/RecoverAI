/**
 * RecoverAI — Dashboard & Read API Tests (Single Business)
 *
 * Tests the summary aggregation, paginated payment list, filtering,
 * server-side sorting, single business summary, and SSE streaming.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  PrismaClient,
  PaymentStatus,
  FailureCategory,
  RecoveryWorthiness,
  RecommendationStatus,
  RecoveryAttemptStatus,
  Prisma,
} from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

describe("Phase 9 — Dashboard & Read API (Single Business)", () => {
  let demoProviderId: string;
  const createdPaymentIds: string[] = [];

  beforeAll(async () => {
    // 1. Create provider
    let provider = await prisma.provider.findFirst({
      where: { type: "DEMO" },
    });
    if (!provider) {
      provider = await prisma.provider.create({
        data: {
          id: `prov_dash_${Date.now()}`,
          name: "Demo Sandbox Provider",
          type: "DEMO",
        },
      });
    }
    demoProviderId = provider.id;

    // 2. Clean previous test items if any
    await prisma.recoveryOutcome.deleteMany({});
    await prisma.recoveryAttempt.deleteMany({});
    await prisma.recoveryRecommendation.deleteMany({});
    await prisma.recoveryAssessment.deleteMany({});
    await prisma.paymentFailure.deleteMany({});
    await prisma.mlPrediction.deleteMany({});
    await prisma.paymentEvent.deleteMany({});
    await prisma.businessTransaction.deleteMany({});

    // 3. Seed payments

    // Payment 1: COMPLETED (₹5,000)
    const pay1 = await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_1`,
        externalPaymentId: `ext_pay_1_${Date.now()}`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("5000.00"),
        currency: "INR",
        status: PaymentStatus.COMPLETED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date("2026-08-25T10:00:00Z"),
      },
    });
    createdPaymentIds.push(pay1.id);

    // Payment 2: FAILED (INSUFFICIENT_FUNDS, ₹10,000) -> Worthiness: RECOVER -> Recommended -> Attempted -> SUCCESSFUL (₹10,000)
    const pay2 = await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_2`,
        externalPaymentId: `ext_pay_2_${Date.now()}`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("10000.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: "CARD",
        eventType: "PAYMENT_FAILED",
        failureCode: "INSUFFICIENT_BALANCE",
        failureMessage: "Not enough balance",
        eventTimestamp: new Date("2026-08-25T11:00:00Z"),
      },
    });
    createdPaymentIds.push(pay2.id);

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay2.id,
        category: FailureCategory.INSUFFICIENT_FUNDS,
        failureCode: "INSUFFICIENT_BALANCE",
        failureMessage: "Not enough balance",
        failedAt: new Date("2026-08-25T11:00:00Z"),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay2.id,
        worthiness: RecoveryWorthiness.RECOVER,
        estimatedRecoverableAmount: new Prisma.Decimal("10000.00"),
        confidence: 0.9,
        reasoning: "High likelihood of balance top-up",
      },
    });

    await prisma.recoveryRecommendation.create({
      data: {
        paymentEventId: pay2.id,
        action: "RETRY_PAYMENT",
        status: RecommendationStatus.EXECUTED,
        confidence: 0.92,
      },
    });

    const att2 = await prisma.recoveryAttempt.create({
      data: {
        paymentEventId: pay2.id,
        status: RecoveryAttemptStatus.SUCCESSFUL,
        attemptedAt: new Date("2026-08-25T11:10:00Z"),
      },
    });

    await prisma.recoveryOutcome.create({
      data: {
        recoveryAttemptId: att2.id,
        paymentEventId: pay2.id,
        outcome: RecoveryAttemptStatus.SUCCESSFUL,
        actualRecoveredAmount: new Prisma.Decimal("10000.00"),
        outcomeTimestamp: new Date("2026-08-25T11:15:00Z"),
      },
    });

    // Payment 3: FAILED (NETWORK, ₹3,000) -> Worthiness: REVIEW -> Recommended -> Attempted -> FAILED (₹0)
    const pay3 = await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_3`,
        externalPaymentId: `ext_pay_3_${Date.now()}`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("3000.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_FAILED",
        failureCode: "GATEWAY_TIMEOUT",
        failureMessage: "Gateway did not respond",
        eventTimestamp: new Date("2026-08-25T12:00:00Z"),
      },
    });
    createdPaymentIds.push(pay3.id);

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay3.id,
        category: FailureCategory.NETWORK,
        failureCode: "GATEWAY_TIMEOUT",
        failureMessage: "Gateway did not respond",
        failedAt: new Date("2026-08-25T12:00:00Z"),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay3.id,
        worthiness: RecoveryWorthiness.REVIEW,
        estimatedRecoverableAmount: new Prisma.Decimal("3000.00"),
        confidence: 0.5,
        reasoning: "Ambiguous timeout",
      },
    });

    await prisma.recoveryRecommendation.create({
      data: {
        paymentEventId: pay3.id,
        action: "REVIEW",
        status: RecommendationStatus.RECOMMENDED,
      },
    });

    const att3 = await prisma.recoveryAttempt.create({
      data: {
        paymentEventId: pay3.id,
        status: RecoveryAttemptStatus.FAILED,
      },
    });

    await prisma.recoveryOutcome.create({
      data: {
        recoveryAttemptId: att3.id,
        paymentEventId: pay3.id,
        outcome: RecoveryAttemptStatus.FAILED,
        actualRecoveredAmount: new Prisma.Decimal("0.00"),
        outcomeTimestamp: new Date("2026-08-25T12:15:00Z"),
      },
    });

    // Payment 4: FAILED (CARD, ₹20,000) -> Worthiness: DO_NOT_RECOVER
    const pay4 = await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_4`,
        externalPaymentId: `ext_pay_4_${Date.now()}`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("20000.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: "CARD",
        eventType: "PAYMENT_FAILED",
        failureCode: "STOLEN_CARD",
        failureMessage: "Reported stolen",
        eventTimestamp: new Date("2026-08-25T13:00:00Z"),
      },
    });
    createdPaymentIds.push(pay4.id);

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay4.id,
        category: FailureCategory.CARD,
        failureCode: "STOLEN_CARD",
        failureMessage: "Reported stolen",
        failedAt: new Date("2026-08-25T13:00:00Z"),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay4.id,
        worthiness: RecoveryWorthiness.DO_NOT_RECOVER,
        estimatedRecoverableAmount: new Prisma.Decimal("0.00"),
        confidence: 0.99,
        reasoning: "Fraud / stolen card",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Summary API Tests
  // --------------------------------------------------------------------------
  describe("GET /api/dashboard/summary", () => {
    it("returns correct aggregated summary metrics for the business", async () => {
      const res = await request(app).get("/api/dashboard/summary");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data.currency).toBe("INR");

      // Verify metrics
      expect(data.metrics.totalPayments).toBe(4);
      expect(data.metrics.failedPayments).toBe(3);
      expect(data.metrics.successfulPayments).toBe(1);
      expect(data.metrics.failureRate).toBe(75.0); // 3 / 4 * 100
      expect(Number(data.metrics.totalPaymentValue)).toBe(38000.0); // 5000 + 10000 + 3000 + 20000
      expect(Number(data.metrics.potentiallyRecoverableAmount)).toBe(10000.0); // Only worthiness RECOVER
      expect(Number(data.metrics.estimatedRecoverableAmount)).toBe(13000.0); // 10000 + 3000
      expect(Number(data.metrics.actualRecoveredAmount)).toBe(10000.0); // 10000
      expect(data.metrics.recoveryRate).toBe(100.0); // 10000 / 10000 * 100
      expect(data.metrics.recommendedCount).toBe(2);
      expect(data.metrics.attemptedCount).toBe(2);
      expect(data.metrics.successfulRecoveryCount).toBe(1);

      // Verify failure breakdown
      expect(data.failureBreakdown).toHaveLength(3);
      const insufficientFundsGroup = data.failureBreakdown.find(
        (b: { category: string }) => b.category === "INSUFFICIENT_FUNDS"
      );
      expect(insufficientFundsGroup).toBeDefined();
      expect(insufficientFundsGroup.count).toBe(1);

      // Verify recovery breakdown
      expect(data.recoveryBreakdown.length).toBeGreaterThan(0);
      const recoveredState = data.recoveryBreakdown.find(
        (r: { status: string }) => r.status === "Recovered"
      );
      expect(recoveredState).toBeDefined();
      expect(recoveredState.count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Payment List API Tests
  // --------------------------------------------------------------------------
  describe("GET /api/dashboard/payments", () => {
    it("returns paginated payment lifecycle events", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ page: 1, pageSize: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(2);
      expect(res.body.data.pagination.total).toBe(4);
      expect(res.body.data.pagination.totalPages).toBe(2);
    });

    it("filters payments by status=COMPLETED", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ status: "COMPLETED" });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe("COMPLETED");
      expect(Number(res.body.data.items[0].amount)).toBe(5000.0);
    });

    it("filters payments by failureCategory=INSUFFICIENT_FUNDS", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ failureCategory: "INSUFFICIENT_FUNDS" });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].failure.category).toBe("INSUFFICIENT_FUNDS");
    });

    it("filters payments by recoveryWorthiness=RECOVER", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ recoveryWorthiness: "RECOVER" });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].assessment.worthiness).toBe("RECOVER");
    });

    it("filters payments by recoveryStatus=SUCCESSFUL", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ recoveryStatus: "SUCCESSFUL" });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].latestAttempt.status).toBe("SUCCESSFUL");
      expect(Number(res.body.data.items[0].latestOutcome.actualRecoveredAmount)).toBe(10000);
    });

    it("sorts payments by amount in descending order", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ sortBy: "amount", sortOrder: "desc" });

      expect(res.status).toBe(200);
      const amounts = res.body.data.items.map((i: { amount: string }) => Number(i.amount));
      expect(amounts).toEqual([20000, 10000, 5000, 3000]);
    });

    it("sorts payments by amount in ascending order", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ sortBy: "amount", sortOrder: "asc" });

      expect(res.status).toBe(200);
      const amounts = res.body.data.items.map((i: { amount: string }) => Number(i.amount));
      expect(amounts).toEqual([3000, 5000, 10000, 20000]);
    });

    it("returns 400 Bad Request for invalid query parameters", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ status: "INVALID_STATUS_NAME" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid query parameters");
    });
  });

  // --------------------------------------------------------------------------
  // Server-Sent Events (SSE) Stream & Real-Time Updates
  // --------------------------------------------------------------------------
  describe("GET /api/dashboard/events (SSE Stream)", () => {
    it("subscribes and receives real-time dashboard events globally", async () => {
      const { dashboardEventService } = await import("../src/services/dashboard-event.service.js");

      const receivedEvents: Array<import("../src/services/dashboard-event.service.js").DashboardEventPayload> = [];
      const unsubscribe = dashboardEventService.subscribe((evt) => {
        receivedEvents.push(evt);
      });

      dashboardEventService.emitDashboardEvent({
        type: "RECOVERY_CONFIRMED",
        paymentEventId: "pay_sse_test_456",
        recoveryAttemptId: "att_sse_test_456",
        actualRecoveredAmount: 1250,
        timestamp: new Date().toISOString(),
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe("RECOVERY_CONFIRMED");
      expect(receivedEvents[0].actualRecoveredAmount).toBe(1250);

      unsubscribe();
    });
  });
});
