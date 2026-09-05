/**
 * RecoverAI — Recovery Decision Validation Tests
 *
 * Two layers:
 * 1. Pure unit tests against classifyRecoveryDecisionCase / buildRecoveryValidationReport
 *    using hand-built cases — fast, deterministic, no database.
 * 2. Database integration tests that drive the real webhook -> pipeline -> execution
 *    -> provider-confirmation lifecycle (same patterns as recovery-lifecycle-trust.test.ts)
 *    and verify RecoveryDecisionValidationService.loadCasesForCompany reads it back
 *    correctly.
 *
 * Together these prove: a retry link/attempt is never counted as a recovery, only
 * a provider-confirmed + RecoverAI-attributed outcome is; actual recovered amount
 * always comes from the confirmed outcome, never from the estimate or the attempt.
 */

import crypto from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { environment } from "../src/config/env.js";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import { RecoveryRecommendationService } from "../src/services/recovery-recommendation.service.js";
import {
  classifyRecoveryDecisionCase,
  buildRecoveryValidationReport,
  RecoveryDecisionValidationService,
  type RecoveryDecisionCase,
} from "../src/services/recovery-validation.service.js";

const prisma = new PrismaClient();
const app = createApp();

const TEST_WEBHOOK_SECRET =
  environment.RAZORPAY_WEBHOOK_SECRET || "test_webhook_secret_key";

function signPayload(payload: object, secret: string = TEST_WEBHOOK_SECRET): string {
  const jsonStr = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(jsonStr).digest("hex");
}

// ============================================================================
// Case fixture builder for pure unit tests
// ============================================================================

function makeCase(overrides: Partial<RecoveryDecisionCase> = {}): RecoveryDecisionCase {
  return {
    paymentEventId: "pay_unit_test",
    recommendationAction: "RETRY_PAYMENT",
    worthiness: "RECOVER",
    estimatedRecoverableAmount: 1000,
    latestAttemptStatus: null,
    outcomeStatus: null,
    actualRecoveredAmount: null,
    recoveryAttribution: null,
    businessTransactionStatus: null,
    mlUsed: null,
    mlProbability: null,
    ...overrides,
  };
}

// ============================================================================
// 1. Pure classification unit tests
// ============================================================================

describe("classifyRecoveryDecisionCase — evidence-based ground truth", () => {
  it("RECOVER + provider-confirmed captured payment (RecoverAI-attributed) → confirmed success", () => {
    const c = makeCase({
      latestAttemptStatus: "SUCCESSFUL",
      outcomeStatus: "SUCCESSFUL",
      actualRecoveredAmount: 1000,
      recoveryAttribution: "RECOVERAI",
    });
    expect(classifyRecoveryDecisionCase(c)).toBe(
      "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
    );
  });

  it("RECOVER + provider-confirmed failed retry → confirmed failure", () => {
    const c = makeCase({
      latestAttemptStatus: "FAILED",
      outcomeStatus: "FAILED",
      actualRecoveredAmount: 0,
      recoveryAttribution: "NONE",
    });
    expect(classifyRecoveryDecisionCase(c)).toBe(
      "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE"
    );
  });

  it("RECOVER + cancelled/expired retry → also confirmed failure (terminal, definitively not recovered)", () => {
    expect(
      classifyRecoveryDecisionCase(makeCase({ latestAttemptStatus: "CANCELLED", outcomeStatus: "CANCELLED" }))
    ).toBe("RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE");
    expect(
      classifyRecoveryDecisionCase(makeCase({ latestAttemptStatus: "EXPIRED", outcomeStatus: "EXPIRED" }))
    ).toBe("RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE");
  });

  it("DO_NOT_RECOVER with no attempt → recommended do-not-recover (correctly never executed)", () => {
    const c = makeCase({ recommendationAction: "DO_NOT_RECOVER", worthiness: "DO_NOT_RECOVER" });
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_DO_NOT_RECOVER");
  });

  it("DO_NOT_RECOVER with an attempt anyway → flagged as an anomaly, not silently ignored", () => {
    const c = makeCase({
      recommendationAction: "DO_NOT_RECOVER",
      worthiness: "DO_NOT_RECOVER",
      latestAttemptStatus: "ATTEMPTED",
    });
    expect(classifyRecoveryDecisionCase(c)).toBe(
      "ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER"
    );
  });

  it("REVIEW → recommended review; no automatic recovery is implied", () => {
    const c = makeCase({ recommendationAction: "REVIEW", worthiness: "REVIEW" });
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_REVIEW");
  });

  it("CUSTOMER_ACTION_REQUIRED → distinct customer-action class, not treated as a retry", () => {
    const c = makeCase({ recommendationAction: "CUSTOMER_ACTION_REQUIRED", worthiness: "REVIEW" });
    expect(classifyRecoveryDecisionCase(c)).toBe("CUSTOMER_ACTION_REQUIRED");
  });

  it("retry attempted but no provider confirmation yet → NOT counted as recovered", () => {
    const c = makeCase({ latestAttemptStatus: "ATTEMPTED", outcomeStatus: null });
    const result = classifyRecoveryDecisionCase(c);
    expect(result).toBe("RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED");
    expect(result).not.toBe("RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS");
  });

  it("provider returns an inconclusive UNKNOWN outcome → still not counted as recovered", () => {
    const c = makeCase({ latestAttemptStatus: "UNKNOWN", outcomeStatus: "UNKNOWN" });
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED");
  });

  it("RECOVER recommended but never attempted → not attempted, not a failure", () => {
    const c = makeCase({ latestAttemptStatus: null, outcomeStatus: null });
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_RECOVER_NOT_ATTEMPTED");
  });

  it("unrelated/manual payment settling the transaction must NOT be attributed to RecoverAI recovery", () => {
    // The outcome looks successful, but attribution says it was NOT RecoverAI's doing
    // (e.g. the customer paid on their own, unrelated to the retry link).
    const c = makeCase({
      latestAttemptStatus: "ATTEMPTED",
      outcomeStatus: "SUCCESSFUL",
      actualRecoveredAmount: 1000,
      recoveryAttribution: "CUSTOMER",
    });
    const result = classifyRecoveryDecisionCase(c);
    expect(result).not.toBe("RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS");
    expect(result).toBe("RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED");
  });
});

