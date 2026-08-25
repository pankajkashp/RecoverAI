/**
 * RecoverAI — Recovery Execution & Outcome Tracking Tests
 *
 * Phase 8: Recovery Execution & Outcome Tracking
 *
 * Covers:
 * - Execution eligibility (only RETRY_PAYMENT is allowed; others are blocked with 422)
 * - Demo recovery adapter simulation outcomes (SUCCESSFUL, FAILED, CANCELLED, EXPIRED, UNKNOWN)
 * - PostgreSQL persistence of RecoveryAttempt and RecoveryOutcome
 * - Separation between estimated recoverable amount and actual recovered amount
 * - Execution idempotency (duplicate execution calls return existing outcome without creating duplicates)
 * - REST API endpoints (POST /api/recovery-attempts)
 * - Error handling (400 Bad Request, 404 Not Found, 422 Ineligible)
 */

import { describe, expect, it, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import { RecoveryExecutionService } from "../src/services/recovery-execution.service.js";
import { DemoRecoveryAdapter } from "@recoverai/integrations";
import { CanonicalPaymentEvent } from "@recoverai/contracts";

const prisma = new PrismaClient();
const app = createApp();
const pipelineService = new PaymentPipelineService(prisma);
const executionService = new RecoveryExecutionService(
  prisma,
  new DemoRecoveryAdapter()
);

describe("Phase 8 — Recovery Execution & Outcome Tracking", () => {
  const testPrefix = `pay_p8_test_${Date.now()}`;

  afterAll(async () => {
    // Cleanup in strict FK order:
    // recoveryOutcome -> recoveryAttempt -> recoveryRecommendation -> recoveryAssessment -> paymentFailure -> paymentEvent
    await prisma.recoveryOutcome.deleteMany({
      where: {
        recoveryAttempt: {
          paymentEvent: {
            externalPaymentId: { startsWith: testPrefix },
          },
        },
      },
    });
    await prisma.recoveryAttempt.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: testPrefix },
        },
      },
    });
    await prisma.recoveryRecommendation.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: testPrefix },
        },
      },
    });
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

  // Helper to create a failed payment through the standard pipeline
  async function createFailedPayment(
    suffix: string,
    failureCode: string,
    amount = 5000.0,
    paymentMethod: "CARD" | "UPI" | "NETBANKING" = "UPI"
  ) {
    const event: CanonicalPaymentEvent = {
      externalPaymentId: `${testPrefix}_${suffix}`,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount,
      currency: "INR",
      status: "FAILED",
      paymentMethod,
      eventType: "PAYMENT_FAILED",
      failureCode,
      eventTimestamp: new Date(),
    };

    const pipelineResult = await pipelineService.processEvent(event);
    const rec = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: pipelineResult.paymentEventId },
    });

    return {
      paymentEventId: pipelineResult.paymentEventId,
      recommendationId: rec!.id,
      action: rec!.action,
      pipelineResult,
    };
  }

  describe("1. Execution Eligibility Rules", () => {
    it("allows execution for RETRY_PAYMENT recommendation (INSUFFICIENT_FUNDS)", async () => {
      const { recommendationId, paymentEventId, action } =
        await createFailedPayment("elig_retry", "INSUFFICIENT_FUNDS");

      expect(action).toBe("RETRY_PAYMENT");

      const response = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("EXECUTED");
      expect(response.body.data.isExecuted).toBe(true);
      expect(response.body.data.paymentEventId).toBe(paymentEventId);
      expect(response.body.data.recommendationAction).toBe("RETRY_PAYMENT");
      expect(response.body.data.isDemoSandbox).toBe(true);
    });

    it("blocks execution for DO_NOT_RECOVER recommendation with 422 Unprocessable Entity", async () => {
      const { recommendationId, action } = await createFailedPayment(
        "elig_donot",
        "LOST_CARD",
        3000.0,
        "CARD"
      );

      expect(action).toBe("DO_NOT_RECOVER");

      const response = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe("INELIGIBLE_RECOVERY_ACTION");
      expect(response.body.error).toContain("DO_NOT_RECOVER");
    });

    it("blocks execution for CUSTOMER_ACTION_REQUIRED recommendation with 422 Unprocessable Entity", async () => {
      const { recommendationId, action } = await createFailedPayment(
        "elig_custact",
        "OTP_EXPIRED",
        2500.0,
        "CARD"
      );

      expect(action).toBe("CUSTOMER_ACTION_REQUIRED");

      const response = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe("INELIGIBLE_RECOVERY_ACTION");
      expect(response.body.error).toContain("CUSTOMER_ACTION_REQUIRED");
    });

    it("blocks execution for REVIEW recommendation with 422 Unprocessable Entity", async () => {
      const { recommendationId, action } = await createFailedPayment(
        "elig_review",
        "UNRECOGNIZED_STRANGE_CODE_9999",
        1200.0,
        "NETBANKING"
      );

      expect(action).toBe("REVIEW");

      const response = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe("INELIGIBLE_RECOVERY_ACTION");
      expect(response.body.error).toContain("REVIEW");
    });
  });

  describe("2. Demo Recovery Adapter — Synthetic Outcome Simulation", () => {
    it("simulates SUCCESSFUL recovery: records full recovered amount and updates recommendation to EXECUTED", async () => {
      const { recommendationId } = await createFailedPayment(
        "sim_success",
        "INSUFFICIENT_FUNDS",
        8000.0
      );

      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "SUCCESSFUL",
      });

      expect(result.status).toBe("EXECUTED");
      expect(result.attemptStatus).toBe("SUCCESSFUL");
      expect(result.outcomeStatus).toBe("SUCCESSFUL");
      expect(result.actualRecoveredAmount).toBe("8000");
      expect(result.isDemoSandbox).toBe(true);

      // Verify PostgreSQL state
      const dbOutcome = await prisma.recoveryOutcome.findUnique({
        where: { id: result.recoveryOutcomeId },
      });
      expect(dbOutcome).not.toBeNull();
      expect(dbOutcome?.outcome).toBe("SUCCESSFUL");
      expect(Number(dbOutcome?.actualRecoveredAmount)).toBe(8000.0);
      expect(dbOutcome?.notes).toContain("[DEMO/SANDBOX]");

      const dbRec = await prisma.recoveryRecommendation.findUnique({
        where: { id: recommendationId },
      });
      expect(dbRec?.status).toBe("EXECUTED");
    });

    it("simulates FAILED recovery: records 0 recovered amount", async () => {
      const { recommendationId } = await createFailedPayment(
        "sim_failed",
        "NETWORK",
        6000.0
      );

      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "FAILED",
      });

      expect(result.outcomeStatus).toBe("FAILED");
      expect(result.actualRecoveredAmount).toBe("0");

      const dbOutcome = await prisma.recoveryOutcome.findUnique({
        where: { id: result.recoveryOutcomeId },
      });
      expect(dbOutcome?.outcome).toBe("FAILED");
      expect(Number(dbOutcome?.actualRecoveredAmount)).toBe(0);
      expect(dbOutcome?.notes).toContain("failed during simulated gateway retry");
    });

    it("simulates CANCELLED recovery outcome", async () => {
      const { recommendationId } = await createFailedPayment(
        "sim_cancel",
        "TEMPORARY",
        4500.0
      );

      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "CANCELLED",
      });

      expect(result.outcomeStatus).toBe("CANCELLED");
      expect(result.actualRecoveredAmount).toBe("0");
    });

    it("simulates EXPIRED recovery outcome", async () => {
      const { recommendationId } = await createFailedPayment(
        "sim_expire",
        "PROVIDER",
        3200.0
      );

      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "EXPIRED",
      });

      expect(result.outcomeStatus).toBe("EXPIRED");
      expect(result.actualRecoveredAmount).toBe("0");
    });

    it("simulates UNKNOWN recovery outcome", async () => {
      const { recommendationId } = await createFailedPayment(
        "sim_unk",
        "INSUFFICIENT_FUNDS",
        2100.0
      );

      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "UNKNOWN",
      });

      expect(result.outcomeStatus).toBe("UNKNOWN");
      expect(result.actualRecoveredAmount).toBeNull();
    });
  });

  describe("3. Amount Separation Guarantee (Estimated vs Actual)", () => {
    it("strictly preserves estimatedRecoverableAmount when actualRecoveredAmount is 0 on failed recovery", async () => {
      const { recommendationId, paymentEventId } = await createFailedPayment(
        "amt_sep",
        "INSUFFICIENT_FUNDS",
        9500.0
      );

      // Verify estimatedRecoverableAmount is 9500 before execution
      const assessmentBefore = await prisma.recoveryAssessment.findUnique({
        where: { paymentEventId },
      });
      expect(Number(assessmentBefore?.estimatedRecoverableAmount)).toBe(9500.0);

      // Execute simulated FAILED recovery (actual recovered = 0)
      const result = await executionService.executeRecovery({
        recommendationId,
        forceSimulationOutcome: "FAILED",
      });

      expect(result.actualRecoveredAmount).toBe("0");
      expect(result.estimatedRecoverableAmount).toBe("9500");

      // Verify PostgreSQL: estimated amount was NOT modified
      const assessmentAfter = await prisma.recoveryAssessment.findUnique({
        where: { paymentEventId },
      });
      expect(Number(assessmentAfter?.estimatedRecoverableAmount)).toBe(9500.0);

      const outcome = await prisma.recoveryOutcome.findUnique({
        where: { id: result.recoveryOutcomeId },
      });
      expect(Number(outcome?.actualRecoveredAmount)).toBe(0.0);

      // Verify they are distinct values
      expect(Number(assessmentAfter?.estimatedRecoverableAmount)).not.toBe(
        Number(outcome?.actualRecoveredAmount)
      );
    });
  });

  describe("4. Execution Idempotency & Duplicate Protection", () => {
    it("submitting the same recovery execution twice creates exactly 1 attempt and 1 outcome", async () => {
      const { recommendationId, paymentEventId } = await createFailedPayment(
        "idemp_exec",
        "INSUFFICIENT_FUNDS",
        7000.0
      );

      // 1st Execution
      const res1 = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(res1.status).toBe(201);
      expect(res1.body.data.status).toBe("EXECUTED");
      expect(res1.body.data.isExecuted).toBe(true);

      const attemptId1 = res1.body.data.recoveryAttemptId;
      const outcomeId1 = res1.body.data.recoveryOutcomeId;

      // 2nd Execution (duplicate call)
      const res2 = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId });

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("ALREADY_EXECUTED");
      expect(res2.body.data.isExecuted).toBe(false);
      expect(res2.body.data.recoveryAttemptId).toBe(attemptId1);
      expect(res2.body.data.recoveryOutcomeId).toBe(outcomeId1);

      // Verify DB counts: exactly 1 attempt and 1 outcome
      const attemptCount = await prisma.recoveryAttempt.count({
        where: { paymentEventId },
      });
      expect(attemptCount).toBe(1);

      const outcomeCount = await prisma.recoveryOutcome.count({
        where: { paymentEventId },
      });
      expect(outcomeCount).toBe(1);
    });

    it("can trigger execution via paymentEventId and enforces idempotency", async () => {
      const { paymentEventId } = await createFailedPayment(
        "idemp_payid",
        "NETWORK",
        3300.0
      );

      const res1 = await request(app)
        .post("/api/recovery-attempts")
        .send({ paymentEventId });

      expect(res1.status).toBe(201);
      expect(res1.body.data.isExecuted).toBe(true);

      const res2 = await request(app)
        .post("/api/recovery-attempts")
        .send({ paymentEventId });

      expect(res2.status).toBe(200);
      expect(res2.body.data.isExecuted).toBe(false);
      expect(res2.body.data.status).toBe("ALREADY_EXECUTED");
    });
  });

  describe("5. Error Handling & Validation", () => {
    it("returns 400 Bad Request when neither recommendationId nor paymentEventId is supplied", async () => {
      const res = await request(app)
        .post("/api/recovery-attempts")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 404 Not Found for non-existent recommendation ID", async () => {
      const res = await request(app)
        .post("/api/recovery-attempts")
        .send({ recommendationId: "non_existent_rec_12345" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("RECOMMENDATION_NOT_FOUND");
    });
  });
});
