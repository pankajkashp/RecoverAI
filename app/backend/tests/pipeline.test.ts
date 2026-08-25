import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import { CanonicalPaymentEvent } from "@recoverai/contracts";

const prisma = new PrismaClient();
const pipelineService = new PaymentPipelineService(prisma);

describe("Phase 3 — PaymentPipelineService", () => {
  const testExternalId = `pay_pipeline_test_${Date.now()}`;

  afterAll(async () => {
    // Cleanup records in FK-safe order: recommendation → assessment → failure → event
    await prisma.recoveryRecommendation.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_pipeline_test_" },
        },
      },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_pipeline_test_" },
        },
      },
    });
    await prisma.paymentFailure.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_pipeline_test_" },
        },
      },
    });
    await prisma.paymentEvent.deleteMany({
      where: {
        externalPaymentId: { startsWith: "pay_pipeline_test_" },
      },
    });
    await prisma.$disconnect();
  });

  it("persists a valid new canonical payment event", async () => {
    const event: CanonicalPaymentEvent = {
      externalPaymentId: testExternalId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      customerReference: "cust_test_pipeline",
      amount: 3499.0,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "UPI",
      eventType: "PAYMENT_FAILED",
      failureCode: "PSP_DEBIT_FAILED",
      failureMessage: "Bank server declined transaction",
      failureCategory: "BANK",
      eventTimestamp: new Date(),
      metadata: { isTest: true },
    };

    const result = await pipelineService.processEvent(event);

    expect(result.status).toBe("CREATED");
    expect(result.isDuplicate).toBe(false);
    expect(result.paymentEventId).toBeDefined();
    expect(result.externalPaymentId).toBe(testExternalId);

    // Verify record in PostgreSQL
    const saved = await prisma.paymentEvent.findUnique({
      where: { id: result.paymentEventId },
      include: { failure: true },
    });

    expect(saved).not.toBeNull();
    expect(saved?.externalPaymentId).toBe(testExternalId);
    expect(Number(saved?.amount)).toBe(3499);
    expect(saved?.failure).not.toBeNull();
    expect(saved?.failure?.category).toBe("BANK");
    expect(saved?.failure?.failureCode).toBe("PSP_DEBIT_FAILED");
  });

  it("safely handles duplicate payment events (idempotency)", async () => {
    const duplicateEvent: CanonicalPaymentEvent = {
      externalPaymentId: testExternalId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 3499.0,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "UPI",
      eventType: "PAYMENT_FAILED",
      eventTimestamp: new Date(),
    };

    // Re-submit the exact same event
    const result = await pipelineService.processEvent(duplicateEvent);

    expect(result.status).toBe("DUPLICATE");
    expect(result.isDuplicate).toBe(true);
    expect(result.externalPaymentId).toBe(testExternalId);
    expect(result.message).toContain("Duplicate payment event detected");

    // Verify no additional duplicate records were created
    const count = await prisma.paymentEvent.count({
      where: { externalPaymentId: testExternalId },
    });
    expect(count).toBe(1);
  });

  it("rejects payment event when company does not exist", async () => {
    const invalidCompanyEvent: CanonicalPaymentEvent = {
      externalPaymentId: `pay_invalid_comp_${Date.now()}`,
      companyId: "non_existent_company_9999",
      providerId: "provider_demo_sandbox",
      amount: 100.0,
      currency: "INR",
      status: "COMPLETED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_COMPLETED",
      eventTimestamp: new Date(),
    };

    await expect(
      pipelineService.processEvent(invalidCompanyEvent)
    ).rejects.toThrowError(/Company not found/);
  });

  it("rejects payment event when provider does not exist", async () => {
    const invalidProviderEvent: CanonicalPaymentEvent = {
      externalPaymentId: `pay_invalid_prov_${Date.now()}`,
      companyId: "demo_company_001",
      providerId: "non_existent_provider_9999",
      amount: 100.0,
      currency: "INR",
      status: "COMPLETED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_COMPLETED",
      eventTimestamp: new Date(),
    };

    await expect(
      pipelineService.processEvent(invalidProviderEvent)
    ).rejects.toThrowError(/Provider not found/);
  });
});
