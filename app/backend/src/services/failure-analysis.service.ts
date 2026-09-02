/**
 * RecoverAI — Failure Analysis Service
 *
 * Phase 4: Automatic Failure Analysis
 *
 * Deterministic, rule-based failure analysis engine.
 * Automatically classifies canonical payment failures into normalized categories,
 * human-readable explanations, and temporary/permanent classifications.
 *
 * Strictly provider-agnostic. Operates only on CanonicalPaymentEvents.
 * No ML models or recovery decisions are executed in this phase.
 */

import {
  CanonicalPaymentEvent,
  FailureCategory,
  FailureClassification,
  FailureAnalysisResult,
} from "@recoverai/contracts";

export class FailureAnalysisService {
  /**
   * Analyzes a failed canonical payment event and produces a normalized analysis result.
   */
  public analyzeFailure(event: CanonicalPaymentEvent): FailureAnalysisResult {
    const rawCode = event.failureCode?.trim() || null;
    const rawMessage = event.failureMessage?.trim() || null;

    // 1. Determine normalized category
    const category = this.resolveCategory(
      event.failureCategory,
      rawCode,
      rawMessage,
      event.metadata
    );

    // 2. Generate clean human-readable reason
    const reason = this.generateReason(category, rawMessage);

    // 3. Determine temporary/permanent classification
    const { classification, isTemporary } = this.resolveClassification(
      category,
      rawCode
    );

    return {
      category,
      reason,
      classification,
      isTemporary,
      originalFailureCode: rawCode,
      originalFailureMessage: rawMessage,
      metadata: {
        analyzedAt: new Date().toISOString(),
        ruleEngine: "deterministic-v1",
      },
    };
  }

