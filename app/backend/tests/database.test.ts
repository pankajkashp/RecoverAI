import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  PaymentStatus,
  PaymentMethod,
  EventType,
  FailureCategory,
  RecoveryWorthiness,
  RecommendationStatus,
  RecoveryAttemptStatus,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

describe("Phase 2 — Data Layer Verification", () => {
  const testPrefix = `db_test_${Date.now()}`;
  let demoProviderId: string;
  let testPaymentId: string;
  let idempotencyPaymentId: string;

  beforeAll(async () => {
    // Ensure test demo provider exists
    const provider = await prisma.provider.upsert({
      where: { id: "provider_demo_sandbox" },
      update: { isActive: true },
      create: {
        id: "provider_demo_sandbox",
        type: "DEMO",
        name: "Demo Sandbox Provider",
        isActive: true,
      },
    });
    demoProviderId = provider.id;

    await prisma.provider.upsert({
      where: { id: "provider_razorpay_placeholder" },
      update: {},
      create: {
        id: "provider_razorpay_placeholder",
        type: "RAZORPAY",
        name: "Razorpay (Planned)",
        isActive: false,
      },
    });

    // Ensure at least one admin user exists
    await prisma.user.upsert({
      where: { email: "admin@demo.recoverai.internal" },
      update: {},
      create: {
        id: `user_admin_${Date.now()}`,
        name: "Demo Admin",
        email: "admin@demo.recoverai.internal",
        role: "ADMIN",
      },
    });

    // Seed test payment with failure, assessment, recommendation, and attempt outcome
    testPaymentId = `evt_${testPrefix}_failed`;
    const pay = await prisma.paymentEvent.create({
      data: {
        id: testPaymentId,
        externalPaymentId: `ext_${testPrefix}_failed`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("12500.00"),
        currency: "INR",
        status: PaymentStatus.FAILED,
        paymentMethod: PaymentMethod.CARD,
        eventType: EventType.PAYMENT_FAILED,
        failureCode: "INSUFFICIENT_FUNDS",
        failureMessage: "Declined due to insufficient account balance",
        eventTimestamp: new Date(),
      },
    });

    await prisma.paymentFailure.create({
      data: {
        paymentEventId: pay.id,
        category: FailureCategory.INSUFFICIENT_FUNDS,
        failedAt: new Date(),
      },
    });

    await prisma.recoveryAssessment.create({
      data: {
        paymentEventId: pay.id,
        worthiness: RecoveryWorthiness.RECOVER,
        estimatedRecoverableAmount: new Prisma.Decimal("12500.00"),
      },
    });

    await prisma.recoveryRecommendation.create({
      data: {
        paymentEventId: pay.id,
        action: "SEND_SMART_PAYMENT_LINK",
        status: RecommendationStatus.EXECUTED,
      },
    });

    const attempt = await prisma.recoveryAttempt.create({
      data: {
        paymentEventId: pay.id,
        status: RecoveryAttemptStatus.SUCCESSFUL,
      },
    });

    await prisma.recoveryOutcome.create({
      data: {
        recoveryAttemptId: attempt.id,
        paymentEventId: pay.id,
        outcome: RecoveryAttemptStatus.SUCCESSFUL,
        actualRecoveredAmount: new Prisma.Decimal("12500.00"),
        outcomeTimestamp: new Date(),
      },
    });

    await prisma.mlPrediction.create({
      data: {
        paymentEventId: pay.id,
        modelVersion: "v0.1.0-synthetic-baseline",
        confidence: 0.85,
        prediction: {
          predictedCategory: FailureCategory.INSUFFICIENT_FUNDS,
          predictedProbability: "0.8800",
          predictedWorthiness: RecoveryWorthiness.RECOVER,
          confidenceScore: "0.8500",
        },
      },
    });

    // Seed payment for idempotency test
    idempotencyPaymentId = `evt_${testPrefix}_success`;
    await prisma.paymentEvent.create({
      data: {
        id: idempotencyPaymentId,
        externalPaymentId: `ext_${testPrefix}_success`,
        providerId: demoProviderId,
        amount: new Prisma.Decimal("5000.00"),
        currency: "INR",
        status: PaymentStatus.COMPLETED,
        paymentMethod: PaymentMethod.UPI,
        eventType: EventType.PAYMENT_COMPLETED,
        eventTimestamp: new Date(),
      },
    });
  });

  afterAll(async () => {
    const idsToDelete = [testPaymentId, idempotencyPaymentId].filter(Boolean) as string[];
    if (idsToDelete.length > 0) {
      await prisma.recoveryOutcome.deleteMany({
        where: { recoveryAttempt: { paymentEvent: { id: { in: idsToDelete } } } },
      });
      await prisma.recoveryAttempt.deleteMany({
        where: { paymentEventId: { in: idsToDelete } },
      });
      await prisma.recoveryRecommendation.deleteMany({
        where: { paymentEventId: { in: idsToDelete } },
      });
      await prisma.recoveryAssessment.deleteMany({
        where: { paymentEventId: { in: idsToDelete } },
      });
      await prisma.paymentFailure.deleteMany({
        where: { paymentEventId: { in: idsToDelete } },
      });
      await prisma.mlPrediction.deleteMany({
        where: { paymentEventId: { in: idsToDelete } },
      });
      await prisma.paymentEvent.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
    await prisma.$disconnect();
  });

  it("successfully connects to the PostgreSQL database", async () => {
    const result = await prisma.$queryRaw<{ connected: number }[]>`SELECT 1 as connected`;
    expect(result).toBeDefined();
    expect(Number(result[0].connected)).toBe(1);
  });

  it("verifies seed user records", async () => {
    const users = await prisma.user.findMany();
    expect(users.length).toBeGreaterThanOrEqual(1);

    const admin = users.find((u) => u.role === "ADMIN");
    expect(admin).toBeDefined();
  });

  it("verifies provider configurations", async () => {
    const providers = await prisma.provider.findMany();
    expect(providers.length).toBeGreaterThanOrEqual(2);

    const demoProvider = providers.find((p) => p.type === "DEMO");
    expect(demoProvider).toBeDefined();
    expect(demoProvider?.isActive).toBe(true);

    const razorpayPlaceholder = providers.find((p) => p.type === "RAZORPAY");
    expect(razorpayPlaceholder).toBeDefined();
    expect(razorpayPlaceholder?.isActive).toBe(false);
  });

  it("verifies payment events, failure categories, and recovery chain", async () => {
    const payment = await prisma.paymentEvent.findUnique({
      where: { id: testPaymentId },
      include: {
        failure: true,
        assessment: true,
        recommendation: true,
        attempts: {
          include: {
            outcome: true,
          },
        },
        predictions: true,
      },
    });

    expect(payment).not.toBeNull();
    expect(payment?.status).toBe(PaymentStatus.FAILED);
    expect(payment?.failure?.category).toBe(FailureCategory.INSUFFICIENT_FUNDS);

    // Assessment is separated from actual outcome
    expect(payment?.assessment?.worthiness).toBe(RecoveryWorthiness.RECOVER);
    expect(Number(payment?.assessment?.estimatedRecoverableAmount)).toBe(12500);

    // Recommendation
    expect(payment?.recommendation?.action).toBe("SEND_SMART_PAYMENT_LINK");

    // Attempt & Actual Outcome
    expect(payment?.attempts.length).toBe(1);
    const attempt = payment?.attempts[0];
    expect(attempt?.status).toBe("SUCCESSFUL");
    expect(attempt?.outcome?.outcome).toBe("SUCCESSFUL");
    expect(Number(attempt?.outcome?.actualRecoveredAmount)).toBe(12500);

    // ML prediction structure exists
    expect(payment?.predictions.length).toBe(1);
    expect(payment?.predictions[0].modelVersion).toBe("v0.1.0-synthetic-baseline");
  });

  it("enforces idempotency / unique constraint on [providerId, externalPaymentId]", async () => {
    const existing = await prisma.paymentEvent.findUnique({
      where: { id: idempotencyPaymentId },
    });
    expect(existing).not.toBeNull();

    // Attempting to insert a duplicate event with identical (providerId, externalPaymentId)
    // should throw a Prisma unique constraint violation (P2002)
    await expect(
      prisma.paymentEvent.create({
        data: {
          externalPaymentId: existing!.externalPaymentId,
          providerId: existing!.providerId,
          amount: new Prisma.Decimal("100.00"),
          currency: "INR",
          status: PaymentStatus.COMPLETED,
          paymentMethod: PaymentMethod.CARD,
          eventType: EventType.PAYMENT_COMPLETED,
          eventTimestamp: new Date(),
        },
      })
    ).rejects.toThrow();
  });
});
