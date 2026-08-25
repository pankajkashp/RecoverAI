/**
 * RecoverAI — Demo / Sandbox Recovery Provider Adapter
 *
 * Phase 8: Recovery Execution & Outcome Tracking
 *
 * Simulates synthetic recovery executions through a provider-independent interface.
 * All executions performed by this adapter are explicitly DEMO / SYNTHETIC data.
 *
 * STRICT SAFETY RULES:
 * 1. NEVER calls external payment provider APIs (Razorpay, Stripe, PayPal).
 * 2. NEVER charges real payment instruments or contacts customers.
 * 3. Clearly flags all results as `isDemoSandbox: true`.
 * 4. Generates deterministic/reproducible outcomes for testing.
 */

import {
  CanonicalPaymentEvent,
  IRecoveryProviderAdapter,
  RecoveryAttemptStatus,
  RecoveryExecutionResult,
  RecoveryExecutionResultSchema,
  RecoveryRecommendationResult,
} from "@recoverai/contracts";

export class DemoRecoveryAdapter implements IRecoveryProviderAdapter {
  readonly providerType = "DEMO" as const;

  /**
   * Executes a synthetic recovery attempt in a sandbox environment.
   *
   * @param event          The canonical payment event to recover.
   * @param recommendation The recovery recommendation being acted upon.
   * @param options        Optional simulation overrides (e.g. force outcome in tests).
   */
  async executeRecovery(
    event: CanonicalPaymentEvent,
    recommendation: RecoveryRecommendationResult,
    options?: { forceOutcome?: RecoveryAttemptStatus }
  ): Promise<RecoveryExecutionResult> {
    const outcomeTimestamp = new Date();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const attemptReference = `demo_rec_att_${randomSuffix}`;

    // 1. Determine simulated outcome status
    let status: RecoveryAttemptStatus;
    let actualRecoveredAmount: number | null = null;
    let notes = "";

    if (options?.forceOutcome) {
      status = options.forceOutcome;
    } else if (
      event.metadata &&
      typeof (event.metadata as Record<string, unknown>).simulationOutcome === "string"
    ) {
      status = (event.metadata as Record<string, unknown>).simulationOutcome as RecoveryAttemptStatus;
    } else {
      // Default deterministic behavior:
      // If recommendation is RETRY_PAYMENT and failure category is temporary, simulate SUCCESSFUL
      // Otherwise provide a deterministic simulated outcome
      status = "SUCCESSFUL";
    }

    // 2. Configure recovered amount and notes per outcome
    switch (status) {
      case "SUCCESSFUL": {
        actualRecoveredAmount = event.amount;
        notes = `[DEMO/SANDBOX] Synthetic recovery succeeded. Recovered full amount of ${event.currency} ${event.amount} via simulated payment retry.`;
        break;
      }
      case "FAILED": {
        actualRecoveredAmount = 0;
        notes = `[DEMO/SANDBOX] Synthetic recovery attempt failed during simulated gateway retry. No funds recovered.`;
        break;
      }
      case "CANCELLED": {
        actualRecoveredAmount = 0;
        notes = `[DEMO/SANDBOX] Synthetic recovery attempt was cancelled prior to execution completion.`;
        break;
      }
      case "EXPIRED": {
        actualRecoveredAmount = 0;
        notes = `[DEMO/SANDBOX] Synthetic recovery attempt expired due to simulation timeout.`;
        break;
      }
      case "UNKNOWN":
      default: {
        status = "UNKNOWN";
        actualRecoveredAmount = null;
        notes = `[DEMO/SANDBOX] Synthetic recovery attempt completed with ambiguous simulation outcome.`;
        break;
      }
    }

    const isSuccess = status === "SUCCESSFUL";

    return RecoveryExecutionResultSchema.parse({
      status,
      isSuccess,
      actualRecoveredAmount,
      currency: event.currency,
      providerType: this.providerType,
      isDemoSandbox: true,
      attemptReference,
      outcomeTimestamp,
      notes,
      rawResponse: {
        adapter: "DemoRecoveryAdapter",
        simulatedAt: outcomeTimestamp.toISOString(),
        originalFailureCategory: event.failureCategory ?? "UNKNOWN",
        recommendationAction: recommendation.action,
        isDemoSandbox: true,
      },
    });
  }
}