  /**
   * Resolves the normalized failure category based on explicit category, failure code, error message, or provider metadata.
   */
  private resolveCategory(
    explicitCategory?: FailureCategory | null,
    code?: string | null,
    message?: string | null,
    metadata?: Record<string, unknown> | null
  ): FailureCategory {
    // If explicitly categorized upstream with a valid recognized category
    if (explicitCategory && explicitCategory !== "UNKNOWN") {
      return explicitCategory;
    }

    const rzpError = metadata?.razorpayError as Record<string, unknown> | undefined;
    const rzpSource = (rzpError?.source as string)?.toLowerCase().trim();
    const rzpStep = (rzpError?.step as string)?.toLowerCase().trim();


    const acquirerData = (metadata?.acquirerData && typeof metadata.acquirerData === "object"
      ? metadata.acquirerData
      : null) as Record<string, unknown> | null;
    const responseCode = acquirerData?.response_code ? String(acquirerData.response_code).trim() : "";

    const normalizedCode = (code || "").toUpperCase().replace(/[\s-]+/g, "_");
    const normalizedMessage = (message || "").toLowerCase().replace(/[-_]+/g, " ");

    // 1. INSUFFICIENT_FUNDS
    if (
      responseCode === "51" ||
      normalizedCode.includes("INSUFFICIENT") ||
      normalizedCode.includes("LOW_BALANCE") ||
      normalizedCode.includes("NOT_ENOUGH_FUNDS") ||
      normalizedCode.includes("OVER_CREDIT_LIMIT") ||
      normalizedCode.includes("EXCEEDS_BALANCE") ||
      normalizedCode === "NSF" ||
      normalizedMessage.includes("insufficient funds") ||
      normalizedMessage.includes("insufficient balance") ||
      normalizedMessage.includes("low balance") ||
      normalizedMessage.includes("not enough funds") ||
      normalizedMessage.includes("credit limit exceeded") ||
      normalizedMessage.includes("balance insufficient")
    ) {
      return "INSUFFICIENT_FUNDS";
    }

    // 2. AUTHENTICATION
    if (
      rzpStep === "payment_authentication" ||
      normalizedCode.includes("AUTH") ||
      normalizedCode.includes("OTP") ||
      normalizedCode.includes("3DS") ||
      normalizedCode.includes("PIN_INCORRECT") ||
      normalizedCode.includes("MFA") ||
      normalizedCode.includes("MPIN") ||
      normalizedMessage.includes("authentication failed") ||
      normalizedMessage.includes("otp expired") ||
      normalizedMessage.includes("3d secure") ||
      normalizedMessage.includes("verification failed") ||
      normalizedMessage.includes("wrong pin") ||
      normalizedMessage.includes("incorrect pin") ||
      normalizedMessage.includes("invalid pin") ||
      normalizedMessage.includes("mpin")
    ) {
      return "AUTHENTICATION";
    }

    // 3. NETWORK
    if (
      normalizedCode.includes("TIMEOUT") ||
      normalizedCode.includes("NETWORK") ||
      normalizedCode.includes("GATEWAY_TIMEOUT") ||
      normalizedCode.includes("PSP_TIMEOUT") ||
      normalizedCode.includes("SWITCH_TIMEOUT") ||
      normalizedCode.includes("SOCKET") ||
      normalizedCode.includes("CONNECTION_FAILED") ||
      normalizedCode.includes("COMMUNICATION_ERROR") ||
      normalizedMessage.includes("timed out") ||
      normalizedMessage.includes("network error") ||
      normalizedMessage.includes("connection reset") ||
      normalizedMessage.includes("connection failed") ||
      normalizedMessage.includes("switch timeout") ||
      normalizedMessage.includes("psp timeout")
    ) {
      return "NETWORK";
    }

    // 4. CARD
    if (
      responseCode === "54" ||
      normalizedCode.includes("CARD") ||
      normalizedCode.includes("EXPIRED_CARD") ||
      normalizedCode.includes("INVALID_CARD") ||
      normalizedCode.includes("PICKUP_CARD") ||
      normalizedCode.includes("LOST_CARD") ||
      normalizedCode.includes("STOLEN_CARD") ||
      normalizedCode.includes("CVV") ||
      normalizedCode.includes("RESTRICTED_CARD") ||
      normalizedMessage.includes("expired card") ||
      normalizedMessage.includes("card expired") ||
      normalizedMessage.includes("lost or stolen") ||
      normalizedMessage.includes("invalid card") ||
      normalizedMessage.includes("card declined") ||
      normalizedMessage.includes("declined by card") ||
      normalizedMessage.includes("invalid cvv") ||
      normalizedMessage.includes("incorrect cvv")
    ) {
      return "CARD";
    }

    // 5. BANK
    if (
      rzpSource === "bank" ||
      responseCode === "05" ||
      normalizedCode.includes("BANK") ||
      normalizedCode.includes("ISSUER") ||
      normalizedCode.includes("DO_NOT_HONOR") ||
      normalizedCode.includes("ACCOUNT_BLOCKED") ||
      normalizedCode.includes("BANK_DEBIT_FAILED") ||
      normalizedMessage.includes("issuer declined") ||
      normalizedMessage.includes("declined by issuer") ||
      normalizedMessage.includes("bank declined") ||
      normalizedMessage.includes("bank switch") ||
      normalizedMessage.includes("do not honor") ||
      normalizedMessage.includes("account blocked") ||
      normalizedMessage.includes("account frozen")
    ) {
      return "BANK";
    }

    // 6. PROVIDER
    if (
      rzpSource === "gateway" ||
      rzpSource === "business" ||
      normalizedCode.includes("PROVIDER") ||
      normalizedCode.includes("GATEWAY_ERROR") ||
      normalizedCode.includes("PROCESSOR_ERROR") ||
      normalizedCode.includes("INTERNAL_GATEWAY_ERROR") ||
      normalizedCode.includes("PROVIDER_UNAVAILABLE") ||
      normalizedCode.includes("PROVIDER_OUTAGE") ||
      normalizedMessage.includes("gateway outage") ||
      normalizedMessage.includes("processor error") ||
      normalizedMessage.includes("provider error") ||
      normalizedMessage.includes("acquirer down") ||
      normalizedMessage.includes("route not found")
    ) {
      return "PROVIDER";
    }

    // 7. CUSTOMER_ACTION_REQUIRED
    if (
      normalizedCode.includes("CUSTOMER_ACTION") ||
      normalizedCode.includes("ACTION_REQUIRED") ||
      normalizedCode.includes("MANDATE_PENDING") ||
      normalizedCode.includes("CONSENT_REQUIRED") ||
      normalizedCode.includes("USER_ACTION") ||
      normalizedMessage.includes("customer action required") ||
      normalizedMessage.includes("user cancelled") ||
      normalizedMessage.includes("customer cancelled") ||
      normalizedMessage.includes("payment cancelled") ||
      normalizedMessage.includes("cancelled by user") ||
      normalizedMessage.includes("user dropped") ||
      normalizedMessage.includes("invalid vpa") ||
      normalizedMessage.includes("collect request expired") ||
      normalizedMessage.includes("mandate pending") ||
      normalizedMessage.includes("consent required")
    ) {
      return "CUSTOMER_ACTION_REQUIRED";
    }

    // 8. TEMPORARY
    if (
      normalizedCode.includes("TEMPORARY") ||
      normalizedCode.includes("TRANSIENT") ||
      normalizedCode.includes("RETRY_LATER") ||
      normalizedCode.includes("THROTTLED") ||
      normalizedCode.includes("SYSTEM_BUSY") ||
      normalizedMessage.includes("temporary glitch") ||
      normalizedMessage.includes("try again later") ||
      normalizedMessage.includes("system busy")
    ) {
      return "TEMPORARY";
    }

    // 9. Default: UNKNOWN (no false guessing)
    return "UNKNOWN";
  }

