/**
 * RecoverAI — Phase 9: Dashboard & Read API Tests
 *
 * Tests the summary aggregation, paginated payment list, filtering,
 * server-side sorting, company scoping, and error handling.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient, PaymentStatus, FailureCategory, RecoveryWorthiness, RecommendationStatus, RecoveryAttemptStatus, Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

describe("Phase 9 — Dashboard & Read API", () => {
  const testCompanyId = `test_comp_dash_${Date.now()}`;
  const otherCompanyId = `test_comp_other_${Date.now()}`;
  const emptyCompanyId = `test_comp_empty_${Date.now()}`;

  let demoProviderId: string;

  beforeAll(async () => {
    // 1. Create test companies
    await prisma.company.create({
      data: {
        id: testCompanyId,
        name: "Dashboard Test Corp",
      },
    });

    await prisma.company.create({
      data: {
        id: otherCompanyId,
        name: "Other Isolation Corp",
      },
    });

    await prisma.company.create({
      data: {
        id: emptyCompanyId,
        name: "Empty Test Corp",
      },
    });

    // 2. Create provider
    const provider = await prisma.provider.create({
      data: {
        id: `prov_dash_${Date.now()}`,
        name: "Demo Sandbox Provider",
        type: "DEMO",
      },
    });
    demoProviderId = provider.id;

    // 3. Seed payments for testCompanyId

    // Payment 1: COMPLETED (₹5,000)
    await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_1`,
        externalPaymentId: `ext_pay_1_${Date.now()}`,
        companyId: testCompanyId,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("5000.00"),
        currency: "INR",
        status: PaymentStatus.COMPLETED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date("2026-08-25T10:00:00Z"),
      },
    });

    // Payment 2: FAILED (INSUFFICIENT_FUNDS, ₹10,000) -> Worthiness: RECOVER -> Recommended -> Attempted -> SUCCESSFUL (₹10,000)
    const pay2 = await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_comp_${Date.now()}_2`,
        externalPaymentId: `ext_pay_2_${Date.now()}`,
        companyId: testCompanyId,
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
        companyId: testCompanyId,
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
        companyId: testCompanyId,
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

    // 4. Seed 1 payment for otherCompanyId for isolation test
    await prisma.paymentEvent.create({
      data: {
        id: `evt_dash_other_${Date.now()}`,
        externalPaymentId: `ext_pay_other_${Date.now()}`,
        companyId: otherCompanyId,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("99999.00"),
        currency: "INR",
        status: PaymentStatus.COMPLETED,
        paymentMethod: "UPI",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Clean up created test data
    await prisma.recoveryOutcome.deleteMany({
      where: { recoveryAttempt: { paymentEvent: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } } } },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: { paymentEvent: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } } },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { companyId: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } },
    });
    await prisma.provider.deleteMany({
      where: { id: demoProviderId },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [testCompanyId, otherCompanyId, emptyCompanyId] } },
    });

    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Summary API Tests
  // --------------------------------------------------------------------------
  describe("GET /api/dashboard/summary", () => {
    it("returns correct aggregated summary metrics for a company", async () => {
      const res = await request(app)
        .get("/api/dashboard/summary")
        .query({ companyId: testCompanyId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data.company.id).toBe(testCompanyId);
      expect(data.company.name).toBe("Dashboard Test Corp");
      expect(data.isDemo).toBe(true);
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

    it("returns zeroed metrics for an empty company without errors", async () => {
      const res = await request(app)
        .get("/api/dashboard/summary")
        .query({ companyId: emptyCompanyId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metrics.totalPayments).toBe(0);
      expect(res.body.data.metrics.failedPayments).toBe(0);
      expect(Number(res.body.data.metrics.actualRecoveredAmount)).toBe(0);
      expect(res.body.data.failureBreakdown).toEqual([]);
    });

    it("returns 404 Not Found for non-existent companyId", async () => {
      const res = await request(app)
        .get("/api/dashboard/summary")
        .query({ companyId: "non_existent_company_999" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Payment List API Tests
  // --------------------------------------------------------------------------
  describe("GET /api/dashboard/payments", () => {
    it("returns paginated payment lifecycle items with default pagination", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ companyId: testCompanyId, page: 1, pageSize: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(2);
      expect(res.body.data.pagination.total).toBe(4);
      expect(res.body.data.pagination.totalPages).toBe(2);

      // Verify lifecycle fields on returned item
      const item = res.body.data.items[0];
      expect(item.id).toBeDefined();
      expect(item.amount).toBeDefined();
      expect(item.status).toBeDefined();
      expect(item.isDemoSandbox).toBe(true);
    });

    it("filters payments by status=FAILED", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({ companyId: testCompanyId, status: "FAILED" });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items.every((i: { status: string }) => i.status === "FAILED")).toBe(true);
    });

    it("filters payments by failureCategory=INSUFFICIENT_FUNDS", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          failureCategory: "INSUFFICIENT_FUNDS",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].failure.category).toBe("INSUFFICIENT_FUNDS");
    });

    it("filters payments by recoveryWorthiness=RECOVER", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          recoveryWorthiness: "RECOVER",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].assessment.worthiness).toBe("RECOVER");
    });

    it("filters payments by recoveryStatus=SUCCESSFUL", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          recoveryStatus: "SUCCESSFUL",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].latestAttempt.status).toBe("SUCCESSFUL");
      expect(res.body.data.items[0].latestOutcome.actualRecoveredAmount).toBe("10000");
    });

    it("sorts payments by amount in descending order", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          sortBy: "amount",
          sortOrder: "desc",
        });

      expect(res.status).toBe(200);
      const amounts = res.body.data.items.map((i: { amount: string }) => Number(i.amount));
      expect(amounts).toEqual([20000, 10000, 5000, 3000]);
    });

    it("sorts payments by amount in ascending order", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          sortBy: "amount",
          sortOrder: "asc",
        });

      expect(res.status).toBe(200);
      const amounts = res.body.data.items.map((i: { amount: string }) => Number(i.amount));
      expect(amounts).toEqual([3000, 5000, 10000, 20000]);
    });

    it("returns 400 Bad Request for invalid query parameters", async () => {
      const res = await request(app)
        .get("/api/dashboard/payments")
        .query({
          companyId: testCompanyId,
          status: "INVALID_STATUS_NAME",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid query parameters");
    });

    it("enforces strict company scoping and isolation", async () => {
      const resOther = await request(app)
        .get("/api/dashboard/payments")
        .query({ companyId: otherCompanyId });

      expect(resOther.status).toBe(200);
      expect(resOther.body.data.items).toHaveLength(1);
      expect(Number(resOther.body.data.items[0].amount)).toBe(99999.0);

      // Verify other company does not see testCompanyId's items
      expect(
        resOther.body.data.items.some((i: { companyId: string }) => i.companyId === testCompanyId)
      ).toBe(false);
    });
  });
});
