/**
 * RecoverAI — Recovery Intelligence Service
 *
 * Phase 5: Recovery Intelligence
 *
 * Deterministic engine for recovery worthiness, estimated recoverable amount,
 * and explainable reasoning. No ML is used here; ML is only a supporting signal
 * in Phase 7 after this safety assessment.
 */

import {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
  RecoveryAssessmentResult,
  RecoveryAssessmentResultSchema,
  RecoveryWorthiness,
} from "@recoverai/contracts";

export class RecoveryIntelligenceService {
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

    // PERMANENT is a hard safety boundary. A permanently classified failure
    // can never become an automatic recovery target in this phase, regardless
    // of how broad its category is.
    if (
      classification === "PERMANENT" &&
      category !== "AUTHENTICATION" &&
      category !== "CUSTOMER_ACTION_REQUIRED"
    ) {
      worthiness = "DO_NOT_RECOVER";
      estimatedRecoverableAmount = 0;
      confidence = 0.95;
      reasoning = this.permanentReasoning(category);

      return this.buildResult(
        worthiness,
        estimatedRecoverableAmount,
        originalAmount,
        confidence,
        reasoning
      );
    }

    switch (category) {
      case "INSUFFICIENT_FUNDS":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.85;
          reasoning =
            "The payment failed due to a potentially temporary insufficient-funds condition. Full recovery is estimated via timed retry or customer reminder.";
        } else {
          worthiness = "REVIEW";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.5;
          reasoning =
            "The payment indicates insufficient funds, but its temporary/permanent status is uncertain. Manual review is recommended.";
        }
        break;

      case "NETWORK":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.9;
          reasoning =
            "The payment failed due to a transient network or communication error. Full recovery is estimated upon automatic retry.";
        } else {
          worthiness = "REVIEW";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.5;
          reasoning =
            "A network-related failure was detected without definitive temporary status. Manual review is recommended.";
        }
        break;

      case "PROVIDER":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.85;
          reasoning =
            "The failure was caused by a temporary provider-side outage or gateway error. Recovery is estimated once provider connectivity resumes.";
        } else {
          worthiness = "REVIEW";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.5;
          reasoning =
            "A provider-side failure was detected without definitive temporary status. Manual review is recommended.";
        }
        break;

      case "TEMPORARY":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.85;
          reasoning =
            "The payment encountered a transient error. Full recovery is estimated upon scheduled retry.";
        } else {
          worthiness = "REVIEW";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.5;
          reasoning =
            "A temporary-type failure was detected without definitive temporary classification. Manual review is recommended.";
        }
        break;

      case "AUTHENTICATION":
        worthiness = "REVIEW";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.6;
        reasoning =
          "The payment failed customer authentication (OTP/3D Secure). Recovery requires customer checkout re-engagement.";
        break;

      case "CUSTOMER_ACTION_REQUIRED":
        worthiness = "REVIEW";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.6;
        reasoning =
          "Customer intervention is required before recovery can be attempted.";
        break;

      case "CARD":
        // Reaches here only when the failure analysis found no specific evidence
        // of a permanent card condition (an ambiguous/generic card decline).
        // A broad CARD category alone must not be assumed permanent.
        worthiness = "REVIEW";
        estimatedRecoverableAmount = originalAmount;
        confidence = 0.4;
        reasoning =
          "The card was declined without conclusive evidence of a permanent condition (e.g., expired, invalid, lost, stolen, or blocked). Manual review is recommended before attempting recovery.";
        break;

      case "BANK":
        if (classification === "TEMPORARY") {
          worthiness = "RECOVER";
          estimatedRecoverableAmount = originalAmount;
          confidence = 0.8;
          reasoning =
            "The customer's bank was temporarily unavailable or the switch timed out. Recovery is estimated upon bank service availability.";
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

    return this.buildResult(
      worthiness,
      estimatedRecoverableAmount,
      originalAmount,
      confidence,
      reasoning
    );
  }

  /**
   * Category-specific explanation for a PERMANENT classification. Kept distinct
   * from the switch statement above so this reasoning is reachable regardless
   * of category, since the PERMANENT safety boundary returns before the switch.
   */
  private permanentReasoning(category: string): string {
    switch (category) {
      case "CARD":
        return "The failure indicates a permanent card condition: an invalidated, expired, lost, or stolen card. Automated recovery on this payment method is not recommended.";
      case "BANK":
        return "The customer's bank account or card was permanently declined by the issuer (e.g., a closed account, blocked account, or an explicit do-not-honor response). Recovery is not recommended.";
      default:
        return `The failure is classified as permanent (${category}). Automated recovery is not recommended.`;
    }
  }

  private buildResult(
    worthiness: RecoveryWorthiness,
    estimatedRecoverableAmount: number,
    originalAmount: number,
    confidence: number | null,
    reasoning: string
  ): RecoveryAssessmentResult {
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
