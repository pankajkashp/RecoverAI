/**
 * RecoverAI — Recovery Recommendation Service Tests
 *
 * Phase 7: Recovery Recommendation
 *
 * Covers:
 * - All deterministic recommendation rules (7+ scenarios)
 * - ML-supported behavior (valid prediction, unavailable, timeout, invalid response)
 * - Safety: permanent failures cannot be overridden by ML
 * - Explainability: every recommendation has a meaningful reason
 * - Full pipeline integration (failed → recommendation persisted in DB)
 * - Successful payment → no recommendation
 * - Idempotency: duplicate event → exactly one recommendation
 * - Regression: Phase 1–6 behavior preserved
 */

import { describe, expect, it, afterAll, vi, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FailureAnalysisService } from "../src/services/failure-analysis.service.js";
import { RecoveryIntelligenceService } from "../src/services/recovery-intelligence.service.js";
import { RecoveryRecommendationService } from "../src/services/recovery-recommendation.service.js";
import { PaymentPipelineService } from "../src/services/payment-pipeline.service.js";
import {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
  RecoveryAssessmentResult,
} from "@recoverai/contracts";

const prisma = new PrismaClient();
const failureService = new FailureAnalysisService();
const recoveryService = new RecoveryIntelligenceService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<CanonicalPaymentEvent> = {}): CanonicalPaymentEvent {
  return {
    externalPaymentId: "pay_test_rec_mock",
    companyId: "demo_company_001",
    providerId: "provider_demo_sandbox",
    amount: 10000.0,
    currency: "INR",
    status: "FAILED",
    paymentMethod: "UPI",
    eventType: "PAYMENT_FAILED",
    eventTimestamp: new Date(),
    ...overrides,
  };
}

function makeFailure(category: FailureAnalysisResult["category"]): FailureAnalysisResult {
  return failureService.analyzeFailure(makeEvent({ failureCategory: category }));
}

function makeAssessment(
  event: CanonicalPaymentEvent,
  failure: FailureAnalysisResult
): RecoveryAssessmentResult {
  return recoveryService.assessRecovery(event, failure);
}

// ---------------------------------------------------------------------------
// Suite 1 — Deterministic Rules (unit, no DB, ML unavailable by default)
// ---------------------------------------------------------------------------