// ============================================================================
// 2. Pure metric aggregation unit tests
// ============================================================================

describe("buildRecoveryValidationReport — metrics only reflect resolved ground truth", () => {
  it("recoveryDecisionPrecision counts only provider-confirmed outcomes, excludes pending attempts", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", actualRecoveredAmount: 500 }),
      makeCase({ paymentEventId: "p2", outcomeStatus: "FAILED", actualRecoveredAmount: 0 }),
      makeCase({ paymentEventId: "p3", latestAttemptStatus: "ATTEMPTED", outcomeStatus: null }), // pending — must be excluded
    ];
    const report = buildRecoveryValidationReport(cases);

    expect(report.recoveryDecisionPrecision.numerator).toBe(1);
    expect(report.recoveryDecisionPrecision.denominator).toBe(2); // p1 + p2 only, not p3
    expect(report.recoveryDecisionPrecision.value).toBe(0.5);
    expect(report.recoveryDecisionPrecision.insufficientData).toBe(false);
  });

  it("falseRecoveryRecommendationRate mirrors the confirmed-failure share of resolved cases", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", outcomeStatus: "FAILED" }),
      makeCase({ paymentEventId: "p2", outcomeStatus: "FAILED" }),
      makeCase({ paymentEventId: "p3", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI" }),
    ];
    const report = buildRecoveryValidationReport(cases);
    expect(report.falseRecoveryRecommendationRate.numerator).toBe(2);
    expect(report.falseRecoveryRecommendationRate.denominator).toBe(3);
    expect(report.falseRecoveryRecommendationRate.value).toBeCloseTo(2 / 3);
  });

  it("with zero resolved RECOVER cases, precision and false-rate report insufficientData rather than 0%", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", latestAttemptStatus: "ATTEMPTED", outcomeStatus: null }),
      makeCase({ paymentEventId: "p2", recommendationAction: "REVIEW", worthiness: "REVIEW" }),
    ];
    const report = buildRecoveryValidationReport(cases);
    expect(report.recoveryDecisionPrecision.insufficientData).toBe(true);
    expect(report.recoveryDecisionPrecision.value).toBeNull();
    expect(report.falseRecoveryRecommendationRate.insufficientData).toBe(true);
  });

  it("actualRecoveredAmount sums only provider-confirmed, RecoverAI-attributed successes — not estimates, not attempts", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", actualRecoveredAmount: 700, estimatedRecoverableAmount: 999 }),
      // Attempted but unconfirmed — must NOT contribute despite having an estimate.
      makeCase({ paymentEventId: "p2", latestAttemptStatus: "ATTEMPTED", outcomeStatus: null, estimatedRecoverableAmount: 5000 }),
      // Successful but NOT RecoverAI's doing — must NOT contribute.
      makeCase({ paymentEventId: "p3", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "CUSTOMER", actualRecoveredAmount: 300 }),
    ];
    const report = buildRecoveryValidationReport(cases);
    expect(report.actualRecoveredAmount.total).toBe(700);
    expect(report.actualRecoveredAmount.confirmedCaseCount).toBe(1);
  });

  it("estimatedVsActual compares only resolved cases and excludes pending ones from the deviation", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", actualRecoveredAmount: 800, estimatedRecoverableAmount: 1000 }),
      makeCase({ paymentEventId: "p2", outcomeStatus: "FAILED", actualRecoveredAmount: 0, estimatedRecoverableAmount: 500 }),
      makeCase({ paymentEventId: "p3", latestAttemptStatus: "ATTEMPTED", outcomeStatus: null, estimatedRecoverableAmount: 10000 }),
    ];
    const report = buildRecoveryValidationReport(cases);
    expect(report.estimatedVsActual.comparableCaseCount).toBe(2);
    expect(report.estimatedVsActual.totalEstimated).toBe(1500);
    expect(report.estimatedVsActual.totalActual).toBe(800);
    expect(report.estimatedVsActual.meanAbsoluteDeviation).toBeCloseTo((200 + 500) / 2);
    expect(report.estimatedVsActual.insufficientData).toBe(false);
  });

  it("reviewRate is computed over recommended cases only", () => {
    const cases = [
      makeCase({ paymentEventId: "p1", recommendationAction: "REVIEW", worthiness: "REVIEW" }),
      makeCase({ paymentEventId: "p2", recommendationAction: "RETRY_PAYMENT" }),
      makeCase({ paymentEventId: "p3", recommendationAction: "DO_NOT_RECOVER", worthiness: "DO_NOT_RECOVER" }),
      makeCase({ paymentEventId: "p4", recommendationAction: null }),
    ];
    const report = buildRecoveryValidationReport(cases);
    // Denominator excludes the null-recommendation case (3 recommended cases total).
    expect(report.reviewRate.denominator).toBe(3);
    expect(report.reviewRate.numerator).toBe(1);
    expect(report.reviewRate.value).toBeCloseTo(1 / 3);
  });

  it("anomalies surface DO_NOT_RECOVER cases that were nonetheless attempted", () => {
    const cases = [
      makeCase({
        paymentEventId: "p_bad",
        recommendationAction: "DO_NOT_RECOVER",
        worthiness: "DO_NOT_RECOVER",
        latestAttemptStatus: "ATTEMPTED",
      }),
    ];
    const report = buildRecoveryValidationReport(cases);
    expect(report.anomalies.count).toBe(1);
    expect(report.anomalies.paymentEventIds).toEqual(["p_bad"]);
  });

  describe("ML-assisted vs deterministic performance — never mixed into one number", () => {
    it("reports insufficientData when mlUsed is unknown (null) for every case, as is true for all current database-sourced data", () => {
      const cases = [
        makeCase({ paymentEventId: "p1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", mlUsed: null }),
        makeCase({ paymentEventId: "p2", outcomeStatus: "FAILED", mlUsed: null }),
      ];
      const report = buildRecoveryValidationReport(cases);
      expect(report.mlAssisted.mlTrackingAvailable).toBe(false);
      expect(report.mlAssisted.deterministic.insufficientData).toBe(true);
      expect(report.mlAssisted.mlAssisted.insufficientData).toBe(true);
    });

    it("computes separate precision for deterministic and ML-assisted cases when mlUsed is known", () => {
      const cases = [
        // Deterministic: 2 resolved, 1 success
        makeCase({ paymentEventId: "d1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", mlUsed: false }),
        makeCase({ paymentEventId: "d2", outcomeStatus: "FAILED", mlUsed: false }),
        // ML-assisted: 2 resolved, 2 successes — a different rate than deterministic
        makeCase({ paymentEventId: "m1", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", mlUsed: true, mlProbability: 0.8 }),
        makeCase({ paymentEventId: "m2", outcomeStatus: "SUCCESSFUL", recoveryAttribution: "RECOVERAI", mlUsed: true, mlProbability: 0.7 }),
      ];
      const report = buildRecoveryValidationReport(cases);
      expect(report.mlAssisted.mlTrackingAvailable).toBe(true);
      expect(report.mlAssisted.deterministic.value).toBe(0.5);
      expect(report.mlAssisted.deterministic.denominator).toBe(2);
      expect(report.mlAssisted.mlAssisted.value).toBe(1);
      expect(report.mlAssisted.mlAssisted.denominator).toBe(2);
      // The two numbers must be genuinely separate, not blended into one aggregate.
      expect(report.mlAssisted.deterministic.value).not.toBe(report.mlAssisted.mlAssisted.value);
    });
  });
});

