/**
 * RecoverAI — Recovery Execution Service
 *
 * Phase 8: Recovery Execution & Outcome Tracking
 *
 * Core service responsible for:
 * 1. Validating recovery execution eligibility (only RETRY_PAYMENT is eligible).
 * 2. Enforcing duplicate execution protection / idempotency.
 * 3. Calling the provider-independent recovery adapter boundary (DemoRecoveryAdapter).
 * 4. Recording the RecoveryAttempt and RecoveryOutcome in PostgreSQL.
 * 5. Strictly preserving the distinction between estimated recoverable amount
 *    and actual recovered amount.
 *
 * Strictly provider-agnostic. Depends on IRecoveryProviderAdapter abstraction.
 * Executes ONLY synthetic/sandbox recoveries for Phase 8.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  CanonicalPaymentEvent,
  CanonicalPaymentEventSchema,
  IRecoveryProviderAdapter,
  RecoveryAction,
  RecoveryExecutionPipelineResult,
  RecoveryExecutionRequest,
  RecoveryExecutionRequestSchema,
  RecoveryRecommendationResult,
} from "@recoverai/contracts";
import { DemoRecoveryAdapter } from "@recoverai/integrations";
import { prisma as defaultPrisma } from "../lib/prisma.js";

export class IneligibleRecoveryError extends Error {
  readonly code = "INELIGIBLE_RECOVERY_ACTION";
  constructor(action: string) {
    super(
      `Recovery action '${action}' is not eligible for automatic execution. Only 'RETRY_PAYMENT' recommendations may be executed.`
    );
    this.name = "IneligibleRecoveryError";
  }
}

export class RecommendationNotFoundError extends Error {
  readonly code = "RECOMMENDATION_NOT_FOUND";
  constructor(identifier: string) {
    super(`Recovery recommendation not found for: '${identifier}'`);
    this.name = "RecommendationNotFoundError";
  }
}

export class RecoveryExecutionService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly recoveryAdapter: IRecoveryProviderAdapter = new DemoRecoveryAdapter()
  ) {}

  /**
   * Executes a recovery action for an eligible recommendation.
   *
   * @param rawRequest Request containing recommendationId or paymentEventId.
   */
  async executeRecovery(
    rawRequest: unknown
  ): Promise<RecoveryExecutionPipelineResult> {
    // 1. Validate request payload
    const request: RecoveryExecutionRequest =
      RecoveryExecutionRequestSchema.parse(rawRequest);

    // 2. Fetch Recommendation, associated PaymentEvent and RecoveryAssessment
    const recommendation = await this.db.recoveryRecommendation.findFirst({
      where: request.recommendationId
        ? { id: request.recommendationId }
        : { paymentEventId: request.paymentEventId },
      include: {
        paymentEvent: {
          include: {
            assessment: true,
            provider: true,
          },
        },
      },
    });

    if (!recommendation || !recommendation.paymentEvent) {
      throw new RecommendationNotFoundError(
        request.recommendationId || request.paymentEventId || "unknown"
      );
    }

    const payment = recommendation.paymentEvent;
    const assessment = payment.assessment;
    const action = recommendation.action as RecoveryAction;

    // 3. Execution Eligibility Check
    // Only RETRY_PAYMENT is eligible for execution in Phase 8
    if (action !== "RETRY_PAYMENT") {
      throw new IneligibleRecoveryError(action);
    }

    // 4. Idempotency Check: Prevent duplicate executions for the same payment event
    const existingAttempt = await this.db.recoveryAttempt.findFirst({
      where: { paymentEventId: payment.id },
      include: { outcome: true },
      orderBy: { createdAt: "desc" },
    });

    if (
      existingAttempt &&
      existingAttempt.outcome &&
      existingAttempt.status !== "NOT_ATTEMPTED"
    ) {
      return {
        status: "ALREADY_EXECUTED",
        isExecuted: false,
        recoveryAttemptId: existingAttempt.id,
        recoveryOutcomeId: existingAttempt.outcome.id,
        paymentEventId: payment.id,
        recommendationId: recommendation.id,
        recommendationAction: action,
        attemptStatus: existingAttempt.status,
        outcomeStatus: existingAttempt.outcome.outcome,
        actualRecoveredAmount:
          existingAttempt.outcome.actualRecoveredAmount?.toString() ?? null,
        estimatedRecoverableAmount:
          assessment?.estimatedRecoverableAmount?.toString() ?? null,
        isDemoSandbox: true,
        message:
          "Recovery has already been executed for this recommendation. Existing outcome preserved (idempotent).",
      };
    }

    // 5. Construct Canonical Event representation for the adapter
    const canonicalEvent: CanonicalPaymentEvent =
      CanonicalPaymentEventSchema.parse({
        externalPaymentId: payment.externalPaymentId,
        companyId: payment.companyId,
        providerId: payment.providerId,
        customerReference: payment.customerReference,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        eventType: payment.eventType,
        failureCode: payment.failureCode,
        failureMessage: payment.failureMessage,
        eventTimestamp: payment.eventTimestamp,
        metadata: (payment.metadata as Record<string, unknown>) || {},
      });

    const recommendationContract: RecoveryRecommendationResult = {
      action,
      status: (recommendation.status as unknown as import("@recoverai/contracts").RecommendationStatus) || "RECOMMENDED",
      reason: recommendation.reason || "Automatic recovery recommendation",
      confidence: recommendation.confidence,
      ruleSource: "deterministic-rules-v1",
      mlUsed: false,
      mlProbability: null,
      recommendedAt: recommendation.createdAt,
    };

    // 6. Invoke Provider-Independent Recovery Adapter (Demo sandbox)
    const executionResult = await this.recoveryAdapter.executeRecovery(
      canonicalEvent,
      recommendationContract,
      { forceOutcome: request.forceSimulationOutcome }
    );

    // 7. Persist RecoveryAttempt and RecoveryOutcome inside an ACID transaction
    const { attempt, outcome } = await this.db.$transaction(
      async (tx) => {
        // Create RecoveryAttempt
        const createdAttempt = await tx.recoveryAttempt.create({
          data: {
            paymentEventId: payment.id,
            status: executionResult.status,
            attemptedAt: new Date(),
            completedAt: executionResult.outcomeTimestamp,
          },
        });

        // Create RecoveryOutcome — stores actual recovered amount independently
        // NOTE: assessment.estimatedRecoverableAmount is NEVER modified
        const createdOutcome = await tx.recoveryOutcome.create({
          data: {
            recoveryAttemptId: createdAttempt.id,
            paymentEventId: payment.id,
            outcome: executionResult.status,
            actualRecoveredAmount:
              executionResult.actualRecoveredAmount !== null
                ? new Prisma.Decimal(executionResult.actualRecoveredAmount)
                : null,
            outcomeTimestamp: executionResult.outcomeTimestamp,
            notes: executionResult.notes,
          },
        });

        // Update recommendation status to EXECUTED
        await tx.recoveryRecommendation.update({
          where: { id: recommendation.id },
          data: {
            status: "EXECUTED",
          },
        });

        return { attempt: createdAttempt, outcome: createdOutcome };
      },
      {
        timeout: 30000,
        maxWait: 15000,
      }
    );

    return {
      status: "EXECUTED",
      isExecuted: true,
      recoveryAttemptId: attempt.id,
      recoveryOutcomeId: outcome.id,
      paymentEventId: payment.id,
      recommendationId: recommendation.id,
      recommendationAction: action,
      attemptStatus: attempt.status,
      outcomeStatus: outcome.outcome,
      actualRecoveredAmount: outcome.actualRecoveredAmount?.toString() ?? null,
      estimatedRecoverableAmount:
        assessment?.estimatedRecoverableAmount?.toString() ?? null,
      isDemoSandbox: executionResult.isDemoSandbox,
      message: "Recovery attempt executed and outcome recorded successfully.",
    };
  }
}
