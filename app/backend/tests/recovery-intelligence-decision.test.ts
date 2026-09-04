/**
 * RecoverAI — Recovery Intelligence Decision Matrix Tests
 *
 * The recovery decision must be explainable and safety-first:
 * - PERMANENT failures never enter automatic recovery.
 * - Known TEMPORARY failures may be recovered when the category supports retry.
 * - UNKNOWN classification stays REVIEW.
 * - Authentication/customer-action failures require customer intervention.
 * - The ML layer is not involved in this safety assessment.
 */

import { describe, expect, it } from "vitest";
import { RecoveryIntelligenceService } from "../src/services/recovery-intelligence.service.js";
import type {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
} from "@recoverai/contracts";

const service = new RecoveryIntelligenceService();

function event(amount = 5000): CanonicalPaymentEvent {
  return {
    externalPaymentId: "pay_test_recovery_decision",
    orderReference: null,
    merchantTransactionReference: null,
    companyId: "company_test",
    providerId: "provider_test",
    customerReference: null,
    amount,
    currency: "INR",
    status: "FAILED",
    paymentMethod: "CARD",
    eventType: "PAYMENT_FAILED",
    failureCode: "TEST_FAILURE",
    failureMessage: "Test payment failure",
    failureCategory: "UNKNOWN",
    eventTimestamp: new Date(),
    metadata: {},
  };
}

function analysis(
  category: FailureAnalysisResult["category"],
  classification: FailureAnalysisResult["classification"]
): FailureAnalysisResult {
  return {
    category,
    reason: `Test ${category} failure`,
    classification,
    isTemporary:
      classification === "TEMPORARY"
        ? true
        : classification === "PERMANENT"
          ? false
          : null,
    originalFailureCode: "TEST_FAILURE",
    originalFailureMessage: `Test ${category} failure`,
    metadata: { test: true },
  };
}

describe("Recovery Intelligence decision matrix", () => {
  it.each([
    ["INSUFFICIENT_FUNDS", "TEMPORARY", "RECOVER"],
    ["NETWORK", "TEMPORARY", "RECOVER"],
    ["PROVIDER", "TEMPORARY", "RECOVER"],
    ["BANK", "TEMPORARY", "RECOVER"],
    ["TEMPORARY", "TEMPORARY", "RECOVER"],
  ] as const)("%s + %s => %s", (category, classification, expected) => {
    const result = service.assessRecovery(
      event(),
      analysis(category, classification)
    );

    expect(result.worthiness).toBe(expected);
    expect(result.estimatedRecoverableAmount).toBe(5000);
    expect(result.ruleId).toBe("deterministic-rules-v1");
  });

  it.each([
    ["INSUFFICIENT_FUNDS", "PERMANENT"],
    ["NETWORK", "PERMANENT"],
    ["PROVIDER", "PERMANENT"],
    ["BANK", "PERMANENT"],
    ["CARD", "PERMANENT"],
  ] as const)("%s + %s => DO_NOT_RECOVER", (category, classification) => {
    const result = service.assessRecovery(
      event(),
      analysis(category, classification)
    );

    expect(result.worthiness).toBe("DO_NOT_RECOVER");
    expect(result.estimatedRecoverableAmount).toBe(0);
    expect(result.confidence).toBe(0.95);
    expect(result.reasoning.toLowerCase()).toContain("permanent");
  });

  it.each([
    ["INSUFFICIENT_FUNDS", "UNKNOWN"],
    ["NETWORK", "UNKNOWN"],
    ["PROVIDER", "UNKNOWN"],
    ["BANK", "UNKNOWN"],
    ["UNKNOWN", "UNKNOWN"],
  ] as const)("%s + %s => REVIEW", (category, classification) => {
    const result = service.assessRecovery(
      event(),
      analysis(category, classification)
    );

    expect(result.worthiness).toBe("REVIEW");
  });

  it.each([
    ["AUTHENTICATION"],
    ["CUSTOMER_ACTION_REQUIRED"],
  ] as const)("%s requires customer intervention", (category) => {
    const result = service.assessRecovery(
      event(),
      analysis(category, "TEMPORARY")
    );

    expect(result.worthiness).toBe("REVIEW");
    expect(result.reasoning.toLowerCase()).toMatch(/customer|authentication/);
  });

  it("does not automatically recover a TEMPORARY category when classification is uncertain", () => {
    const result = service.assessRecovery(
      event(7500),
      analysis("TEMPORARY", "UNKNOWN")
    );

    expect(result.worthiness).toBe("REVIEW");
    expect(result.estimatedRecoverableAmount).toBe(7500);
  });
});
