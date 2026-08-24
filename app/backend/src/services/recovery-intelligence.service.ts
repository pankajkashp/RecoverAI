/**
 * RecoverAI — Recovery Intelligence Service
 *
 * Phase 5: Recovery Intelligence
 *
 * Deterministic recovery intelligence engine responsible for:
 * 1. Determining recovery worthiness (RECOVER | DO_NOT_RECOVER | REVIEW).
 * 2. Estimating potentially recoverable amount.
 * 3. Providing transparent, explainable reasoning for recovery decisions.
 *
 * Consumes the structured FailureAnalysisResult from Phase 4.
 * Strictly deterministic rule-based logic. No ML models or AI APIs.
 */

import {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
  RecoveryAssessmentResult,
  RecoveryAssessmentResultSchema,
  RecoveryWorthiness,
} from "@recoverai/contracts";

export class RecoveryIntelligenceService {
  /**
   * Assesses recovery worthiness, estimates recoverable amount,
   * and generates explainable reasoning for a failed payment event.
   */
  public assessRecovery(
    event: CanonicalPaymentEvent,
    failureAnalysis: FailureAnalysisResult
  ): RecoveryAssessmentResult {
    const originalAmount = event.amount;
    const category = failureAnalysis.category;
    const classification = failureAnalysis.classification;

    let worthiness: RecoveryWorthiness = "REVIEW";
    let estimatedRecoverableAmount = 0;
    let confidence: number | null = 0.5;
    let reasoning = "";

    switch (category) {
      case "INSUFFICIENT_FUNDS":
        worthiness = "RECOVER";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.85;
        reasoning =
          "The payment failed due to a potentially temporary insufficient-funds condition. Full recovery is estimated via timed retry or customer reminder.";
        break;

      case "NETWORK":
        worthiness = "RECOVER";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.9;
        reasoning =
          "The payment failed due to a transient network or communication error. Full recovery is estimated upon automatic retry.";
        break;

      case "PROVIDER":
        worthiness = "RECOVER";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.85;
        reasoning =
          "The failure was caused by a temporary provider-side outage or gateway error. Recovery is estimated once provider connectivity resumes.";
        break;

      case "TEMPORARY":
        worthiness = "RECOVER";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.85;
        reasoning =
          "The payment encountered a transient error. Full recovery is estimated upon scheduled retry.";
        break;

      case "AUTHENTICATION":
        worthiness = "REVIEW";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.6;
        reasoning =
          "The payment failed customer authentication (OTP/3D Secure). Recovery requires review or customer checkout re-engagement.";
        break;

      case "CUSTOMER_ACTION_REQUIRED":
        worthiness = "REVIEW";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.6;
        reasoning =
          "Customer intervention is required (e.g. e-mandate approval or updated payment credentials) before recovery can be attempted.";
        break;

      case "CARD":
        worthiness = "DO_NOT_RECOVER";
        estimatedRecoverableAmount = 0;
        confidence = 0.95;
        reasoning =
          "The failure indicates an invalidated, expired, lost, or stolen card. Automated recovery on this payment method is not recommended.";
        break;

      case "BANK":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.8;
          reasoning =
            "The customer's bank was temporarily unavailable or switch timed out. Recovery is estimated upon bank service availability.";
        } else if (classification === "PERMANENT") {
          worthiness = "DO_NOT_RECOVER";
          estimatedRecoverableAmount = 0;
          confidence = 0.9;
          reasoning =
            "The bank permanently declined the transaction (account blocked or restricted). Recovery is not recommended.";
        } else {
          worthiness = "REVIEW";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.5;
          reasoning =
            "The issuer declined the transaction without definitive temporary/permanent status. Manual review is recommended.";
        }
        break;

      case "UNKNOWN":
      default:
        worthiness = "REVIEW";
        estimatedRecoverableAmount = 0;
        confidence = 0.3;
        reasoning =
          "The payment failure reason is unclassified or unrecognized. Automated recovery is deferred pending operational review.";
        break;
    }

    return RecoveryAssessmentResultSchema.parse({
      worthiness,
      estimatedRecoverableAmount,
      originalAmount,
      confidence,
      reasoning,
      ruleId: "deterministic-rules-v1",
      assessedAt: new Date(),
    });
  }
}
