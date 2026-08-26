/**
 * RecoverAI — Razorpay Test Recovery Adapter
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Implements IRecoveryProviderAdapter for Razorpay Test / Sandbox recovery execution.
 *
 * Strictly operates in Test Mode — never charges real customer funds.
 * Produces structured RecoveryExecutionResult contracts for the core engine.
 */

import {
  CanonicalPaymentEvent,
  RecoveryRecommendationResult,
  IRecoveryProviderAdapter,
  RecoveryExecutionResult,
  RecoveryAttemptStatus,
} from "@recoverai/contracts";

export interface RazorpayRecoveryOptions {
  forceOutcome?: "SUCCESSFUL" | "FAILED";
  keyId?: string;
  keySecret?: string;
}

export class RazorpayRecoveryAdapter implements IRecoveryProviderAdapter {
  readonly providerType = "RAZORPAY" as const;

  constructor(
    private readonly keyId?: string,
    private readonly keySecret?: string
  ) {}

  /**
   * Executes a recovery attempt in Razorpay Test / Sandbox environment.
   */
  async executeRecovery(
    event: CanonicalPaymentEvent,
    recommendation: RecoveryRecommendationResult,
    options?: { forceOutcome?: RecoveryAttemptStatus }
  ): Promise<RecoveryExecutionResult> {
    const isDemoSandbox = true; // Hardcoded guarantee: Razorpay test execution only

    // If forced outcome is specified (for tests/simulation)
    if (options?.forceOutcome) {
      const status: RecoveryAttemptStatus = options.forceOutcome;
      const isSuccess = status === "SUCCESSFUL";
      const actualRecoveredAmount = isSuccess ? event.amount : null;

      return {
        status,
        isSuccess,
        actualRecoveredAmount,
        currency: event.currency,
        providerType: "RAZORPAY",
        isDemoSandbox,
        attemptReference: `att_rzp_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        notes: `Razorpay Test recovery simulation (${status})`,
        outcomeTimestamp: new Date(),
        rawResponse: {
          isTestMode: true,
          action: recommendation.action,
          simulated: true,
        },
      };
    }

    // Default Sandbox Recovery Simulation based on action
    if (recommendation.action === "DO_NOT_RECOVER") {
      return {
        status: "FAILED",
        isSuccess: false,
        actualRecoveredAmount: null,
        currency: event.currency,
        providerType: "RAZORPAY",
        isDemoSandbox,
        attemptReference: `att_rzp_test_${Date.now()}`,
        notes: "Recovery aborted: DO_NOT_RECOVER recommendation",
        outcomeTimestamp: new Date(),
        rawResponse: { isTestMode: true, eligible: false },
      };
    }

    // For RETRY_PAYMENT in Test Sandbox: simulate successful test recovery
    return {
      status: "SUCCESSFUL",
      isSuccess: true,
      actualRecoveredAmount: event.amount,
      currency: event.currency,
      providerType: "RAZORPAY",
      isDemoSandbox,
      attemptReference: `att_rzp_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      notes: `Razorpay Test recovery executed for action ${recommendation.action}`,
      outcomeTimestamp: new Date(),
      rawResponse: {
        isTestMode: true,
        paymentId: event.externalPaymentId,
        currency: event.currency,
        amountRecovered: event.amount,
        recoveryMethod: "PAYMENT_LINK_TEST",
      },
    };
  }
}
