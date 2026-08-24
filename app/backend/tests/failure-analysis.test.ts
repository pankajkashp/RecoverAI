import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FailureAnalysisService } from "../src/services/failure-analysis.service.js";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import { CanonicalPaymentEvent } from "@recoverai/contracts";

const prisma = new PrismaClient();
const failureService = new FailureAnalysisService();
const pipelineService = new PaymentPipelineService(prisma, failureService);

describe("Phase 4 — Automatic Failure Analysis Service", () => {
  const baseEvent: CanonicalPaymentEvent = {
    externalPaymentId: "pay_test_failure_mock",
    companyId: "demo_company_001",
    providerId: "provider_demo_sandbox",
    amount: 5000,
    currency: "INR",
    status: "FAILED",
    paymentMethod: "CARD",
    eventType: "PAYMENT_FAILED",
    eventTimestamp: new Date(),
  };

  describe("Failure Taxonomy & Classification", () => {
    it("classifies INSUFFICIENT_FUNDS failure codes and messages", () => {
      const result1 = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "INSUFFICIENT_FUNDS",
      });
      expect(result1.category).toBe("INSUFFICIENT_FUNDS");
      expect(result1.classification).toBe("TEMPORARY");
      expect(result1.isTemporary).toBe(true);
      expect(result1.reason).toContain("sufficient funds");

      const result2 = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: undefined,
        failureMessage: "User account has low balance",
      });
      expect(result2.category).toBe("INSUFFICIENT_FUNDS");
    });

    it("classifies AUTHENTICATION failure codes and messages", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "OTP_EXPIRED",
        failureMessage: "Customer timed out during 3D Secure verification",
      });
      expect(result.category).toBe("AUTHENTICATION");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.reason).toContain("customer authentication");
    });

    it("classifies NETWORK failures", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "PSP_TIMEOUT",
        failureMessage: "Connection timed out to payment switch",
      });
      expect(result.category).toBe("NETWORK");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.reason).toContain("network or communication failure");
    });

    it("classifies CARD failures and marks them permanent", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "EXPIRED_CARD",
        failureMessage: "Card expiration date has passed",
      });
      expect(result.category).toBe("CARD");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
      expect(result.reason).toContain("card-specific issues");
    });

    it("classifies BANK failures", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "ISSUER_DECLINED",
        failureMessage: "Transaction rejected by customer bank",
      });
      expect(result.category).toBe("BANK");
      expect(result.reason).toContain("customer's or acquiring bank");
    });

    it("classifies PROVIDER failures", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "GATEWAY_ERROR",
        failureMessage: "Internal payment processor error",
      });
      expect(result.category).toBe("PROVIDER");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.reason).toContain("provider-side outage");
    });

    it("classifies CUSTOMER_ACTION_REQUIRED failures", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "MANDATE_PENDING",
        failureMessage: "Customer action required to approve recurring e-mandate",
      });
      expect(result.category).toBe("CUSTOMER_ACTION_REQUIRED");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.reason).toContain("Customer intervention is required");
    });

    it("classifies TEMPORARY transient failures", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "SYSTEM_BUSY",
        failureMessage: "Temporary glitch, please try again later",
      });
      expect(result.category).toBe("TEMPORARY");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.reason).toContain("transient failure");
    });

    it("classifies UNKNOWN failures without falsely guessing", () => {
      const result = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "UNRECOGNIZED_ERR_9999",
        failureMessage: "Some completely unexpected error description",
      });
      expect(result.category).toBe("UNKNOWN");
      expect(result.classification).toBe("UNKNOWN");
      expect(result.isTemporary).toBeNull();
      expect(result.originalFailureCode).toBe("UNRECOGNIZED_ERR_9999");
      expect(result.originalFailureMessage).toBe("Some completely unexpected error description");
      expect(result.reason).toContain("unrecognized or insufficiently classified");
    });
  });

  describe("Automatic Pipeline Integration & Persistence", () => {
    const testPrefix = `pay_p4_test_${Date.now()}`;

    afterAll(async () => {
      await prisma.recoveryAssessment.deleteMany({
        where: {
          paymentEvent: {
            externalPaymentId: { startsWith: testPrefix },
          },
        },
      });
      await prisma.paymentFailure.deleteMany({
        where: {
          paymentEvent: {
            externalPaymentId: { startsWith: testPrefix },
          },
        },
      });
      await prisma.paymentEvent.deleteMany({
        where: {
          externalPaymentId: { startsWith: testPrefix },
        },
      });
      await prisma.$disconnect();
    });

    it("automatically analyzes and persists PaymentFailure for a failed payment", async () => {
      const failedId = `${testPrefix}_failed_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: failedId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 8750.0,
        currency: "INR",
        status: "FAILED",
        paymentMethod: "UPI",
        eventType: "PAYMENT_FAILED",
        failureCode: "LOW_BALANCE",
        failureMessage: "Not enough funds in customer wallet",
        eventTimestamp: new Date(),
      };

      const result = await pipelineService.processEvent(event);

      expect(result.status).toBe("CREATED");
      expect(result.failureAnalysis).toBeDefined();
      expect(result.failureAnalysis?.category).toBe("INSUFFICIENT_FUNDS");
      expect(result.failureAnalysis?.reason).toContain("sufficient funds");

      // Verify database record
      const savedFailure = await prisma.paymentFailure.findUnique({
        where: { paymentEventId: result.paymentEventId },
      });

      expect(savedFailure).not.toBeNull();
      expect(savedFailure?.category).toBe("INSUFFICIENT_FUNDS");
      expect(savedFailure?.failureCode).toBe("LOW_BALANCE");
      expect(savedFailure?.failureMessage).toContain("sufficient funds");
    });

    it("does NOT create PaymentFailure for a successful payment", async () => {
      const successId = `${testPrefix}_success_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: successId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 15000.0,
        currency: "INR",
        status: "COMPLETED",
        paymentMethod: "NETBANKING",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date(),
      };

      const result = await pipelineService.processEvent(event);

      expect(result.status).toBe("CREATED");
      expect(result.failureAnalysis).toBeUndefined();

      // Verify no failure record in DB
      const savedFailure = await prisma.paymentFailure.findUnique({
        where: { paymentEventId: result.paymentEventId },
      });

      expect(savedFailure).toBeNull();
    });

    it("maintains idempotency: duplicate failed payment creates no duplicate failure records", async () => {
      const failedId = `${testPrefix}_idemp_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: failedId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 2200.0,
        currency: "INR",
        status: "FAILED",
        paymentMethod: "CARD",
        eventType: "PAYMENT_FAILED",
        failureCode: "EXPIRED_CARD",
        eventTimestamp: new Date(),
      };

      // Ingest 1st time
      const result1 = await pipelineService.processEvent(event);
      expect(result1.status).toBe("CREATED");
      expect(result1.isDuplicate).toBe(false);

      // Ingest 2nd time (duplicate)
      const result2 = await pipelineService.processEvent(event);
      expect(result2.status).toBe("DUPLICATE");
      expect(result2.isDuplicate).toBe(true);

      // Verify exactly 1 PaymentEvent and 1 PaymentFailure exist
      const eventCount = await prisma.paymentEvent.count({
        where: { externalPaymentId: failedId },
      });
      expect(eventCount).toBe(1);

      const failureCount = await prisma.paymentFailure.count({
        where: { paymentEventId: result1.paymentEventId },
      });
      expect(failureCount).toBe(1);
    });
  });
});
