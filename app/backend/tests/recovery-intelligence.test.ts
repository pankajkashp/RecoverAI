import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FailureAnalysisService } from "../src/services/failure-analysis.service.js";
import { RecoveryIntelligenceService } from "../src/services/recovery-intelligence.service.js";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import { CanonicalPaymentEvent } from "@recoverai/contracts";

const prisma = new PrismaClient();
const failureService = new FailureAnalysisService();
const recoveryService = new RecoveryIntelligenceService();
const pipelineService = new PaymentPipelineService(
  prisma,
  failureService,
  recoveryService
);

describe("Phase 5 — Recovery Intelligence Service", () => {
  const baseEvent: CanonicalPaymentEvent = {
    externalPaymentId: "pay_test_recovery_mock",
    companyId: "demo_company_001",
    providerId: "provider_demo_sandbox",
    amount: 10000.0,
    currency: "INR",
    status: "FAILED",
    paymentMethod: "UPI",
    eventType: "PAYMENT_FAILED",
    eventTimestamp: new Date(),
  };

  describe("Deterministic Worthiness Decisions & Amount Estimation", () => {
    it("evaluates INSUFFICIENT_FUNDS as RECOVER with full estimated amount", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "INSUFFICIENT_BALANCE",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("RECOVER");
      expect(assessment.estimatedRecoverableAmount).toBe(10000.0);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0.8);
      expect(assessment.reasoning).toContain("insufficient-funds");
    });

    it("evaluates NETWORK failure as RECOVER with full estimated amount", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "SWITCH_TIMEOUT",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("RECOVER");
      expect(assessment.estimatedRecoverableAmount).toBe(10000.0);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0.85);
      expect(assessment.reasoning).toContain("network or communication error");
    });

    it("evaluates AUTHENTICATION failure as REVIEW", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "OTP_EXPIRED",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("REVIEW");
      expect(assessment.estimatedRecoverableAmount).toBe(10000.0);
      expect(assessment.reasoning).toContain("customer authentication");
    });

    it("evaluates permanent CARD failure as DO_NOT_RECOVER with 0 estimated amount", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "LOST_CARD",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("DO_NOT_RECOVER");
      expect(assessment.estimatedRecoverableAmount).toBe(0);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0.9);
      expect(assessment.reasoning).toContain("lost, or stolen card");
    });

    it("evaluates temporary BANK outage as RECOVER", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "BANK_SWITCH_OFFLINE",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("RECOVER");
      expect(assessment.estimatedRecoverableAmount).toBe(10000.0);
      expect(assessment.reasoning).toContain("bank was temporarily unavailable");
    });

    it("evaluates permanent BANK decline (account blocked) as DO_NOT_RECOVER with 0 estimated amount", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "ACCOUNT_BLOCKED",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("DO_NOT_RECOVER");
      expect(assessment.estimatedRecoverableAmount).toBe(0);
      expect(assessment.reasoning).toContain("permanently declined");
    });

    it("evaluates UNKNOWN failure as REVIEW with 0 estimated amount (conservative)", () => {
      const failure = failureService.analyzeFailure({
        ...baseEvent,
        failureCode: "STRANGE_ERR_9999",
      });
      const assessment = recoveryService.assessRecovery(baseEvent, failure);

      expect(assessment.worthiness).toBe("REVIEW");
      expect(assessment.estimatedRecoverableAmount).toBe(0);
      expect(assessment.reasoning).toContain("unclassified or unrecognized");
    });
  });

  describe("Automatic Pipeline Integration & PostgreSQL Persistence", () => {
    const testPrefix = `pay_p5_test_${Date.now()}`;

    afterAll(async () => {
      // Clean up test records
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

    it("automatically generates and persists RecoveryAssessment for failed payment", async () => {
      const failedId = `${testPrefix}_insufficient_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: failedId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 4500.0,
        currency: "INR",
        status: "FAILED",
        paymentMethod: "UPI",
        eventType: "PAYMENT_FAILED",
        failureCode: "INSUFFICIENT_FUNDS",
        eventTimestamp: new Date(),
      };

      const result = await pipelineService.processEvent(event);

      expect(result.status).toBe("CREATED");
      expect(result.recoveryAssessment).toBeDefined();
      expect(result.recoveryAssessment?.worthiness).toBe("RECOVER");
      expect(Number(result.recoveryAssessment?.estimatedRecoverableAmount)).toBe(
        4500
      );
      expect(result.recoveryAssessment?.reasoning).toBeDefined();

      // Check PostgreSQL database persistence
      const savedAssessment = await prisma.recoveryAssessment.findUnique({
        where: { paymentEventId: result.paymentEventId },
      });

      expect(savedAssessment).not.toBeNull();
      expect(savedAssessment?.worthiness).toBe("RECOVER");
      expect(Number(savedAssessment?.estimatedRecoverableAmount)).toBe(4500);
      expect(savedAssessment?.reasoning).toContain("insufficient-funds");
    });

    it("does NOT generate or persist RecoveryAssessment for a successful payment", async () => {
      const successId = `${testPrefix}_success_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: successId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 8000.0,
        currency: "INR",
        status: "COMPLETED",
        paymentMethod: "CARD",
        eventType: "PAYMENT_COMPLETED",
        eventTimestamp: new Date(),
      };

      const result = await pipelineService.processEvent(event);

      expect(result.status).toBe("CREATED");
      expect(result.recoveryAssessment).toBeUndefined();

      // Check PostgreSQL DB
      const savedAssessment = await prisma.recoveryAssessment.findUnique({
        where: { paymentEventId: result.paymentEventId },
      });

      expect(savedAssessment).toBeNull();
    });

    it("maintains idempotency: duplicate failed payment creates exactly one RecoveryAssessment", async () => {
      const failedId = `${testPrefix}_idemp_01`;

      const event: CanonicalPaymentEvent = {
        externalPaymentId: failedId,
        companyId: "demo_company_001",
        providerId: "provider_demo_sandbox",
        amount: 3200.0,
        currency: "INR",
        status: "FAILED",
        paymentMethod: "CARD",
        eventType: "PAYMENT_FAILED",
        failureCode: "LOST_CARD",
        eventTimestamp: new Date(),
      };

      // 1st submission
      const result1 = await pipelineService.processEvent(event);
      expect(result1.status).toBe("CREATED");
      expect(result1.isDuplicate).toBe(false);
      expect(result1.recoveryAssessment?.worthiness).toBe("DO_NOT_RECOVER");

      // 2nd submission (duplicate)
      const result2 = await pipelineService.processEvent(event);
      expect(result2.status).toBe("DUPLICATE");
      expect(result2.isDuplicate).toBe(true);
      expect(result2.recoveryAssessment?.worthiness).toBe("DO_NOT_RECOVER");

      // Verify exactly 1 PaymentEvent and 1 RecoveryAssessment in DB
      const eventCount = await prisma.paymentEvent.count({
        where: { externalPaymentId: failedId },
      });
      expect(eventCount).toBe(1);

      const assessmentCount = await prisma.recoveryAssessment.count({
        where: { paymentEventId: result1.paymentEventId },
      });
      expect(assessmentCount).toBe(1);
    });
  });
});
