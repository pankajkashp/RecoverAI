/**
 * RecoverAI — Recovery Decision Validation Service
 *
 * Proves whether recovery decisions are correct using actual observed outcomes
 * (provider-confirmed RecoveryOutcome + BusinessTransaction.recoveryAttribution)
 * rather than synthetic assumptions.
 *
 * Ground truth boundary (see docs/recovery-decision-validation.md for the full
 * explanation):
 *   - A RecoveryRecommendation is a PREDICTION, not an outcome.
 *   - A RecoveryAttempt with status ATTEMPTED is NOT proof of recovery — it is
 *     only proof that a retry was initiated. It has no RecoveryOutcome yet.
 *   - Only a RecoveryOutcome (created exclusively from a verified provider
 *     webhook, or an explicit test simulation) is proof of what actually
 *     happened to money.
 *   - A successful payment is only a RecoverAI recovery when
 *     BusinessTransaction.recoveryAttribution === "RECOVERAI". A successful
 *     payment with attribution CUSTOMER or NONE must never be counted as a
 *     RecoverAI recovery, no matter how "close" it looks.
 *
 * This service does not alter payment correlation logic, recovery execution,
 * deterministic recovery rules, or the ML architecture. It only reads already
 * persisted, already-decided data and compares recommendation to outcome.
 */

import type { PrismaClient } from "@prisma/client";
import type {
  RecoveryAction,
  RecoveryWorthiness,
  RecoveryAttemptStatus,
  RecoveryAttribution,
  BusinessTransactionStatus,
} from "@recoverai/contracts";
import { prisma as defaultPrisma } from "../lib/prisma.js";

// ============================================================================
// Case model — one normalized row per (payment event, recommendation) pair.
// ============================================================================

/**
 * A single payment's recommendation-to-outcome case, normalized from whatever
 * source produced it (real database rows, or hand-built data in tests).
 *
 * `mlUsed`/`mlProbability` are `boolean | null` / `number | null` — `null`
 * means "unknown", not "false". As of this implementation, RecoveryRecommendation
 * does not persist mlUsed/ruleSource/mlProbability (see docs), so every case
 * loaded from the database will have `mlUsed: null`. Only callers who supply
 * this data explicitly (e.g. directly from a fresh RecoveryRecommendationResult)
 * can produce a case with a known mlUsed value.
 */
export interface RecoveryDecisionCase {
  paymentEventId: string;
  recommendationAction: RecoveryAction | null;
  worthiness: RecoveryWorthiness | null;
  estimatedRecoverableAmount: number | null;
  /** Status of the most recent RecoveryAttempt for this payment, or null if never attempted. */
  latestAttemptStatus: RecoveryAttemptStatus | null;
  /** Status of the confirmed RecoveryOutcome for that attempt, or null if not yet confirmed. */
  outcomeStatus: RecoveryAttemptStatus | null;
  /** Only meaningful when outcomeStatus is set — the provider-confirmed amount. */
  actualRecoveredAmount: number | null;
  /** From BusinessTransaction.recoveryAttribution — distinguishes RecoverAI-driven recovery from unrelated/manual payment. */
  recoveryAttribution: RecoveryAttribution | null;
  businessTransactionStatus: BusinessTransactionStatus | null;
  mlUsed: boolean | null;
  mlProbability: number | null;
}

/**
 * The mutually exclusive class each case is placed into. Only classes ending
 * in _SUCCESS or _FAILURE represent resolved ground truth; everything else is
 * either not yet decided, not applicable to recovery, or an integrity problem.
 */
export type ObservedOutcomeClass =
  | "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
  | "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE"
  | "RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED"
  | "RECOMMENDED_RECOVER_NOT_ATTEMPTED"
  | "RECOMMENDED_DO_NOT_RECOVER"
  | "RECOMMENDED_REVIEW"
  | "CUSTOMER_ACTION_REQUIRED"
  | "ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER"
  | "NO_RECOMMENDATION";

