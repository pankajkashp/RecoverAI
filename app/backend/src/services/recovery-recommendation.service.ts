/**
 * RecoverAI — Recovery Recommendation Service
 *
 * Phase 7: Recovery Recommendation
 *
 * Deterministic recovery rules are authoritative. ML is an optional supporting
 * signal and can never override a safety rule.
 */

import {
  CanonicalPaymentEvent,
  FailureAnalysisResult,
  RecoveryAssessmentResult,
  RecoveryAction,
  RecoveryRecommendationResult,
  RecoveryRecommendationResultSchema,
  ProviderType,
  ProviderTypeEnum,
} from "@recoverai/contracts";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT_MS = 2000;
const ML_RETRY_THRESHOLD = 0.65;

interface MlPredictionResponse {
  modelVersion: string;
  recoveryProbability: number;
  prediction: 0 | 1;
  confidence: number;
  isSyntheticDevelopmentModel: boolean;
}

export class RecoveryRecommendationService {
  constructor(
    private readonly mlServiceUrl: string = ML_SERVICE_URL,
    private readonly mlTimeoutMs: number = ML_TIMEOUT_MS
  ) {}

  public async recommend(
    event: CanonicalPaymentEvent,
    failureAnalysis: FailureAnalysisResult,
    assessment: RecoveryAssessmentResult
  ): Promise<RecoveryRecommendationResult> {
    // Safety rule: an explicit assessment to not recover is final.
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

    // Safety rule: these failures require customer intervention, not an ML retry.
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

    // Deterministic recoverable failures remain recoverable. ML must not veto them.
    if (
      assessment.worthiness === "RECOVER" &&
      ["INSUFFICIENT_FUNDS", "NETWORK", "PROVIDER", "TEMPORARY", "BANK"].includes(
        failureAnalysis.category
      )
    ) {
      return this.buildResult({
        action: "RETRY_PAYMENT",
        reason: this.retryReason(failureAnalysis),
        confidence: assessment.confidence ?? 0.8,
        ruleSource: "deterministic-rules-v1",
        mlUsed: false,
        mlProbability: null,
      });
    }

    // Only ambiguous cases reach ML. A successful ML call may upgrade REVIEW.
    const mlResult = await this.fetchMlPrediction(event, failureAnalysis);

    if (mlResult && mlResult.recoveryProbability >= ML_RETRY_THRESHOLD) {
      return this.buildResult({
        action: "RETRY_PAYMENT",
        reason:
          `The failure category is uncertain, but ML model ${mlResult.modelVersion} ` +
          `estimates a ${Math.round(mlResult.recoveryProbability * 100)}% recovery probability, ` +
          "so a retry is recommended. Note: the current model is trained on synthetic development data.",
        // For a recovery recommendation, use recovery probability—not the model's
        // confidence in its binary class—as the confidence of the selected action.
        confidence: mlResult.recoveryProbability,
        ruleSource: "deterministic-rules-v1+ml-signal-v1",
        mlUsed: true,
        mlProbability: mlResult.recoveryProbability,
      });
    }

    const mlNote = mlResult
      ? ` ML recovery probability: ${Math.round(mlResult.recoveryProbability * 100)}% (below retry threshold; manual review recommended).`
      : " ML service was not available; deterministic fallback applied.";

    return this.buildResult({
      action: "REVIEW",
      reason:
        "The payment failure could not be conclusively classified for automated recovery. " +
        `Manual review is recommended.${mlNote}`,
      confidence: 0.3,
      ruleSource:
        mlResult !== null ? "deterministic-rules-v1+ml-signal-v1" : "deterministic-rules-v1",
      mlUsed: mlResult !== null,
      mlProbability: mlResult?.recoveryProbability ?? null,
    });
  }

  private async fetchMlPrediction(
    event: CanonicalPaymentEvent,
    failureAnalysis: FailureAnalysisResult
  ): Promise<MlPredictionResponse | null> {
    try {
      const eventDate = new Date(event.eventTimestamp);
      if (Number.isNaN(eventDate.getTime())) return null;

      const providerType = this.resolveProviderType(event);
      const body = {
        amount: event.amount,
        currency: event.currency,
        payment_method: event.paymentMethod,
        failure_category: failureAnalysis.category,
        failure_classification: failureAnalysis.classification,
        provider_type: providerType,
        // Canonical timestamps are UTC instants; use UTC consistently so inference
        // does not depend on the backend machine's local timezone.
        event_hour: eventDate.getUTCHours(),
        day_of_week: eventDate.getUTCDay() === 0 ? 6 : eventDate.getUTCDay() - 1,
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
        console.warn(`[RecoveryRecommendation] ML service returned ${response.status}. Falling back to deterministic rules.`);
        return null;
      }

      const raw: unknown = await response.json();
      if (!this.isValidMlResponse(raw)) {
        console.warn("[RecoveryRecommendation] ML response failed validation. Falling back to deterministic rules.");
        return null;
      }

      return raw;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[RecoveryRecommendation] ML service unavailable: ${message}. Falling back to deterministic rules.`);
      return null;
    }
  }

  private isValidMlResponse(value: unknown): value is MlPredictionResponse {
    if (!value || typeof value !== "object") return false;
    const data = value as Record<string, unknown>;
    return (
      typeof data.modelVersion === "string" &&
      data.modelVersion.length > 0 &&
      typeof data.recoveryProbability === "number" &&
      Number.isFinite(data.recoveryProbability) &&
      data.recoveryProbability >= 0 &&
      data.recoveryProbability <= 1 &&
      (data.prediction === 0 || data.prediction === 1) &&
      typeof data.confidence === "number" &&
      Number.isFinite(data.confidence) &&
      data.confidence >= 0 &&
      data.confidence <= 1 &&
      typeof data.isSyntheticDevelopmentModel === "boolean"
    );
  }

  private resolveProviderType(event: CanonicalPaymentEvent): ProviderType {
    const candidate = event.metadata?.provider;
    const parsed = ProviderTypeEnum.safeParse(
      typeof candidate === "string" ? candidate.trim().toUpperCase() : undefined
    );
    return parsed.success ? parsed.data : "OTHER";
  }

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
    if (failureAnalysis.category === "AUTHENTICATION") {
      return "The payment requires customer authentication (e.g., OTP, 3D Secure, or biometric verification) before another successful payment attempt is likely. Customer action is required.";
    }
    return "Customer intervention is required to authorize or update payment details before recovery can be attempted.";
  }

  private retryReason(failureAnalysis: FailureAnalysisResult): string {
    switch (failureAnalysis.category) {
      case "INSUFFICIENT_FUNDS":
        return "The payment failed due to a potentially temporary insufficient-funds condition. A timed retry or customer reminder may recover the payment.";
      case "NETWORK":
        return "The payment failed due to a transient network or communication error. A retry is recommended once connectivity is restored.";
      case "PROVIDER":
        return "The failure was caused by a temporary provider-side outage or gateway error. A retry is recommended once provider connectivity resumes.";
      case "TEMPORARY":
        return "The payment encountered a transient failure. A scheduled retry is recommended.";
      case "BANK":
        return "The customer's bank was temporarily unavailable. A retry is recommended after bank service availability is restored.";
      default:
        return "The recovery assessment indicates that recovery is worthwhile. A payment retry is recommended.";
    }
  }

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
