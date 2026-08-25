/**
 * RecoverAI — Recovery Recommendation Service
 *
 * Phase 7: Recovery Recommendation
 *
 * Responsible ONLY for selecting the appropriate recovery action.
 * Produces an explainable, deterministic recommendation for every relevant
 * failed payment, optionally augmented by an ML probability signal.
 *
 * Architecture:
 *   Failure Analysis Result
 *         +
 *   Recovery Assessment Result
 *         ↓
 *   Deterministic Rules   ← always authoritative
 *         +
 *   ML Signal (optional)  ← supporting only; never overrides safety rules
 *         ↓
 *   RecoveryRecommendationResult
 *
 * Strictly provider-agnostic.
 * Does NOT execute recovery actions — Phase 8 responsibility.
 */

import {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
  RecoveryAssessmentResult,
  RecoveryAction,
  RecoveryRecommendationResult,
  RecoveryRecommendationResultSchema,
} from "@recoverai/contracts";

// ---------------------------------------------------------------------------
// ML Service configuration
// ---------------------------------------------------------------------------

/** Default URL of the Phase 6 FastAPI ML inference service. */
const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL || "http://localhost:8000";

/** Maximum milliseconds to wait for the ML service before falling back. */
const ML_TIMEOUT_MS = 2000;

/** ML probability threshold above which REVIEW may be upgraded to RETRY_PAYMENT. */
const ML_RETRY_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// ML Response type (matches Phase 6 PredictionResponse schema)
// ---------------------------------------------------------------------------