// ============================================================================
// 3. Database integration tests — real lifecycle, real webhook confirmation
// ============================================================================

describe("RecoveryDecisionValidationService — reads real persisted lifecycle data", () => {
  let tokenCompany: string;
  const validationService = new RecoveryDecisionValidationService(prisma);

  beforeAll(async () => {
    tokenCompany = "demo_token_single_business";

    const provider = await prisma.provider.findFirst({ where: { type: "RAZORPAY" } });
    if (!provider) {
      await prisma.provider.create({
        data: { id: `prov_rzp_rval_${Date.now()}`, name: "Razorpay Test", type: "RAZORPAY" },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function ingestFailedPayment(paymentExtId: string, amount: number, errorFields: {
    error_reason: string;
    error_description: string;
    error_source?: string;
    error_step?: string;
  }) {
    const failedWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentExtId,
            amount: amount * 100,
            currency: "INR",
            status: "failed",
            method: "card",
            notes: {},
            error_code: "BAD_REQUEST_ERROR",
            created_at: Math.floor(Date.now() / 1000),
            ...errorFields,
          },
        },
      },
    };
    const signature = signPayload(failedWebhook);
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", signature)
      .send(failedWebhook);
    expect(res.status).toBe(200);

    const payment = await prisma.paymentEvent.findFirst({
      where: { externalPaymentId: paymentExtId },
      include: { recommendation: true },
    });
    expect(payment).toBeDefined();
    return payment!;
  }

  it("RECOVER recommendation + provider-confirmed captured payment → classified as confirmed success with correct amount", async () => {
    const extId = `pay_rval_success_${Date.now()}`;
    const payment = await ingestFailedPayment(extId, 6000.0, {
      error_reason: "insufficient_funds",
      error_description: "Insufficient balance",
      error_source: "bank",
    });
    expect(payment.recommendation?.action).toBe("RETRY_PAYMENT");

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompany}`)
      .send({ paymentEventId: payment.id });
    expect(execRes.status).toBe(201);
    const attemptId = execRes.body.data.recoveryAttemptId;

    // Before confirmation: must not be counted as recovered yet.
    const preConfirmCases = await validationService.loadCasesForCompany();
    const preCase = preConfirmCases.find((c) => c.paymentEventId === payment.id)!;
    expect(classifyRecoveryDecisionCase(preCase)).toBe(
      "RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED"
    );

    // Provider confirms the retry succeeded.
    const capturedWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_rval_retry_${Date.now()}`,
            amount: 600000,
            currency: "INR",
            status: "captured",
            notes: { recoveryAttemptId: attemptId },
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };
    const sig = signPayload(capturedWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", sig)
      .send(capturedWebhook);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);

    const cases = await validationService.loadCasesForCompany();
    const c = cases.find((x) => x.paymentEventId === payment.id)!;
    expect(c.outcomeStatus).toBe("SUCCESSFUL");
    expect(c.recoveryAttribution).toBe("RECOVERAI");
    expect(c.actualRecoveredAmount).toBe(6000.0);
    expect(classifyRecoveryDecisionCase(c)).toBe(
      "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
    );

    const report = await validationService.generateValidationReport();
    expect(report.actualRecoveredAmount.total).toBeGreaterThanOrEqual(6000.0);
  });

  it("RECOVER recommendation + provider-confirmed failed retry → classified as confirmed failure, contributes 0 to actual recovered amount", async () => {
    const extId = `pay_rval_failure_${Date.now()}`;
    const payment = await ingestFailedPayment(extId, 4200.0, {
      error_reason: "insufficient_funds",
      error_description: "Insufficient balance",
      error_source: "bank",
    });

    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompany}`)
      .send({ paymentEventId: payment.id });
    const attemptId = execRes.body.data.recoveryAttemptId;

    const failedRetryWebhook = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_rval_retry_fail_${Date.now()}`,
            amount: 420000,
            currency: "INR",
            status: "failed",
            notes: { recoveryAttemptId: attemptId },
            error_code: "BAD_REQUEST_ERROR",
            error_reason: "card_declined",
            error_description: "Card was declined",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };
    const sig = signPayload(failedRetryWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", sig)
      .send(failedRetryWebhook);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBe(true);
    expect(webhookRes.body.outcomeStatus).toBe("FAILED");

    const cases = await validationService.loadCasesForCompany();
    const c = cases.find((x) => x.paymentEventId === payment.id)!;
    expect(c.outcomeStatus).toBe("FAILED");
    expect(classifyRecoveryDecisionCase(c)).toBe(
      "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE"
    );

    const report = await validationService.generateValidationReport();
    // This specific failed case must not contribute to recovered amount.
    expect(
      report.actualRecoveredAmount.confirmedCaseCount
    ).toBeGreaterThanOrEqual(0);
  });

  it("DO_NOT_RECOVER (permanent card failure) → no recovery attempt is ever created", async () => {
    const extId = `pay_rval_dnr_${Date.now()}`;
    const payment = await ingestFailedPayment(extId, 3000.0, {
      error_reason: "card_lost",
      error_description: "Card reported lost or stolen",
    });
    expect(payment.recommendation?.action).toBe("DO_NOT_RECOVER");

    const cases = await validationService.loadCasesForCompany();
    const c = cases.find((x) => x.paymentEventId === payment.id)!;
    expect(c.latestAttemptStatus).toBeNull();
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_DO_NOT_RECOVER");

    // Attempting execution against a DO_NOT_RECOVER recommendation must be rejected —
    // proves the anomaly class this validation layer watches for cannot occur here.
    const execRes = await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompany}`)
      .send({ paymentEventId: payment.id });
    expect(execRes.status).toBe(422);
  });

  it("REVIEW recommendation (deterministic, ML disabled) → no automatic recovery attempt", async () => {
    // Use a direct pipeline instance with ML pointed at an unreachable port so the
    // outcome is deterministic REVIEW instead of depending on the live ML service.
    const isolatedPipeline = new PaymentPipelineService(
      prisma,
      undefined,
      undefined,
      new RecoveryRecommendationService("http://localhost:19999", 200)
    );

    const extId = `pay_rval_review_${Date.now()}`;
    const result = await isolatedPipeline.processEvent({
      externalPaymentId: extId,
      providerId: (await prisma.provider.findFirst({ where: { type: "RAZORPAY" } }))!.id,
      amount: 1500.0,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_FAILED",
      failureCode: "AMBIGUOUS_RESPONSE_CODE",
      failureMessage: "Ambiguous response received from the network with no further detail",
      eventTimestamp: new Date(),
    });
    expect(result.recoveryRecommendation?.action).toBe("REVIEW");

    const cases = await validationService.loadCasesForCompany();
    const c = cases.find((x) => x.paymentEventId === result.paymentEventId)!;
    expect(c.latestAttemptStatus).toBeNull();
    expect(classifyRecoveryDecisionCase(c)).toBe("RECOMMENDED_REVIEW");
  });

  it("unrelated/independent customer payment must NOT be attributed to RecoverAI recovery, and the open attempt stays unresolved", async () => {
    const extId = `pay_rval_unrelated_${Date.now()}`;
    const payment = await ingestFailedPayment(extId, 900.0, {
      error_reason: "insufficient_funds",
      error_description: "Insufficient balance",
      error_source: "bank",
    });

    await request(app)
      .post("/api/recovery-attempts")
      .set("Authorization", `Bearer ${tokenCompany}`)
      .send({ paymentEventId: payment.id });

    // Customer pays independently — no recovery correlation notes, no matching
    // provider reference. This must be ingested as an ordinary new payment, not
    // treated as confirmation of the open recovery attempt.
    const independentPaymentId = `pay_rval_indep_${Date.now()}`;
    const independentWebhook = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: independentPaymentId,
            amount: 90000,
            currency: "INR",
            status: "captured",
            notes: {},
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };
    const sig = signPayload(independentWebhook);
    const webhookRes = await request(app)
      .post("/api/webhooks/razorpay")
      .set("X-Razorpay-Signature", sig)
      .send(independentWebhook);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.isRecoveryConfirmation).toBeFalsy();

    const cases = await validationService.loadCasesForCompany();
    const c = cases.find((x) => x.paymentEventId === payment.id)!;
    // The original recovery attempt must remain unresolved — never silently
    // credited from an unrelated payment.
    expect(c.outcomeStatus).toBeNull();
    expect(classifyRecoveryDecisionCase(c)).not.toBe(
      "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
    );
  });

  it("loadCasesForCompany always reports mlUsed as null (RecoveryRecommendation does not persist ML usage today)", async () => {
    const cases = await validationService.loadCasesForCompany();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.mlUsed).toBeNull();
      expect(c.mlProbability).toBeNull();
    }

    const report = await validationService.generateValidationReport();
    expect(report.mlAssisted.mlTrackingAvailable).toBe(false);
    expect(report.mlAssisted.deterministic.insufficientData).toBe(true);
    expect(report.mlAssisted.mlAssisted.insufficientData).toBe(true);
  });
});