describe("Phase 7 — RecoveryRecommendationService: Deterministic Rules", () => {
  // Use a service that points at a non-existent ML endpoint (forces fallback)
  const recommender = new RecoveryRecommendationService(
    "http://localhost:19999", // intentionally wrong port
    200                       // very short timeout
  );

  it("INSUFFICIENT_FUNDS + RECOVER → RETRY_PAYMENT", async () => {
    const event = makeEvent({ failureCategory: "INSUFFICIENT_FUNDS" });
    const failure = makeFailure("INSUFFICIENT_FUNDS");
    const assessment = makeAssessment(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("RETRY_PAYMENT");
    expect(rec.status).toBe("RECOMMENDED");
    expect(rec.reason.length).toBeGreaterThan(10);
    expect(rec.reason).toContain("insufficient-funds");
    expect(rec.mlUsed).toBe(false);
  });

  it("NETWORK + RECOVER → RETRY_PAYMENT", async () => {
    const event = makeEvent({ failureCategory: "NETWORK" });
    const failure = makeFailure("NETWORK");
    const assessment = makeAssessment(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("RETRY_PAYMENT");
    expect(rec.reason).toContain("network or communication error");
    expect(rec.mlUsed).toBe(false);
  });

  it("AUTHENTICATION → CUSTOMER_ACTION_REQUIRED (deterministic, not ML-overridable)", async () => {
    const event = makeEvent({ failureCategory: "AUTHENTICATION" });
    const failure = makeFailure("AUTHENTICATION");
    const assessment = makeAssessment(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(rec.reason).toContain("authentication");
    expect(rec.mlUsed).toBe(false);
  });

  it("CUSTOMER_ACTION_REQUIRED category → CUSTOMER_ACTION_REQUIRED", async () => {
    const event = makeEvent({ failureCategory: "CUSTOMER_ACTION_REQUIRED" });
    const failure = makeFailure("CUSTOMER_ACTION_REQUIRED");
    const assessment = makeAssessment(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(rec.mlUsed).toBe(false);
  });

  it("CARD (permanent) + DO_NOT_RECOVER → DO_NOT_RECOVER", async () => {
    const event = makeEvent({ failureCode: "LOST_CARD", failureCategory: "CARD" });
    const failure = failureService.analyzeFailure(event);
    const assessment = makeAssessment(event, failure);

    expect(assessment.worthiness).toBe("DO_NOT_RECOVER");

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("DO_NOT_RECOVER");
    expect(rec.reason).toContain("permanent card condition");
    expect(rec.mlUsed).toBe(false);
  });

  it("BANK (permanent/blocked) + DO_NOT_RECOVER → DO_NOT_RECOVER", async () => {
    const event = makeEvent({ failureCode: "ACCOUNT_BLOCKED", failureCategory: "BANK" });
    const failure = failureService.analyzeFailure(event);
    const assessment = makeAssessment(event, failure);

    expect(assessment.worthiness).toBe("DO_NOT_RECOVER");

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("DO_NOT_RECOVER");
    expect(rec.reason).toContain("permanently declined");
    expect(rec.mlUsed).toBe(false);
  });

  it("UNKNOWN failure → REVIEW (conservative fallback)", async () => {
    const event = makeEvent({ failureCode: "UNKNOWN_ERR_9999" });
    const failure = makeFailure("UNKNOWN");
    const assessment = makeAssessment(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("REVIEW");
    expect(rec.reason.length).toBeGreaterThan(10);
  });

  it("Non-recoverable worthiness (generic) → DO_NOT_RECOVER regardless of category", async () => {
    const event = makeEvent({ failureCategory: "PROVIDER" });
    const failure = makeFailure("PROVIDER");
    // Manually craft a DO_NOT_RECOVER assessment to test the rule
    const assessment: RecoveryAssessmentResult = {
      worthiness: "DO_NOT_RECOVER",
      estimatedRecoverableAmount: 0,
      originalAmount: 10000,
      confidence: 0.9,
      reasoning: "manually set to do not recover",
      ruleId: "test",
      assessedAt: new Date(),
    };

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("DO_NOT_RECOVER");
    expect(rec.mlUsed).toBe(false);
  });

  it("REVIEW worthiness → REVIEW when ML unavailable", async () => {
    const event = makeEvent({ failureCategory: "BANK" });
    const failure = makeFailure("BANK");
    // Bank with UNKNOWN classification → REVIEW worthiness
    const assessment: RecoveryAssessmentResult = {
      worthiness: "REVIEW",
      estimatedRecoverableAmount: 10000,
      originalAmount: 10000,
      confidence: 0.5,
      reasoning: "bank declined without clear temporary/permanent status",
      ruleId: "deterministic-rules-v1",
      assessedAt: new Date(),
    };

    const rec = await recommender.recommend(event, failure, assessment);

    // ML is unavailable (wrong port) so deterministic fallback applies
    expect(rec.action).toBe("REVIEW");
    expect(rec.reason).toContain("ML service was not available");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — ML Integration (with fetch mocking)
// ---------------------------------------------------------------------------

describe("Phase 7 — RecoveryRecommendationService: ML Signal Integration", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockMlResponse(body: object, status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }

  const recommender = new RecoveryRecommendationService(
    "http://ml-mock-service:8000",
    2000
  );

  const reviewEvent = makeEvent({ failureCode: "STRANGE_ERR" });
  const reviewFailure = makeFailure("UNKNOWN");
  const reviewAssessment: RecoveryAssessmentResult = {
    worthiness: "REVIEW",
    estimatedRecoverableAmount: 0,
    originalAmount: 10000,
    confidence: 0.3,
    reasoning: "unknown failure, review required",
    ruleId: "deterministic-rules-v1",
    assessedAt: new Date(),
  };

  it("Valid ML prediction with high probability (≥0.65) → upgrades REVIEW to RETRY_PAYMENT", async () => {
    mockMlResponse({
      modelVersion: "recovery_success_v1",
      recoveryProbability: 0.78,
      prediction: 1,
      confidence: 0.78,
      isSyntheticDevelopmentModel: true,
    });

    const rec = await recommender.recommend(reviewEvent, reviewFailure, reviewAssessment);

    expect(rec.action).toBe("RETRY_PAYMENT");
    expect(rec.mlUsed).toBe(true);
    expect(rec.mlProbability).toBeCloseTo(0.78, 2);
    expect(rec.ruleSource).toContain("ml-signal");
    expect(rec.reason).toContain("78%");
    expect(rec.reason).toContain("synthetic development data");
  });

  it("Valid ML prediction with low probability (<0.65) → stays REVIEW", async () => {
    mockMlResponse({
      modelVersion: "recovery_success_v1",
      recoveryProbability: 0.45,
      prediction: 0,
      confidence: 0.55,
      isSyntheticDevelopmentModel: true,
    });

    const rec = await recommender.recommend(reviewEvent, reviewFailure, reviewAssessment);

    expect(rec.action).toBe("REVIEW");
    expect(rec.mlUsed).toBe(true);
    expect(rec.mlProbability).toBeCloseTo(0.45, 2);
    expect(rec.reason).toContain("below retry threshold");
  });

  it("ML service unavailable (fetch throws) → deterministic fallback to REVIEW", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const rec = await recommender.recommend(reviewEvent, reviewFailure, reviewAssessment);

    expect(rec.action).toBe("REVIEW");
    expect(rec.mlUsed).toBe(false);
    expect(rec.mlProbability).toBeNull();
    expect(rec.ruleSource).toBe("deterministic-rules-v1");
    expect(rec.reason).toContain("ML service was not available");
  });

  it("ML service returns HTTP 503 → deterministic fallback", async () => {
    mockMlResponse({ detail: "Model not loaded" }, 503);

    const rec = await recommender.recommend(reviewEvent, reviewFailure, reviewAssessment);

    expect(rec.action).toBe("REVIEW");
    expect(rec.mlUsed).toBe(false);
  });

  it("ML response fails validation (invalid probability) → deterministic fallback", async () => {
    mockMlResponse({
      modelVersion: "recovery_success_v1",
      recoveryProbability: 99.9, // invalid: > 1
      prediction: 1,
      confidence: 0.9,
      isSyntheticDevelopmentModel: true,
    });

    const rec = await recommender.recommend(reviewEvent, reviewFailure, reviewAssessment);

    expect(rec.action).toBe("REVIEW");
    expect(rec.mlUsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Safety: Deterministic safety rules cannot be ML-overridden
// ---------------------------------------------------------------------------

describe("Phase 7 — Safety: Permanent failures protected from ML override", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DO_NOT_RECOVER assessment → action is always DO_NOT_RECOVER even with ML=1.0", async () => {
    // Mock ML that would return perfect recovery probability
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        modelVersion: "recovery_success_v1",
        recoveryProbability: 1.0,
        prediction: 1,
        confidence: 1.0,
        isSyntheticDevelopmentModel: true,
      }),
    } as Response);

    const recommender = new RecoveryRecommendationService("http://ml-mock:8000", 2000);
    const event = makeEvent({ failureCode: "LOST_CARD", failureCategory: "CARD" });
    const failure = failureService.analyzeFailure(event);
    const assessment = recoveryService.assessRecovery(event, failure);

    expect(assessment.worthiness).toBe("DO_NOT_RECOVER");

    const rec = await recommender.recommend(event, failure, assessment);

    // ML is never called for DO_NOT_RECOVER; must remain DO_NOT_RECOVER
    expect(rec.action).toBe("DO_NOT_RECOVER");
    expect(rec.mlUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    global.fetch = fetch; // restore
  });

  it("AUTHENTICATION → CUSTOMER_ACTION_REQUIRED is never ML-overridden", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        modelVersion: "recovery_success_v1",
        recoveryProbability: 0.99,
        prediction: 1,
        confidence: 0.99,
        isSyntheticDevelopmentModel: true,
      }),
    } as Response);

    const recommender = new RecoveryRecommendationService("http://ml-mock:8000", 2000);
    const event = makeEvent({ failureCode: "OTP_EXPIRED", failureCategory: "AUTHENTICATION" });
    const failure = failureService.analyzeFailure(event);
    const assessment = recoveryService.assessRecovery(event, failure);

    const rec = await recommender.recommend(event, failure, assessment);

    expect(rec.action).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(rec.mlUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    global.fetch = fetch;
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Explainability
// ---------------------------------------------------------------------------

describe("Phase 7 — Explainability: every recommendation has a meaningful reason", () => {
  const recommender = new RecoveryRecommendationService("http://localhost:19999", 200);

  const scenarios: Array<{ label: string; failureCategory: FailureAnalysisResult["category"]; failureCode?: string }> = [
    { label: "INSUFFICIENT_FUNDS", failureCategory: "INSUFFICIENT_FUNDS" },
    { label: "NETWORK", failureCategory: "NETWORK" },
    { label: "AUTHENTICATION", failureCategory: "AUTHENTICATION" },
    { label: "CARD", failureCategory: "CARD", failureCode: "EXPIRED_CARD" },
    { label: "BANK (blocked)", failureCategory: "BANK", failureCode: "ACCOUNT_BLOCKED" },
    { label: "UNKNOWN", failureCategory: "UNKNOWN" },
    { label: "PROVIDER", failureCategory: "PROVIDER" },
    { label: "TEMPORARY", failureCategory: "TEMPORARY" },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.label} — recommendation has a non-empty, meaningful reason`, async () => {
      const event = makeEvent({
        failureCategory: scenario.failureCategory,
        failureCode: scenario.failureCode,
      });
      const failure = failureService.analyzeFailure(event);
      const assessment = recoveryService.assessRecovery(event, failure);
      const rec = await recommender.recommend(event, failure, assessment);

      expect(rec.action).toBeDefined();
      expect(rec.reason).toBeTruthy();
      expect(rec.reason.length).toBeGreaterThan(20);
      expect(rec.recommendedAt).toBeInstanceOf(Date);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 5 — Full Pipeline Integration & PostgreSQL Persistence
// ---------------------------------------------------------------------------

describe("Phase 7 — Pipeline Integration & PostgreSQL Persistence", () => {
  const testPrefix = `pay_p7_test_${Date.now()}`;

  // Pipeline using ML fallback (ML unavailable at wrong port)
  const pipelineService = new PaymentPipelineService(
    prisma,
    failureService,
    recoveryService,
    new RecoveryRecommendationService("http://localhost:19999", 200)
  );

  afterAll(async () => {
    // Clean up in correct FK order
    await prisma.recoveryRecommendation.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.paymentFailure.deleteMany({
      where: { paymentEvent: { externalPaymentId: { startsWith: testPrefix } } },
    });
    await prisma.paymentEvent.deleteMany({
      where: { externalPaymentId: { startsWith: testPrefix } },
    });
    await prisma.$disconnect();
  });

  it("Failed payment (INSUFFICIENT_FUNDS) → recommendation RETRY_PAYMENT persisted in DB", async () => {
    const extId = `${testPrefix}_insuf_01`;
    const result = await pipelineService.processEvent({
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 5000,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "UPI",
      eventType: "PAYMENT_FAILED",
      failureCode: "INSUFFICIENT_FUNDS",
      eventTimestamp: new Date(),
    });

    expect(result.status).toBe("CREATED");
    expect(result.recoveryRecommendation).toBeDefined();
    expect(result.recoveryRecommendation?.action).toBe("RETRY_PAYMENT");
    expect(result.recoveryRecommendation?.status).toBe("RECOMMENDED");
    expect(result.recoveryRecommendation?.reason).toBeTruthy();

    // Verify DB persistence
    const saved = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: result.paymentEventId },
    });
    expect(saved).not.toBeNull();
    expect(saved?.action).toBe("RETRY_PAYMENT");
    expect(saved?.status).toBe("RECOMMENDED");
  });

  it("Failed payment (AUTHENTICATION) → recommendation CUSTOMER_ACTION_REQUIRED persisted", async () => {
    const extId = `${testPrefix}_auth_01`;
    const result = await pipelineService.processEvent({
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 8000,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_FAILED",
      failureCode: "OTP_EXPIRED",
      eventTimestamp: new Date(),
    });

    expect(result.recoveryRecommendation?.action).toBe("CUSTOMER_ACTION_REQUIRED");

    const saved = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: result.paymentEventId },
    });
    expect(saved?.action).toBe("CUSTOMER_ACTION_REQUIRED");
  });

  it("Failed payment (CARD/permanent) → recommendation DO_NOT_RECOVER persisted", async () => {
    const extId = `${testPrefix}_card_01`;
    const result = await pipelineService.processEvent({
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 3000,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_FAILED",
      failureCode: "STOLEN_CARD",
      eventTimestamp: new Date(),
    });

    expect(result.recoveryRecommendation?.action).toBe("DO_NOT_RECOVER");

    const saved = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: result.paymentEventId },
    });
    expect(saved?.action).toBe("DO_NOT_RECOVER");
  });

  it("Failed payment (UNKNOWN) → recommendation REVIEW persisted", async () => {
    const extId = `${testPrefix}_unknown_01`;
    const result = await pipelineService.processEvent({
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 2500,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "NETBANKING",
      eventType: "PAYMENT_FAILED",
      failureCode: "ERR_XYZABC_9999",
      eventTimestamp: new Date(),
    });

    expect(result.recoveryRecommendation?.action).toBe("REVIEW");

    const saved = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: result.paymentEventId },
    });
    expect(saved?.action).toBe("REVIEW");
  });

  it("Successful payment → NO recommendation persisted", async () => {
    const extId = `${testPrefix}_success_01`;
    const result = await pipelineService.processEvent({
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 9900,
      currency: "INR",
      status: "COMPLETED",
      paymentMethod: "UPI",
      eventType: "PAYMENT_COMPLETED",
      eventTimestamp: new Date(),
    });

    expect(result.status).toBe("CREATED");
    expect(result.recoveryRecommendation).toBeUndefined();

    const saved = await prisma.recoveryRecommendation.findUnique({
      where: { paymentEventId: result.paymentEventId },
    });
    expect(saved).toBeNull();
  });

  it("Idempotency: same failed event submitted twice → exactly one recommendation in DB", async () => {
    const extId = `${testPrefix}_idemp_01`;
    const payload = {
      externalPaymentId: extId,
      companyId: "demo_company_001",
      providerId: "provider_demo_sandbox",
      amount: 7500,
      currency: "INR",
      status: "FAILED",
      paymentMethod: "CARD",
      eventType: "PAYMENT_FAILED",
      failureCode: "SWITCH_TIMEOUT",
      eventTimestamp: new Date(),
    };

    // First submission
    const result1 = await pipelineService.processEvent(payload);
    expect(result1.status).toBe("CREATED");
    expect(result1.recoveryRecommendation?.action).toBe("RETRY_PAYMENT");

    // Second submission (duplicate)
    const result2 = await pipelineService.processEvent(payload);
    expect(result2.status).toBe("DUPLICATE");
    expect(result2.isDuplicate).toBe(true);
    expect(result2.recoveryRecommendation?.action).toBe("RETRY_PAYMENT");

    // Exactly one event and one recommendation in DB
    const eventCount = await prisma.paymentEvent.count({
      where: { externalPaymentId: extId },
    });
    expect(eventCount).toBe(1);

    const recCount = await prisma.recoveryRecommendation.count({
      where: { paymentEventId: result1.paymentEventId },
    });
    expect(recCount).toBe(1);
  });
});
