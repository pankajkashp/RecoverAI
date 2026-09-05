/**
 * RecoverAI — Failure Analysis Service
 *
 * Phase 4: Automatic Failure Analysis
 * Hardened: Evidence-Based Failure Classification
 *
 * Deterministic, rule-based failure analysis engine.
 * Automatically classifies canonical payment failures into normalized categories,
 * human-readable explanations, and temporary/permanent classifications.
 *
 * Classification is evidence-first: specific provider evidence (failure code,
 * reason, description, source, step, acquirer response code) always takes
 * precedence over the broad failure category. A category alone is never
 * sufficient to declare a failure PERMANENT or TEMPORARY — only concrete
 * evidence, or a documented category-inherent default, can. When no evidence
 * is available, the result is UNKNOWN rather than a guess.
 *
 * Strictly provider-agnostic. Operates only on CanonicalPaymentEvents.
 * No ML models or recovery decisions are executed in this phase.
 */

import {
  CanonicalPaymentEvent,
  FailureCategory,
  FailureCategoryEnum,
  FailureClassification,
  FailureAnalysisResult,
} from "@recoverai/contracts";

/** Raw provider evidence extracted from a CanonicalPaymentEvent. */
interface FailureEvidence {
  code: string | null;
  message: string | null;
  reason: string | null;
  source: string | null;
  step: string | null;
  responseCode: string | null;
}

interface EvidenceRule {
  id: string;
  matches: (text: string, evidence: FailureEvidence) => boolean;
  explanation: string;
}

/** Whole-word match (order independent) so unrelated substrings can't trigger a rule. */
function hasAllWords(text: string, words: string[]): boolean {
  return words.every((w) => new RegExp(`\\b${w}\\b`).test(text));
}

function hasAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

// ============================================================================
// Explicit PERMANENT evidence — checked first. Specific permanent evidence
// must never be overridden by a broad TEMPORARY category default.
// ============================================================================
const PERMANENT_RULES: EvidenceRule[] = [
  {
    id: "card-expired",
    matches: (t, e) => hasAllWords(t, ["card", "expired"]) || e.responseCode === "54",
    explanation:
      "The card has expired, which permanently prevents further charges on this card.",
  },
  {
    id: "card-invalid",
    matches: (t) => hasAllWords(t, ["card", "invalid"]),
    explanation:
      "The card number or details are invalid, which cannot be resolved by retrying.",
  },
  {
    id: "card-lost-stolen",
    matches: (t, e) =>
      hasAllWords(t, ["card", "lost"]) ||
      hasAllWords(t, ["card", "stolen"]) ||
      e.responseCode === "41" ||
      e.responseCode === "43",
    explanation:
      "The card has been reported lost or stolen, so it can never be recovered automatically.",
  },
  {
    id: "card-blocked",
    matches: (t) =>
      hasAllWords(t, ["card", "blocked"]) ||
      hasAllWords(t, ["card", "restricted"]) ||
      hasAllWords(t, ["card", "pickup"]),
    explanation:
      "The card is blocked or restricted by the issuer, requiring the customer to use a different payment method.",
  },
  {
    id: "account-closed",
    matches: (t) => hasAllWords(t, ["account", "closed"]) || hasAllWords(t, ["bank", "closed"]),
    explanation:
      "The bank account has been closed, so no further charge attempts can succeed on it.",
  },
  {
    id: "account-blocked",
    matches: (t) => hasAllWords(t, ["account", "blocked"]),
    explanation:
      "The bank account is blocked, requiring the customer to resolve this with their bank before any retry can succeed.",
  },
  {
    id: "do-not-honor",
    matches: (t, e) =>
      hasAllWords(t, ["do", "not", "honor"]) ||
      hasAllWords(t, ["do", "not", "honour"]) ||
      e.responseCode === "05",
    explanation:
      "The issuing bank returned an explicit do-not-honor decline, treated as a permanent rejection.",
  },
];