  /**
   * Generates a concise, professional failure reason suitable for a business dashboard.
   */
  private generateReason(
    category: FailureCategory,
    _rawMessage?: string | null
  ): string {
    switch (category) {
      case "INSUFFICIENT_FUNDS":
        return "The payment could not be completed because sufficient funds or account balance were unavailable.";

      case "AUTHENTICATION":
        return "The payment failed during customer authentication (such as OTP, 3D Secure, or biometric verification).";

      case "NETWORK":
        return "The payment could not be completed due to a temporary network or communication failure.";

      case "CARD":
        return "The transaction was declined due to card-specific issues (e.g., expired card, invalid number, or card blocked by issuer).";

      case "BANK":
        return "The payment was declined or could not be processed by the customer's or acquiring bank.";

      case "PROVIDER":
        return "The transaction could not be processed due to a provider-side outage or gateway error.";

      case "CUSTOMER_ACTION_REQUIRED":
        return "Customer intervention is required to authorize or update payment details before completion.";

      case "TEMPORARY":
        return "The payment experienced a transient failure and may succeed upon retry.";

      case "UNKNOWN":
      default:
        return "Payment failed for an unrecognized or insufficiently classified reason.";
    }
  }

  /**
   * Determines whether the failure is temporary or permanent where determinable.
   */
  private resolveClassification(
    category: FailureCategory,
    code?: string | null
  ): {
    classification: FailureClassification;
    isTemporary: boolean | null;
  } {
    const normalizedCode = (code || "").toUpperCase();

    switch (category) {
      case "INSUFFICIENT_FUNDS":
      case "AUTHENTICATION":
      case "NETWORK":
      case "PROVIDER":
      case "CUSTOMER_ACTION_REQUIRED":
      case "TEMPORARY":
        return { classification: "TEMPORARY", isTemporary: true };

      case "CARD":
        // Lost, stolen, or expired cards are permanent
        if (
          normalizedCode.includes("LOST") ||
          normalizedCode.includes("STOLEN") ||
          normalizedCode.includes("EXPIRED") ||
          normalizedCode.includes("PICKUP") ||
          normalizedCode.includes("INVALID")
        ) {
          return { classification: "PERMANENT", isTemporary: false };
        }
        return { classification: "PERMANENT", isTemporary: false };

      case "BANK":
        if (
          normalizedCode.includes("OFFLINE") ||
          normalizedCode.includes("UNAVAILABLE") ||
          normalizedCode.includes("TIMEOUT")
        ) {
          return { classification: "TEMPORARY", isTemporary: true };
        }
        if (
          normalizedCode.includes("BLOCKED") ||
          normalizedCode.includes("CLOSED") ||
          normalizedCode.includes("DO_NOT_HONOR")
        ) {
          return { classification: "PERMANENT", isTemporary: false };
        }
        return { classification: "UNKNOWN", isTemporary: null };

      case "UNKNOWN":
      default:
        return { classification: "UNKNOWN", isTemporary: null };
    }
  }
}