interface MlPredictionResponse {
  modelVersion: string;
  recoveryProbability: number;
  prediction: 0 | 1;
  confidence: number;
  isSyntheticDevelopmentModel: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RecoveryRecommendationService {
  constructor(
    private readonly mlServiceUrl: string = ML_SERVICE_URL,
    private readonly mlTimeoutMs: number = ML_TIMEOUT_MS
  ) {}

  /**
   * Generates a recovery recommendation for a failed payment.
   *
   * Deterministic rules are evaluated first and are always authoritative.
   * The ML service is consulted only for REVIEW-worthiness cases as an
   * optional supporting signal and may upgrade, but never downgrade, safety decisions.
   *
   * @param event         The canonical payment event (used for ML feature extraction).
   * @param failureAnalysis The normalized failure analysis from Phase 4.
   * @param assessment    The recovery assessment from Phase 5.
   */
  public async recommend(
    event: CanonicalPaymentEvent,
    failureAnalysis: FailureAnalysisResult,
    assessment: RecoveryAssessmentResult
  ): Promise<RecoveryRecommendationResult> {
    // -----------------------------------------------------------------------
    // 1. Deterministic rule — DO NOT RECOVER (highest priority, immutable)
    // -----------------------------------------------------------------------
    if (assessment.worthiness === "DO_NOT_RECOVER") {
      return this.buildResult({
        action: "DO_NOT_RECOVER",
        reason: this.permanentReason(failureAnalysis),
        confidence: assessment.confidence ?? 0.9,
        ruleSource: "deterministic-rules-v1",
        mlUsed: false,
        mlProbability: null,
      });
    }

    // -----------------------------------------------------------------------
    // 2. Deterministic rule — CUSTOMER_ACTION_REQUIRED (immutable, no ML override)
    // -----------------------------------------------------------------------
    if (
      failureAnalysis.category === "AUTHENTICATION" ||
      failureAnalysis.category === "CUSTOMER_ACTION_REQUIRED"
    ) {
      return this.buildResult({
        action: "CUSTOMER_ACTION_REQUIRED",
        reason: this.customerActionReason(failureAnalysis),
        confidence: 0.85,
        ruleSource: "deterministic-rules-v1",
        mlUsed: false,
        mlProbability: null,
      });
    }

    // -----------------------------------------------------------------------
    // 3. Deterministic rule — RETRY_PAYMENT (clear recoverable cases)
    // -----------------------------------------------------------------------
    if (assessment.worthiness === "RECOVER") {
      const retryCategories: FailureAnalysisResult["category"][] = [
        "INSUFFICIENT_FUNDS",
        "NETWORK",
        "PROVIDER",
        "TEMPORARY",
        "BANK",
      ];
      if (retryCategories.includes(failureAnalysis.category)) {
        return this.buildResult({
          action: "RETRY_PAYMENT",
          reason: this.retryReason(failureAnalysis),
          confidence: assessment.confidence ?? 0.8,
          ruleSource: "deterministic-rules-v1",
          mlUsed: false,
          mlProbability: null,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 4. REVIEW case — attempt ML signal to see if we can be more specific
    // -----------------------------------------------------------------------
    // At this point worthiness is REVIEW or the category is UNKNOWN.
    // We try the ML service. If it returns a high recovery probability we
    // upgrade to RETRY_PAYMENT; otherwise we stay as REVIEW.
    // -----------------------------------------------------------------------

    const mlResult = await this.fetchMlPrediction(event, failureAnalysis);

    if (mlResult !== null && mlResult.recoveryProbability >= ML_RETRY_THRESHOLD) {
      // ML signal indicates recovery is likely — upgrade REVIEW to RETRY_PAYMENT
      return this.buildResult({
        action: "RETRY_PAYMENT",
        reason: `The failure category is uncertain, but the ML recovery model (${mlResult.modelVersion}) estimates a ${Math.round(mlResult.recoveryProbability * 100)}% recovery probability — suggesting a retry may be worthwhile. Note: model is trained on synthetic development data.`,
        confidence: mlResult.confidence,
        ruleSource: "deterministic-rules-v1+ml-signal-v1",
        mlUsed: true,
        mlProbability: mlResult.recoveryProbability,
      });
    }

    // Default: REVIEW (with or without ML signal)
    const mlNote =
      mlResult !== null
        ? ` ML recovery probability: ${Math.round(mlResult.recoveryProbability * 100)}% (below retry threshold; manual review recommended).`
        : " ML service was not available; deterministic fallback applied.";

    return this.buildResult({
      action: "REVIEW",
      reason: `The payment failure could not be conclusively classified for automated recovery. Manual review is recommended.${mlNote}`,
      confidence: mlResult?.confidence ?? 0.3,
      ruleSource:
        mlResult !== null
          ? "deterministic-rules-v1+ml-signal-v1"
          : "deterministic-rules-v1",
      mlUsed: mlResult !== null,
      mlProbability: mlResult?.recoveryProbability ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // ML Service Integration (private)
  // ---------------------------------------------------------------------------

  /**
   * Calls the Phase 6 ML inference service with a hard timeout.
   * Returns null on any error (network, timeout, invalid response, etc.).
   * The caller falls back to deterministic rules when null is returned.
   */
  private async fetchMlPrediction(
    event: CanonicalPaymentEvent,
    failureAnalysis: FailureAnalysisResult
  ): Promise<MlPredictionResponse | null> {
    try {
      const eventDate =
        event.eventTimestamp instanceof Date
          ? event.eventTimestamp
          : new Date(event.eventTimestamp);

      const body = {
        amount: event.amount,
        currency: event.currency,
        payment_method: event.paymentMethod,
        failure_category: failureAnalysis.category,
        failure_classification: failureAnalysis.classification,
        provider_type: "DEMO",
        event_hour: eventDate.getHours(),
        day_of_week: eventDate.getDay() === 0 ? 6 : eventDate.getDay() - 1, // Mon=0..Sun=6
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.mlTimeoutMs);

      let response: Response;
      try {
        response = await fetch(`${this.mlServiceUrl}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        console.warn(
          `[RecoveryRecommendation] ML service returned ${response.status}. Falling back to deterministic rules.`
        );
        return null;
      }

      const data = (await response.json()) as MlPredictionResponse;

      // Validate essential fields
      if (
        typeof data.recoveryProbability !== "number" ||
        data.recoveryProbability < 0 ||
        data.recoveryProbability > 1
      ) {
        console.warn(
          "[RecoveryRecommendation] ML response failed validation. Falling back to deterministic rules."
        );
        return null;
      }

      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("abort") || message.includes("timeout")) {
        console.warn(
          `[RecoveryRecommendation] ML service timed out (${this.mlTimeoutMs}ms). Falling back to deterministic rules.`
        );
      } else {
        console.warn(
          `[RecoveryRecommendation] ML service unavailable: ${message}. Falling back to deterministic rules.`
        );
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Reason builders (private)
  // ---------------------------------------------------------------------------

  private permanentReason(failureAnalysis: FailureAnalysisResult): string {
    switch (failureAnalysis.category) {
      case "CARD":
        return "The failure indicates a permanent card condition (e.g., lost, stolen, expired, or invalid card). Recovery is not considered worthwhile.";
      case "BANK":
        return "The bank permanently declined the transaction (e.g., account blocked or restricted). Recovery is not recommended.";
      default:
        return `The recovery assessment determined that recovery is not worthwhile for this failure (category: ${failureAnalysis.category}). No recovery action is recommended.`;
    }
  }

  private customerActionReason(failureAnalysis: FailureAnalysisResult): string {
    switch (failureAnalysis.category) {
      case "AUTHENTICATION":
        return "The payment requires customer authentication (e.g., OTP, 3D Secure, or biometric verification) before another successful payment attempt is likely. Customer action is required.";
      case "CUSTOMER_ACTION_REQUIRED":
        return "Customer intervention is required to authorize or update payment details (e.g., e-mandate approval or updated card) before recovery can be attempted.";
      default:
        return "Customer action is required before recovery can be attempted. Please prompt the customer to complete the required step.";
    }
  }

  private retryReason(failureAnalysis: FailureAnalysisResult): string {
    switch (failureAnalysis.category) {
      case "INSUFFICIENT_FUNDS":
        return "The payment failed due to a potentially temporary insufficient-funds condition. The failure may resolve upon a timed retry or customer reminder, and recovery is considered worthwhile.";
      case "NETWORK":
        return "The payment failed due to a transient network or communication error. Full recovery is expected upon automatic retry once connectivity is restored.";
      case "PROVIDER":
        return "The failure was caused by a temporary provider-side outage or gateway error. Recovery is expected once provider connectivity resumes.";
      case "TEMPORARY":
        return "The payment encountered a transient failure. Full recovery is expected upon a scheduled retry.";
      case "BANK":
        return "The customer's bank was temporarily unavailable. Recovery is expected upon bank service availability.";
      default:
        return "The recovery assessment indicates that recovery is worthwhile. A payment retry is recommended.";
    }
  }

  // ---------------------------------------------------------------------------
  // Result builder
  // ---------------------------------------------------------------------------

  private buildResult(params: {
    action: RecoveryAction;
    reason: string;
    confidence: number | null;
    ruleSource: string;
    mlUsed: boolean;
    mlProbability: number | null;
  }): RecoveryRecommendationResult {
    return RecoveryRecommendationResultSchema.parse({
      action: params.action,
      status: "RECOMMENDED",
      reason: params.reason,
      confidence: params.confidence,
      ruleSource: params.ruleSource,
      mlUsed: params.mlUsed,
      mlProbability: params.mlProbability,
      recommendedAt: new Date(),
    });
  }
}
