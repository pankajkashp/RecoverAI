/**
 * RecoverAI — Hardened Failure Analysis: Evidence-Based Classification
 *
 * Verifies that failure classification is driven by concrete provider evidence
 * (failure code, reason, message, source, step, acquirer response code) rather
 * than broad category assumptions, and that this correctness propagates safely
 * through RecoveryIntelligenceService and RecoveryRecommendationService.
 *
 * No database dependency: these are pure unit tests against the deterministic
 * services (ML is forced unavailable via an unreachable port so recommendation
 * behavior stays fully deterministic).
 */

import { describe, expect, it } from "vitest";
import { FailureAnalysisService } from "../src/services/failure-analysis.service.js";
import { RecoveryIntelligenceService } from "../src/services/recovery-intelligence.service.js";
import { RecoveryRecommendationService } from "../src/services/recovery-recommendation.service.js";
import { CanonicalPaymentEvent } from "@recoverai/contracts";

const failureService = new FailureAnalysisService();
const recoveryService = new RecoveryIntelligenceService();
// Unreachable port + very short timeout forces the ML fallback path deterministically.
const recommender = new RecoveryRecommendationService("http://localhost:19999", 200);

function baseEvent(overrides: Partial<CanonicalPaymentEvent> = {}): CanonicalPaymentEvent {
  return {
    externalPaymentId: "pay_hardening_test",
    orderReference: null,
    merchantTransactionReference: null,
    companyId: "demo_company_001",
    providerId: "provider_demo_sandbox",
    customerReference: null,
    amount: 5000,
    currency: "INR",
    status: "FAILED",
    paymentMethod: "CARD",
    eventType: "PAYMENT_FAILED",
    eventTimestamp: new Date(),
    metadata: {},
    ...overrides,
  };
}

describe("Hardened Failure Analysis — Evidence-Based Classification", () => {
  describe("RECOVERABLE / TEMPORARY", () => {
    it("classifies insufficient funds as TEMPORARY", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "INSUFFICIENT_FUNDS",
          failureMessage: "Payment declined due to insufficient funds in the account",
        })
      );

      expect(result.category).toBe("INSUFFICIENT_FUNDS");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.originalFailureCode).toBe("INSUFFICIENT_FUNDS");
      expect(result.originalFailureMessage).toBe(
        "Payment declined due to insufficient funds in the account"
      );
    });

    it("classifies a bank timeout as TEMPORARY", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "BANK_TIMEOUT",
          failureMessage: "The customer's bank experienced a timeout while processing",
        })
      );

      expect(result.category).toBe("BANK");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      expect(result.originalFailureCode).toBe("BANK_TIMEOUT");
    });

    it("classifies bank unavailable/offline as TEMPORARY", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "BANK_UNAVAILABLE",
          failureMessage: "The customer's bank was temporarily unavailable",
        })
      );

      expect(result.category).toBe("BANK");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
    });

    it("classifies a network timeout as TEMPORARY", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "NETWORK_TIMEOUT",
          failureMessage: "A network timeout occurred while contacting the payment switch",
        })
      );

      expect(result.category).toBe("NETWORK");
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
    });

    it("classifies a provider temporary outage as TEMPORARY", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "PROVIDER_OUTAGE",
          failureMessage: "The payment provider is experiencing a temporary outage",
        })
      );

      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
      // Not UNKNOWN: the explicit "temporary" evidence must not be discarded.
      expect(result.category).not.toBe("UNKNOWN");
    });
  });

  describe("PERMANENT / NOT AUTOMATICALLY RECOVERABLE", () => {
    it("classifies an expired card as PERMANENT", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "EXPIRED_CARD",
          failureMessage: "The card has expired and cannot be charged",
        })
      );

      expect(result.category).toBe("CARD");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
      expect(result.originalFailureCode).toBe("EXPIRED_CARD");
    });

    it("classifies an invalid card as PERMANENT", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "INVALID_CARD",
          failureMessage: "The card number provided is invalid",
        })
      );

      expect(result.category).toBe("CARD");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
    });

    it("classifies a lost/stolen card as PERMANENT", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "STOLEN_CARD",
          failureMessage: "This card has been reported lost or stolen by the cardholder",
        })
      );

      expect(result.category).toBe("CARD");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
    });

    it("classifies a permanently blocked card as PERMANENT", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "CARD_BLOCKED",
          failureMessage: "This card has been permanently blocked by the issuing bank",
        })
      );

      expect(result.category).toBe("CARD");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
    });

    it("classifies a closed bank account as PERMANENT", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "ACCOUNT_CLOSED",
          failureMessage: "The customer's bank account has been permanently closed",
        })
      );

      expect(result.category).toBe("BANK");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
      expect(result.originalFailureCode).toBe("ACCOUNT_CLOSED");
    });

    it("does not let a specific permanent signal be softened by a broad TEMPORARY-leaning category", () => {
      // BANK is a category that can resolve to either TEMPORARY or PERMANENT —
      // explicit "account blocked" evidence must win over any broad default.
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "ACCOUNT_PERMANENTLY_BLOCKED",
          failureMessage: "The account is permanently blocked and cannot receive further debits",
        })
      );

      expect(result.category).toBe("BANK");
      expect(result.classification).toBe("PERMANENT");
      expect(result.isTemporary).toBe(false);
    });
  });

  describe("CUSTOMER ACTION REQUIRED", () => {
    it("classifies OTP/3DS authentication-required failures for customer intervention", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "AUTHENTICATION_REQUIRED",
          failureMessage: "Customer must complete OTP authentication before the payment can proceed",
        })
      );

      expect(result.category).toBe("AUTHENTICATION");
      // Not permanently failed — pending customer action.
      expect(result.classification).toBe("TEMPORARY");
      expect(result.isTemporary).toBe(true);
    });
  });

  describe("UNKNOWN / AMBIGUOUS — do not guess", () => {
    it("classifies a vague 'unknown provider error' as UNKNOWN rather than PROVIDER", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "UNKNOWN_PROVIDER_ERROR",
          failureMessage: "Unknown provider error occurred",
        })
      );

      expect(result.category).toBe("UNKNOWN");
      expect(result.classification).toBe("UNKNOWN");
      expect(result.isTemporary).toBeNull();
    });

    it("classifies an ambiguous bank/card response as UNKNOWN", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: "RESP_UNRECOGNIZED",
          failureMessage:
            "The bank returned an unrecognized response code that could not be classified",
        })
      );

      expect(result.category).toBe("UNKNOWN");
      expect(result.classification).toBe("UNKNOWN");
      expect(result.isTemporary).toBeNull();
    });

    it("classifies missing failure information as UNKNOWN", () => {
      const result = failureService.analyzeFailure(
        baseEvent({
          failureCode: undefined,
          failureMessage: undefined,
          metadata: undefined,
        })
      );

      expect(result.category).toBe("UNKNOWN");
      expect(result.classification).toBe("UNKNOWN");
      expect(result.isTemporary).toBeNull();
      expect(result.originalFailureCode).toBeNull();
      expect(result.originalFailureMessage).toBeNull();
    });
  });
});