const TERMINAL_NON_SUCCESS_OUTCOMES: ReadonlySet<RecoveryAttemptStatus> = new Set([
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

/**
 * Classifies a single case against actual observed evidence. Pure function —
 * no I/O, no randomness, fully deterministic and independently testable.
 */
export function classifyRecoveryDecisionCase(
  c: RecoveryDecisionCase
): ObservedOutcomeClass {
  if (c.recommendationAction === "DO_NOT_RECOVER") {
    if (c.latestAttemptStatus && c.latestAttemptStatus !== "NOT_ATTEMPTED") {
      // Safety-rule violation: DO_NOT_RECOVER must never be executed.
      return "ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER";
    }
    return "RECOMMENDED_DO_NOT_RECOVER";
  }

  if (c.recommendationAction === "REVIEW") {
    return "RECOMMENDED_REVIEW";
  }

  if (c.recommendationAction === "CUSTOMER_ACTION_REQUIRED") {
    return "CUSTOMER_ACTION_REQUIRED";
  }

  if (c.recommendationAction === "RETRY_PAYMENT") {
    // Ground truth for "this was actually recovered" requires BOTH a
    // provider-confirmed SUCCESSFUL outcome AND RecoverAI attribution. A
    // successful payment that isn't attributed to RecoverAI (e.g. the
    // customer paid independently, or an unrelated payment happened to
    // settle the business transaction) must never be counted as a recovery.
    if (c.outcomeStatus === "SUCCESSFUL") {
      return c.recoveryAttribution === "RECOVERAI"
        ? "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
        : "RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED";
    }

    if (c.outcomeStatus && TERMINAL_NON_SUCCESS_OUTCOMES.has(c.outcomeStatus)) {
      return "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE";
    }

    // outcomeStatus is null (never confirmed) or "UNKNOWN" (provider response
    // was itself inconclusive) — a retry being attempted or even in-flight is
    // NOT proof of recovery. Do not guess a result.
    if (c.latestAttemptStatus && c.latestAttemptStatus !== "NOT_ATTEMPTED") {
      return "RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED";
    }

    return "RECOMMENDED_RECOVER_NOT_ATTEMPTED";
  }

  return "NO_RECOMMENDATION";
}

// ============================================================================
// Report model
// ============================================================================

export interface RateMetric {
  numerator: number;
  denominator: number;
  /** null when denominator is 0 — never report a fabricated 0% or 100%. */
  value: number | null;
  insufficientData: boolean;
  note: string;
}

export interface RecoveryValidationReport {
  generatedAt: string;
  totalCases: number;
  classCounts: Record<ObservedOutcomeClass, number>;

  /** Among RECOVER recommendations with a resolved (confirmed) outcome, how many actually recovered. */
  recoveryDecisionPrecision: RateMetric;
  /** Among recovery attempts that reached a terminal provider-confirmed state, how many succeeded. */
  recoverySuccessRate: RateMetric;
  /** RECOVER recommendations that were provider-confirmed as failed, among resolved RECOVER cases. */
  falseRecoveryRecommendationRate: RateMetric;
  /** Sum of actualRecoveredAmount for provider-confirmed, RecoverAI-attributed successes only. */
  actualRecoveredAmount: {
    total: number;
    confirmedCaseCount: number;
    note: string;
  };
  /** Comparison of estimated vs. actual, computed only over cases with a resolved outcome and a stored estimate. */
  estimatedVsActual: {
    comparableCaseCount: number;
    totalEstimated: number;
    totalActual: number;
    meanAbsoluteDeviation: number | null;
    insufficientData: boolean;
    note: string;
  };
  /** Percentage of recommended (non-null-action) cases sent to REVIEW. */
  reviewRate: RateMetric;
  /** Deterministic-only vs ML-assisted decision precision, computed separately — never combined. */
  mlAssisted: {
    mlTrackingAvailable: boolean;
    deterministic: RateMetric;
    mlAssisted: RateMetric;
    note: string;
  };
  /** Cases where a DO_NOT_RECOVER recommendation was nonetheless attempted — should always be empty. */
  anomalies: {
    count: number;
    paymentEventIds: string[];
  };
  groundTruthNote: string;
}

function emptyRateMetric(note: string): RateMetric {
  return { numerator: 0, denominator: 0, value: null, insufficientData: true, note };
}

function rateMetric(numerator: number, denominator: number, note: string): RateMetric {
  if (denominator === 0) {
    return { numerator, denominator, value: null, insufficientData: true, note };
  }
  return {
    numerator,
    denominator,
    value: numerator / denominator,
    insufficientData: false,
    note,
  };
}

const ALL_CLASSES: ObservedOutcomeClass[] = [
  "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS",
  "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE",
  "RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED",
  "RECOMMENDED_RECOVER_NOT_ATTEMPTED",
  "RECOMMENDED_DO_NOT_RECOVER",
  "RECOMMENDED_REVIEW",
  "CUSTOMER_ACTION_REQUIRED",
  "ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER",
  "NO_RECOMMENDATION",
];

/**
 * Aggregates a set of cases into the full validation report. Pure function —
 * every number here is traceable back to `classifyRecoveryDecisionCase`.
 */
export function buildRecoveryValidationReport(
  cases: RecoveryDecisionCase[]
): RecoveryValidationReport {
  const classCounts = Object.fromEntries(
    ALL_CLASSES.map((c) => [c, 0])
  ) as Record<ObservedOutcomeClass, number>;

  const anomalies: string[] = [];

  for (const c of cases) {
    const cls = classifyRecoveryDecisionCase(c);
    classCounts[cls] += 1;
    if (cls === "ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER") {
      anomalies.push(c.paymentEventId);
    }
  }

  const confirmedSuccess = classCounts.RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS;
  const confirmedFailure = classCounts.RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE;
  const resolvedRecoverDenominator = confirmedSuccess + confirmedFailure;

  const recoveryDecisionPrecision = rateMetric(
    confirmedSuccess,
    resolvedRecoverDenominator,
    "Among RECOVER recommendations with a provider-confirmed outcome (success or failure), the fraction that actually recovered. Unresolved/pending attempts are excluded, not counted as failures."
  );

  const falseRecoveryRecommendationRate = rateMetric(
    confirmedFailure,
    resolvedRecoverDenominator,
    "Among RECOVER recommendations with a provider-confirmed outcome, the fraction that were confirmed NOT to have recovered."
  );

  const terminalOutcomeCases = cases.filter(
    (c) => c.outcomeStatus === "SUCCESSFUL" || (c.outcomeStatus && TERMINAL_NON_SUCCESS_OUTCOMES.has(c.outcomeStatus))
  );
  const successfulOutcomeCases = terminalOutcomeCases.filter((c) => c.outcomeStatus === "SUCCESSFUL");
  const recoverySuccessRate = rateMetric(
    successfulOutcomeCases.length,
    terminalOutcomeCases.length,
    "Among recovery attempts that reached a provider-confirmed terminal state (successful, failed, cancelled, or expired), the fraction confirmed successful."
  );

  const actualRecoveredCases = cases.filter(
    (c) => c.outcomeStatus === "SUCCESSFUL" && c.recoveryAttribution === "RECOVERAI"
  );
  const actualRecoveredTotal = actualRecoveredCases.reduce(
    (sum, c) => sum + (c.actualRecoveredAmount ?? 0),
    0
  );
  const actualRecoveredAmount = {
    total: actualRecoveredTotal,
    confirmedCaseCount: actualRecoveredCases.length,
    note: "Sum of actualRecoveredAmount from provider-confirmed SUCCESSFUL outcomes attributed to RecoverAI (recoveryAttribution === 'RECOVERAI') only. Retry links generated/clicked, vendor claims, and non-RecoverAI-attributed successful payments are excluded.",
  };

  const estimatedVsActualCases = cases.filter(
    (c) =>
      c.estimatedRecoverableAmount !== null &&
      (c.outcomeStatus === "SUCCESSFUL" ||
        (c.outcomeStatus && TERMINAL_NON_SUCCESS_OUTCOMES.has(c.outcomeStatus)))
  );
  const totalEstimated = estimatedVsActualCases.reduce(
    (sum, c) => sum + (c.estimatedRecoverableAmount ?? 0),
    0
  );
  const totalActual = estimatedVsActualCases.reduce(
    (sum, c) => sum + (c.outcomeStatus === "SUCCESSFUL" ? c.actualRecoveredAmount ?? 0 : 0),
    0
  );
  const meanAbsoluteDeviation =
    estimatedVsActualCases.length > 0
      ? estimatedVsActualCases.reduce((sum, c) => {
          const actual = c.outcomeStatus === "SUCCESSFUL" ? c.actualRecoveredAmount ?? 0 : 0;
          return sum + Math.abs((c.estimatedRecoverableAmount ?? 0) - actual);
        }, 0) / estimatedVsActualCases.length
      : null;

  const estimatedVsActual = {
    comparableCaseCount: estimatedVsActualCases.length,
    totalEstimated,
    totalActual,
    meanAbsoluteDeviation,
    insufficientData: estimatedVsActualCases.length === 0,
    note: "Computed only over cases with both a stored estimatedRecoverableAmount and a provider-confirmed terminal outcome (actual = confirmed amount for success, 0 for confirmed failure/cancelled/expired). Pending/unresolved cases are excluded because their actual value is not yet known.",
  };

  const recommendedCases = cases.filter((c) => c.recommendationAction !== null);
  const reviewRate = rateMetric(
    classCounts.RECOMMENDED_REVIEW,
    recommendedCases.length,
    "Percentage of cases that received a recommendation and were sent to REVIEW (ambiguous / not automatically actioned)."
  );

  const mlTrackingAvailable = cases.some((c) => c.mlUsed !== null);
  const mlAssistedNote = mlTrackingAvailable
    ? "Precision computed separately for deterministic-only and ML-assisted RECOVER recommendations that reached a provider-confirmed outcome. These are never combined into one number."
    : "mlUsed is not known (null) for any case in this dataset. RecoveryRecommendation does not currently persist mlUsed/mlProbability/ruleSource, so ML-assisted performance cannot be separated from deterministic performance using database-sourced data. See docs/recovery-decision-validation.md.";

  const deterministicResolved = cases.filter(
    (c) =>
      c.mlUsed === false &&
      (classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS" ||
        classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE")
  );
  const mlAssistedResolved = cases.filter(
    (c) =>
      c.mlUsed === true &&
      (classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS" ||
        classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE")
  );

  const mlAssisted = {
    mlTrackingAvailable,
    deterministic: mlTrackingAvailable
      ? rateMetric(
          deterministicResolved.filter(
            (c) => classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
          ).length,
          deterministicResolved.length,
          "Precision of RECOVER recommendations made without ML assistance (mlUsed === false), among resolved cases."
        )
      : emptyRateMetric("Not computable: mlUsed is not tracked for this dataset."),
    mlAssisted: mlTrackingAvailable
      ? rateMetric(
          mlAssistedResolved.filter(
            (c) => classifyRecoveryDecisionCase(c) === "RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS"
          ).length,
          mlAssistedResolved.length,
          "Precision of RECOVER recommendations where an ML prediction was used as a supporting signal (mlUsed === true), among resolved cases."
        )
      : emptyRateMetric("Not computable: mlUsed is not tracked for this dataset."),
    note: mlAssistedNote,
  };

  return {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    classCounts,
    recoveryDecisionPrecision,
    recoverySuccessRate,
    falseRecoveryRecommendationRate,
    actualRecoveredAmount,
    estimatedVsActual,
    reviewRate,
    mlAssisted,
    anomalies: { count: anomalies.length, paymentEventIds: anomalies },
    groundTruthNote:
      "Ground truth for a successful recovery requires BOTH a RecoveryOutcome with outcome === 'SUCCESSFUL' created from a verified provider webhook (or explicit test simulation) AND BusinessTransaction.recoveryAttribution === 'RECOVERAI'. A generated/clicked retry link, an attempted-but-unconfirmed retry, or a successful payment not attributed to RecoverAI are never counted as a recovery.",
  };
}

// ============================================================================
// Service — DB-backed case loading + report generation
// ============================================================================

export class RecoveryDecisionValidationService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Loads and normalizes every recommendation-bearing payment for a company
   * into RecoveryDecisionCase rows, joining the current state of its most
   * recent recovery attempt, that attempt's confirmed outcome (if any), and
   * the owning business transaction's attribution.
   *
   * mlUsed/mlProbability are always null here: RecoveryRecommendation does
   * not persist that information today (see class docs and
   * docs/recovery-decision-validation.md).
   */
  async loadCasesForCompany(
    companyId?: string,
    options?: { since?: Date }
  ): Promise<RecoveryDecisionCase[]> {
    const recommendations = await this.db.recoveryRecommendation.findMany({
      where: options?.since
        ? {
            paymentEvent: {
              eventTimestamp: { gte: options.since },
            },
          }
        : undefined,
      include: {
        paymentEvent: {
          include: {
            assessment: true,
            businessTransaction: true,
            attempts: {
              include: { outcome: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    return recommendations.map((row): RecoveryDecisionCase => {
      const latestAttempt = row.paymentEvent.attempts[0] ?? null;
      const outcome = latestAttempt?.outcome ?? null;

      return {
        paymentEventId: row.paymentEventId,
        recommendationAction: row.action as RecoveryAction,
        worthiness: row.paymentEvent.assessment?.worthiness ?? null,
        estimatedRecoverableAmount:
          row.paymentEvent.assessment?.estimatedRecoverableAmount != null
            ? Number(row.paymentEvent.assessment.estimatedRecoverableAmount)
            : null,
        latestAttemptStatus: latestAttempt?.status ?? null,
        outcomeStatus: outcome?.outcome ?? null,
        actualRecoveredAmount:
          outcome?.actualRecoveredAmount != null ? Number(outcome.actualRecoveredAmount) : null,
        recoveryAttribution: row.paymentEvent.businessTransaction?.recoveryAttribution ?? null,
        businessTransactionStatus: row.paymentEvent.businessTransaction?.status ?? null,
        mlUsed: null,
        mlProbability: null,
      };
    });
  }

  async generateValidationReport(
    companyId?: string,
    options?: { since?: Date }
  ): Promise<RecoveryValidationReport> {
    const cases = await this.loadCasesForCompany(companyId, options);
    return buildRecoveryValidationReport(cases);
  }
}