// ============================================================================
// Explicit TEMPORARY evidence — checked after PERMANENT. Specific temporary
// evidence must never be overridden by a generic UNKNOWN default.
// ============================================================================
const TEMPORARY_RULES: EvidenceRule[] = [
  {
    id: "insufficient-funds",
    matches: (t, e) =>
      hasAllWords(t, ["insufficient", "funds"]) ||
      hasAllWords(t, ["insufficient", "balance"]) ||
      hasAllWords(t, ["low", "balance"]) ||
      hasAllWords(t, ["balance", "insufficient"]) ||
      hasAllWords(t, ["not", "enough", "funds"]) ||
      hasAllWords(t, ["credit", "limit"]) ||
      e.responseCode === "51",
    explanation:
      "The failure indicates a temporary insufficient-funds condition that may resolve once the account is funded.",
  },
  {
    id: "bank-unreachable",
    matches: (t) =>
      hasAllWords(t, ["bank", "timeout"]) ||
      hasAllWords(t, ["bank", "unavailable"]) ||
      hasAllWords(t, ["bank", "offline"]) ||
      hasAllWords(t, ["bank", "down"]) ||
      hasAllWords(t, ["issuer", "unavailable"]) ||
      hasAllWords(t, ["issuer", "timeout"]),
    explanation:
      "The customer's bank or card issuer was temporarily unreachable, which typically resolves on retry.",
  },
  {
    id: "network-timeout",
    matches: (t) =>
      hasAnyPhrase(t, [
        "timed out",
        "connection timeout",
        "connection failed",
        "connection reset",
        "gateway timeout",
        "psp timeout",
        "switch timeout",
        "socket timeout",
      ]) ||
      hasAllWords(t, ["network", "timeout"]) ||
      hasAllWords(t, ["network", "error"]),
    explanation:
      "A transient network or communication error interrupted the payment, which is expected to succeed on retry.",
  },
  {
    id: "provider-outage",
    matches: (t) =>
      hasAllWords(t, ["provider", "outage"]) ||
      hasAllWords(t, ["gateway", "outage"]) ||
      hasAllWords(t, ["provider", "unavailable"]) ||
      hasAllWords(t, ["service", "unavailable"]) ||
      hasAllWords(t, ["temporarily", "unavailable"]),
    explanation:
      "The payment provider experienced a temporary outage or unavailability, which is expected to resolve on retry.",
  },
  {
    id: "generic-temporary",
    matches: (t, e) =>
      hasAnyPhrase(t, [
        "temporary",
        "transient",
        "retry later",
        "try again later",
        "system busy",
        "throttled",
      ]) ||
      e.responseCode === "91" ||
      e.responseCode === "96",
    explanation: "The failure was explicitly reported as a temporary or transient condition.",
  },
];