describe("Hardened Failure Analysis — Downstream Recovery Decision Safety", () => {
  it("a permanent failure cannot become RECOVER merely because its category is broad (BANK)", () => {
    const event = baseEvent({
      failureCode: "ACCOUNT_CLOSED",
      failureMessage: "The customer's bank account has been permanently closed",
    });
    const failure = failureService.analyzeFailure(event);
    expect(failure.category).toBe("BANK"); // BANK can normally resolve to RECOVER
    expect(failure.classification).toBe("PERMANENT");

    const assessment = recoveryService.assessRecovery(event, failure);

    expect(assessment.worthiness).toBe("DO_NOT_RECOVER");
    expect(assessment.estimatedRecoverableAmount).toBe(0);
  });

  it("an ambiguous/UNKNOWN failure becomes REVIEW downstream (assessment and recommendation)", async () => {
    const event = baseEvent({
      failureCode: "UNKNOWN_PROVIDER_ERROR",
      failureMessage: "Unknown provider error occurred",
    });
    const failure = failureService.analyzeFailure(event);
    expect(failure.category).toBe("UNKNOWN");
    expect(failure.classification).toBe("UNKNOWN");

    const assessment = recoveryService.assessRecovery(event, failure);
    expect(assessment.worthiness).toBe("REVIEW");

    const recommendation = await recommender.recommend(event, failure, assessment);
    expect(recommendation.action).toBe("REVIEW");
  });

  it("a temporary failure can reach RECOVER downstream (assessment and recommendation)", async () => {
    const event = baseEvent({
      failureCode: "BANK_TIMEOUT",
      failureMessage: "The customer's bank experienced a timeout while processing",
    });
    const failure = failureService.analyzeFailure(event);
    expect(failure.category).toBe("BANK");
    expect(failure.classification).toBe("TEMPORARY");

    const assessment = recoveryService.assessRecovery(event, failure);
    expect(assessment.worthiness).toBe("RECOVER");

    const recommendation = await recommender.recommend(event, failure, assessment);
    expect(recommendation.action).toBe("RETRY_PAYMENT");
  });

  it("customer-action failures (OTP/3DS) reach CUSTOMER_ACTION_REQUIRED, never a blind retry", async () => {
    const event = baseEvent({
      failureCode: "AUTHENTICATION_REQUIRED",
      failureMessage: "Customer must complete OTP authentication before the payment can proceed",
    });
    const failure = failureService.analyzeFailure(event);
    expect(failure.category).toBe("AUTHENTICATION");

    const assessment = recoveryService.assessRecovery(event, failure);
    const recommendation = await recommender.recommend(event, failure, assessment);

    expect(recommendation.action).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(recommendation.mlUsed).toBe(false);
  });
});
