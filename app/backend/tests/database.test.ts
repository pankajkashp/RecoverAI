import { describe, expect, it, afterAll } from "vitest";
import {
  PrismaClient,
  PaymentStatus,
  PaymentMethod,
  EventType,
  FailureCategory,
  RecoveryWorthiness,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

describe("Phase 2 — Data Layer Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("successfully connects to the PostgreSQL database", async () => {
    const result = await prisma.$queryRaw<{ connected: number }[]>`SELECT 1 as connected`;
    expect(result).toBeDefined();
    expect(Number(result[0].connected)).toBe(1);
  });

  it("verifies seed company and user relationships", async () => {
    const company = await prisma.company.findUnique({
      where: { id: "demo_company_001" },
      include: { users: true },
    });

    expect(company).not.toBeNull();
    expect(company?.name).toContain("Demo");
    expect(company?.users.length).toBeGreaterThanOrEqual(2);

    const admin = company?.users.find((u) => u.role === "ADMIN");
    expect(admin).toBeDefined();
    expect(admin?.email).toBe("admin@demo.recoverai.internal");
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
      where: { id: "evt_demo_failed_002" },
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

  it("enforces idempotency / unique constraint on [providerId, externalPaymentId, companyId]", async () => {
    const existing = await prisma.paymentEvent.findUnique({
      where: { id: "evt_demo_success_001" },
    });
    expect(existing).not.toBeNull();

    // Attempting to insert a duplicate event with identical (providerId, externalPaymentId, companyId)
    // should throw a Prisma unique constraint violation (P2002)
    await expect(
      prisma.paymentEvent.create({
        data: {
          externalPaymentId: existing!.externalPaymentId,
          companyId: existing!.companyId,
          providerId: existing!.providerId,
          amount: new Prisma.Decimal("100.00"),
          currency: "INR",
          status: PaymentStatus.COMPLETED,
          paymentMethod: PaymentMethod.UPI,
          eventType: EventType.PAYMENT_COMPLETED,
          eventTimestamp: new Date(),
        },
      })
    ).rejects.toThrowError();
  });
});