export class FailureAnalysisService {
  /**
   * Analyzes a failed canonical payment event and produces a normalized analysis result.
   */
  public analyzeFailure(event: CanonicalPaymentEvent): FailureAnalysisResult {
    const rawCode = event.failureCode?.trim() || null;
    const rawMessage = event.failureMessage?.trim() || null;
    const evidence = this.extractEvidence(event, rawCode, rawMessage);

    // 1. Determine normalized category
    const category = this.resolveCategory(event.failureCategory, evidence);

    // 2. Generate clean human-readable reason
    const reason = this.generateReason(category, rawMessage);

    // 3. Determine temporary/permanent classification from evidence, not category alone
    const { classification, isTemporary, explanation } = this.resolveClassification(
      category,
      evidence
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
        classificationBasis: explanation,
      },
    };
  }

  /**
   * Extracts normalized, provider-agnostic evidence from the canonical event.
   * When available, Razorpay's detailed error metadata (source/step/reason)
   * and acquirer response code are used as first-class evidence, not discarded.
   */
  private extractEvidence(
    event: CanonicalPaymentEvent,
    rawCode: string | null,
    rawMessage: string | null
  ): FailureEvidence {
    const razorpayError = (event.metadata?.razorpayError &&
    typeof event.metadata.razorpayError === "object"
      ? event.metadata.razorpayError
      : null) as Record<string, unknown> | null;

    const acquirerData = (event.metadata?.acquirerData &&
    typeof event.metadata.acquirerData === "object"
      ? event.metadata.acquirerData
      : null) as Record<string, unknown> | null;

    const reason = (razorpayError?.reason as string) || null;
    const source = (razorpayError?.source as string) || null;
    const step = (razorpayError?.step as string) || null;
    const responseCode = acquirerData?.response_code
      ? String(acquirerData.response_code).trim()
      : null;

    return {
      code: rawCode,
      message: rawMessage,
      reason,
      source: source ? source.toLowerCase().trim() : null,
      step: step ? step.toLowerCase().trim() : null,
      responseCode,
    };
  }

  /** Combines all textual evidence into one normalized, word-matchable string. */
  private combinedEvidenceText(evidence: FailureEvidence): string {
    return [evidence.code, evidence.message, evidence.reason]
      .filter((v): v is string => Boolean(v))
      .join(" ")
      .toLowerCase()
      .replace(/[_-]+/g, " ");
  }

  /**
   * Resolves the normalized failure category from explicit upstream category or raw evidence.
   */
  private resolveCategory(
    explicitCategory: FailureCategory | null | undefined,
    evidence: FailureEvidence
  ): FailureCategory {
    // If explicitly categorized upstream (e.g. by a provider adapter) with a
    // recognized category, trust that evidence-based classification.
    if (explicitCategory && explicitCategory !== "UNKNOWN") {
      return explicitCategory;
    }

    // A failure code that IS (exactly) one of the known category names is itself
    // an explicit, unambiguous categorization (e.g. failureCode: "NETWORK") — not
    // a substring guess. This is distinct from scanning a longer message for a
    // category word, which is exactly the kind of loose matching this service
    // avoids elsewhere.
    const exactCodeCategory = evidence.code
      ? FailureCategoryEnum.options.find(
          (c) => c === evidence.code!.toUpperCase().trim()
        )
      : undefined;
    if (exactCodeCategory && exactCodeCategory !== "UNKNOWN") {
      return exactCodeCategory;
    }

    const text = this.combinedEvidenceText(evidence);
    const responseCode = evidence.responseCode || "";

    // 1. INSUFFICIENT_FUNDS
    if (
      responseCode === "51" ||
      hasAllWords(text, ["insufficient", "funds"]) ||
      hasAllWords(text, ["insufficient", "balance"]) ||
      hasAllWords(text, ["low", "balance"]) ||
      hasAllWords(text, ["not", "enough", "funds"]) ||
      hasAllWords(text, ["credit", "limit"]) ||
      hasAllWords(text, ["balance", "insufficient"]) ||
      /\bnsf\b/.test(text)
    ) {
      return "INSUFFICIENT_FUNDS";
    }

    // 2. AUTHENTICATION
    if (
      evidence.step === "payment_authentication" ||
      hasAnyPhrase(text, ["authentication failed", "3d secure", "verification failed"]) ||
      hasAllWords(text, ["authentication", "required"]) ||
      hasAllWords(text, ["otp", "required"]) ||
      /\botp\b/.test(text) ||
      /\b3ds\b/.test(text) ||
      /\bmfa\b/.test(text) ||
      /\bmpin\b/.test(text) ||
      hasAllWords(text, ["wrong", "pin"]) ||
      hasAllWords(text, ["incorrect", "pin"]) ||
      hasAllWords(text, ["invalid", "pin"])
    ) {
      return "AUTHENTICATION";
    }

    // 3. Unambiguous card-specific acquirer response codes. These are checked
    // ahead of the coarser BANK source signal: a specific ISO response code
    // (e.g. 54 = expired card) is stronger evidence than knowing only that the
    // response came from "the bank" generically.
    if (responseCode === "54" || responseCode === "41" || responseCode === "43") {
      return "CARD";
    }

    // 4. BANK — evidence specifically tied to the bank/issuer/account. Checked
    // ahead of the generic NETWORK/CARD text-based categories so bank-specific
    // timeouts and outages are attributed to the bank, not misfiled as generic
    // network noise.
    if (
      evidence.source === "bank" ||
      responseCode === "05" ||
      hasAllWords(text, ["bank", "timeout"]) ||
      hasAllWords(text, ["bank", "unavailable"]) ||
      hasAllWords(text, ["bank", "offline"]) ||
      hasAllWords(text, ["bank", "down"]) ||
      hasAllWords(text, ["issuer", "unavailable"]) ||
      hasAllWords(text, ["issuer", "timeout"]) ||
      hasAllWords(text, ["issuer", "declined"]) ||
      hasAllWords(text, ["bank", "declined"]) ||
      hasAllWords(text, ["bank", "server"]) ||
      hasAllWords(text, ["bank", "debit", "failed"]) ||
      hasAllWords(text, ["account", "closed"]) ||
      hasAllWords(text, ["bank", "closed"]) ||
      hasAllWords(text, ["account", "blocked"]) ||
      hasAllWords(text, ["account", "frozen"]) ||
      hasAllWords(text, ["do", "not", "honor"]) ||
      hasAllWords(text, ["do", "not", "honour"])
    ) {
      return "BANK";
    }

    // 5. NETWORK — generic connectivity issues not specifically tied to the bank
    if (
      hasAnyPhrase(text, [
        "timed out",
        "network error",
        "connection reset",
        "connection failed",
        "gateway timeout",
        "psp timeout",
        "switch timeout",
        "socket timeout",
      ]) ||
      hasAllWords(text, ["network", "timeout"]) ||
      hasAllWords(text, ["connection", "timeout"]) ||
      (text.includes("timeout") && !text.includes("bank")) ||
      text.includes("socket")
    ) {
      return "NETWORK";
    }

    // 6. CARD (remaining text-based signals; response-code-driven cases were handled in step 3)
    if (
      hasAllWords(text, ["expired", "card"]) ||
      hasAllWords(text, ["card", "expired"]) ||
      hasAllWords(text, ["invalid", "card"]) ||
      hasAllWords(text, ["card", "lost"]) ||
      hasAllWords(text, ["card", "stolen"]) ||
      hasAllWords(text, ["card", "blocked"]) ||
      hasAllWords(text, ["card", "restricted"]) ||
      hasAllWords(text, ["card", "pickup"]) ||
      hasAllWords(text, ["card", "declined"]) ||
      hasAllWords(text, ["declined", "card"]) ||
      hasAllWords(text, ["invalid", "cvv"]) ||
      hasAllWords(text, ["incorrect", "cvv"])
    ) {
      return "CARD";
    }

    // 7. CUSTOMER_ACTION_REQUIRED
    if (
      hasAllWords(text, ["customer", "action", "required"]) ||
      hasAllWords(text, ["mandate", "pending"]) ||
      hasAllWords(text, ["consent", "required"]) ||
      hasAllWords(text, ["user", "cancelled"]) ||
      hasAllWords(text, ["customer", "cancelled"]) ||
      hasAllWords(text, ["payment", "cancelled"]) ||
      hasAllWords(text, ["cancelled", "by", "user"]) ||
      hasAllWords(text, ["user", "dropped"]) ||
      hasAllWords(text, ["invalid", "vpa"]) ||
      hasAllWords(text, ["collect", "request", "expired"])
    ) {
      return "CUSTOMER_ACTION_REQUIRED";
    }

    // 8. PROVIDER — requires specific gateway/processor evidence, not a bare
    // "provider"/"error" combination (too generic; would misfire on ambiguous
    // messages such as "unknown provider error").
    if (
      evidence.source === "gateway" ||
      evidence.source === "business" ||
      hasAnyPhrase(text, [
        "gateway error",
        "processor error",
        "internal gateway error",
        "acquirer down",
        "route not found",
      ]) ||
      hasAllWords(text, ["provider", "unavailable"]) ||
      hasAllWords(text, ["gateway", "outage"]) ||
      (evidence.code || "").toUpperCase() === "GATEWAY_ERROR" ||
      (evidence.code || "").toUpperCase() === "SERVER_ERROR"
    ) {
      return "PROVIDER";
    }

    // 9. TEMPORARY — explicit transient/temporary wording not tied to a more specific category
    if (
      hasAnyPhrase(text, [
        "temporary",
        "transient",
        "retry later",
        "try again later",
        "system busy",
        "throttled",
      ])
    ) {
      return "TEMPORARY";
    }

    // 10. Default: UNKNOWN — insufficient evidence to safely classify. Do not guess.
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
   * Determines whether the failure is temporary or permanent using evidence first,
   * falling back to a category-inherent default only when no specific evidence exists.
   *
   * Precedence:
   *   1. Explicit PERMANENT evidence always wins, even over a category that would
   *      otherwise default to TEMPORARY.
   *   2. Explicit TEMPORARY evidence wins over a generic UNKNOWN default.
   *   3. Category-inherent default (e.g. NETWORK failures are transient by nature).
   *   4. UNKNOWN — no guessing.
   */
  private resolveClassification(
    category: FailureCategory,
    evidence: FailureEvidence
  ): {
    classification: FailureClassification;
    isTemporary: boolean | null;
    explanation: string;
  } {
    const text = this.combinedEvidenceText(evidence);

    const permanentRule = PERMANENT_RULES.find((rule) => rule.matches(text, evidence));
    if (permanentRule) {
      return { classification: "PERMANENT", isTemporary: false, explanation: permanentRule.explanation };
    }

    const temporaryRule = TEMPORARY_RULES.find((rule) => rule.matches(text, evidence));
    if (temporaryRule) {
      return { classification: "TEMPORARY", isTemporary: true, explanation: temporaryRule.explanation };
    }

    // No specific evidence in the raw code/message/reason/source/step. Fall back
    // to what the category itself inherently implies — never a guess beyond that.
    switch (category) {
      case "NETWORK":
      case "INSUFFICIENT_FUNDS":
      case "AUTHENTICATION":
      case "CUSTOMER_ACTION_REQUIRED":
        return {
          classification: "TEMPORARY",
          isTemporary: true,
          explanation: `The ${category} category is inherently transient (pending retry or customer action) absent evidence of a permanent condition.`,
        };

      case "PROVIDER":
        // Provider/gateway-side failures are treated as transient by default in
        // this system: a gateway-attributed error without further evidence is
        // assumed to be a retryable processing blip, not a permanent block.
        return {
          classification: "TEMPORARY",
          isTemporary: true,
          explanation:
            "The failure was attributed to the payment provider/gateway without evidence of a permanent block, which is treated as a transient processing issue.",
        };

      case "TEMPORARY":
        return {
          classification: "TEMPORARY",
          isTemporary: true,
          explanation: "The failure was categorized as transient.",
        };

      case "CARD":
      case "BANK":
      case "UNKNOWN":
      default:
        return {
          classification: "UNKNOWN",
          isTemporary: null,
          explanation:
            "No conclusive evidence of a temporary or permanent condition was found for this failure; classification is deferred rather than guessed.",
        };
    }
  }
}
