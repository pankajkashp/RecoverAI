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
import { DemoRecoveryAdapter, RazorpayRecoveryAdapter } from "@recoverai/integrations";
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

export class TenantIsolationError extends Error {
  readonly code = "TENANT_ISOLATION_VIOLATION";
  constructor(message: string = "Cross-tenant access is strictly prohibited") {
    super(message);
    this.name = "TenantIsolationError";
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
   * @param callerCompanyId Optional authenticated tenant company context.
   */
  async executeRecovery(
    rawRequest: unknown,
    callerCompanyId?: string
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

    // 3. Tenant Isolation Check: Verify company ownership
    if (callerCompanyId && payment.companyId !== callerCompanyId) {
      throw new TenantIsolationError(
        `Tenant isolation violation: payment event '${payment.id}' belongs to company '${payment.companyId}', not '${callerCompanyId}'`
      );
    }

    // 4. Execution Eligibility Check
    // Only RETRY_PAYMENT is eligible for execution
    if (action !== "RETRY_PAYMENT") {
      throw new IneligibleRecoveryError(action);
    }

    // 5. Idempotency Check: Prevent duplicate executions for the same payment event or business transaction
    if (payment.businessTransactionId) {
      const businessTransaction = await this.db.businessTransaction.findUnique({
        where: { id: payment.businessTransactionId },
      });

      if (
        businessTransaction &&
        (businessTransaction.status === "SUCCESSFUL" ||
          businessTransaction.status === "RECOVERED")
      ) {
        // Look for any existing recovery attempt for this business transaction or payment
        const existingTxAttempt = await this.db.recoveryAttempt.findFirst({
          where: {
            OR: [
              { paymentEventId: payment.id },
              { paymentEvent: { businessTransactionId: payment.businessTransactionId } },
            ],
          },
          include: { outcome: true },
          orderBy: { createdAt: "desc" },
        });

        // Persist SUCCESSFUL status and outcome to PostgreSQL
        if (
          existingTxAttempt &&
          (!existingTxAttempt.outcome ||
            existingTxAttempt.outcome.outcome !== "SUCCESSFUL" ||
            existingTxAttempt.status !== "SUCCESSFUL")
        ) {
          const { attempt, outcome } = await this.db.$transaction(async (tx) => {
            const updAttempt = await tx.recoveryAttempt.update({
              where: { id: existingTxAttempt.id },
              data: {
                status: "SUCCESSFUL",
                completedAt: new Date(),
              },
            });

            const recOutcome = await tx.recoveryOutcome.upsert({
              where: { recoveryAttemptId: existingTxAttempt.id },
              create: {
                recoveryAttemptId: existingTxAttempt.id,
                paymentEventId: existingTxAttempt.paymentEventId,
                outcome: "SUCCESSFUL",
                actualRecoveredAmount: businessTransaction.amount,
                outcomeTimestamp: new Date(),
                notes: `Recovery confirmed via settled transaction (${businessTransaction.id}).`,
              },
              update: {
                outcome: "SUCCESSFUL",
                actualRecoveredAmount: businessTransaction.amount,
                outcomeTimestamp: new Date(),
                notes: `Recovery confirmed via settled transaction (${businessTransaction.id}).`,
              },
            });

            await tx.businessTransaction.update({
              where: { id: businessTransaction.id },
              data: {
                status: "RECOVERED",
                recoveryAttribution: "RECOVERAI",
              },
            });

            await tx.recoveryRecommendation.update({
              where: { id: recommendation.id },
              data: { status: "EXECUTED" },
            });

            return { attempt: updAttempt, outcome: recOutcome };
          });

          return {
            status: "ALREADY_EXECUTED",
            isExecuted: false,
            recoveryAttemptId: attempt.id,
            recoveryOutcomeId: outcome.id,
            paymentEventId: payment.id,
            recommendationId: recommendation.id,
            recommendationAction: action,
            attemptStatus: attempt.status,
            outcomeStatus: outcome.outcome,
            actualRecoveredAmount:
              outcome.actualRecoveredAmount?.toString() ??
              businessTransaction.amount.toString(),
            estimatedRecoverableAmount:
              assessment?.estimatedRecoverableAmount?.toString() ?? null,
            isDemoSandbox: true,
            message:
              "Business transaction has already been successfully recovered. Existing attempt confirmed and preserved in database.",
            checkoutUrl: attempt.checkoutUrl,
            providerReference: attempt.providerReference,
          };
        } else if (existingTxAttempt) {
          return {
            status: "ALREADY_EXECUTED",
            isExecuted: false,
            recoveryAttemptId: existingTxAttempt.id,
            recoveryOutcomeId: existingTxAttempt.outcome?.id,
            paymentEventId: payment.id,
            recommendationId: recommendation.id,
            recommendationAction: action,
            attemptStatus: existingTxAttempt.status,
            outcomeStatus: existingTxAttempt.outcome?.outcome ?? "SUCCESSFUL",
            actualRecoveredAmount:
              existingTxAttempt.outcome?.actualRecoveredAmount?.toString() ??
              businessTransaction.amount.toString(),
            estimatedRecoverableAmount:
              assessment?.estimatedRecoverableAmount?.toString() ?? null,
            isDemoSandbox: true,
            message:
              "Business transaction has already been successfully recovered. Existing state preserved (idempotent).",
            checkoutUrl: existingTxAttempt.checkoutUrl,
            providerReference: existingTxAttempt.providerReference,
          };
        }

        // If no attempt existed, persist new successful attempt and outcome
        const { attempt, outcome } = await this.db.$transaction(async (tx) => {
          const createdAttempt = await tx.recoveryAttempt.create({
            data: {
              paymentEventId: payment.id,
              status: "SUCCESSFUL",
              attemptedAt: new Date(),
              completedAt: new Date(),
            },
          });

          const recOutcome = await tx.recoveryOutcome.create({
            data: {
              recoveryAttemptId: createdAttempt.id,
              paymentEventId: payment.id,
              outcome: "SUCCESSFUL",
              actualRecoveredAmount: businessTransaction.amount,
              outcomeTimestamp: new Date(),
              notes: `Recovery confirmed via settled transaction (${businessTransaction.id}).`,
            },
          });

          await tx.businessTransaction.update({
            where: { id: businessTransaction.id },
            data: {
              status: "RECOVERED",
              recoveryAttribution: "RECOVERAI",
            },
          });

          await tx.recoveryRecommendation.update({
            where: { id: recommendation.id },
            data: { status: "EXECUTED" },
          });

          return { attempt: createdAttempt, outcome: recOutcome };
        });

        return {
          status: "ALREADY_EXECUTED",
          isExecuted: false,
          recoveryAttemptId: attempt.id,
          recoveryOutcomeId: outcome.id,
          paymentEventId: payment.id,
          recommendationId: recommendation.id,
          recommendationAction: action,
          attemptStatus: attempt.status,
          outcomeStatus: outcome.outcome,
          actualRecoveredAmount:
            outcome.actualRecoveredAmount?.toString() ??
            businessTransaction.amount.toString(),
          estimatedRecoverableAmount:
            assessment?.estimatedRecoverableAmount?.toString() ?? null,
          isDemoSandbox: true,
          message:
            "Business transaction has already been successfully recovered. Recovery attempt persisted to database.",
          checkoutUrl: null,
          providerReference: null,
        };
      }

      // Check if an open recovery attempt already exists for this business transaction
      const existingTxAttempt = await this.db.recoveryAttempt.findFirst({
        where: {
          paymentEvent: { businessTransactionId: payment.businessTransactionId },
          status: "ATTEMPTED",
        },
        include: { outcome: true },
        orderBy: { createdAt: "desc" },
      });

      if (existingTxAttempt) {
        return {
          status: "ALREADY_EXECUTED",
          isExecuted: false,
          recoveryAttemptId: existingTxAttempt.id,
          recoveryOutcomeId: existingTxAttempt.outcome?.id,
          paymentEventId: payment.id,
          recommendationId: recommendation.id,
          recommendationAction: action,
          attemptStatus: existingTxAttempt.status,
          outcomeStatus: existingTxAttempt.outcome
            ? existingTxAttempt.outcome.outcome
            : "NOT_ATTEMPTED",
          actualRecoveredAmount:
            existingTxAttempt.outcome?.actualRecoveredAmount?.toString() ?? null,
          estimatedRecoverableAmount:
            assessment?.estimatedRecoverableAmount?.toString() ?? null,
          isDemoSandbox: true,
          message:
            "Recovery is already pending for this business transaction. Existing attempt preserved (idempotent).",
          checkoutUrl: existingTxAttempt.checkoutUrl,
          providerReference: existingTxAttempt.providerReference,
        };
      }
    }

    const existingAttempt = await this.db.recoveryAttempt.findFirst({
      where: { paymentEventId: payment.id },
      include: { outcome: true },
      orderBy: { createdAt: "desc" },
    });

    if (
      existingAttempt &&
      existingAttempt.status !== "NOT_ATTEMPTED"
    ) {
      return {
        status: "ALREADY_EXECUTED",
        isExecuted: false,
        recoveryAttemptId: existingAttempt.id,
        recoveryOutcomeId: existingAttempt.outcome?.id,
        paymentEventId: payment.id,
        recommendationId: recommendation.id,
        recommendationAction: action,
        attemptStatus: existingAttempt.status,
        outcomeStatus: existingAttempt.outcome ? existingAttempt.outcome.outcome : "NOT_ATTEMPTED",
        actualRecoveredAmount:
          existingAttempt.outcome?.actualRecoveredAmount?.toString() ?? null,
        estimatedRecoverableAmount:
          assessment?.estimatedRecoverableAmount?.toString() ?? null,
        isDemoSandbox: true,
        message:
          "Recovery has already been executed for this recommendation. Existing state preserved (idempotent).",
        checkoutUrl: existingAttempt.checkoutUrl,
        providerReference: existingAttempt.providerReference,
      };
    }


    // 6. Construct Canonical Event representation for the adapter
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

    // 7. Resolve provider-appropriate recovery adapter
    let adapter = this.recoveryAdapter;
    if (payment.provider.type === "RAZORPAY") {
      adapter = new RazorpayRecoveryAdapter();
    }

    // 8. Invoke Provider Adapter
    const executionResult = await adapter.executeRecovery(
      canonicalEvent,
      recommendationContract,
      { forceOutcome: request.forceSimulationOutcome }
    );

    // 9. Persist RecoveryAttempt and conditional RecoveryOutcome in ACID transaction
    // CRITICAL TRUST INVARIANT:
    // When status === "ATTEMPTED", DO NOT create RecoveryOutcome or credit actualRecoveredAmount.
    // Outcome is ONLY created when provider confirmation webhook arrives or forced in simulation.
    const { attempt, outcome } = await this.db.$transaction(
      async (tx) => {
        // Create RecoveryAttempt (stores provider reference & checkout link if available)
        const isImmediateFinal =
          executionResult.status === "SUCCESSFUL" ||
          executionResult.status === "FAILED" ||
          executionResult.status === "CANCELLED" ||
          executionResult.status === "EXPIRED" ||
          executionResult.status === "UNKNOWN";


        const createdAttempt = await tx.recoveryAttempt.create({
          data: {
            paymentEventId: payment.id,
            status: executionResult.status,
            providerReference: executionResult.attemptReference || null,
            checkoutUrl: (executionResult.rawResponse?.checkoutUrl as string) || null,
            metadata: executionResult.rawResponse
              ? (executionResult.rawResponse as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            attemptedAt: new Date(),
            completedAt: isImmediateFinal ? executionResult.outcomeTimestamp : null,
          },
        });

        // Only create outcome if immediately final (e.g. simulated test run with forceOutcome)
        let createdOutcome = null;
        if (isImmediateFinal) {
          createdOutcome = await tx.recoveryOutcome.create({
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
        }

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
      recoveryOutcomeId: outcome?.id,
      paymentEventId: payment.id,
      recommendationId: recommendation.id,
      recommendationAction: action,
      attemptStatus: attempt.status,
      outcomeStatus: outcome ? outcome.outcome : "NOT_ATTEMPTED",
      actualRecoveredAmount: outcome?.actualRecoveredAmount?.toString() ?? null,
      estimatedRecoverableAmount:
        assessment?.estimatedRecoverableAmount?.toString() ?? null,
      isDemoSandbox: executionResult.isDemoSandbox,
      message: executionResult.notes || "Recovery attempt initiated. Awaiting provider confirmation.",
      checkoutUrl: attempt.checkoutUrl,
      providerReference: attempt.providerReference,
    };
  }

  /**
   * Confirms a pending recovery attempt from a verified provider webhook (e.g. Razorpay payment.captured).
   * Strictly verifies tenant context and prevents duplicate crediting (idempotency).
   */
  async confirmRecoveryFromProvider(params: {
    companyId: string;
    providerPaymentId: string;
    confirmedAmount: number;
    currency: string;
    event: string;
    recoveryAttemptId?: string;
    paymentEventId?: string;
    originalExternalPaymentId?: string;
    providerReference?: string;
    invoiceId?: string;
    orderId?: string;
    paymentLinkId?: string;
    notes?: string;
  }): Promise<{
    isRecovery: boolean;
    attemptId?: string;
    outcomeId?: string;
    status?: string;
    actualRecoveredAmount?: number | null;
    message?: string;
  }> {
    // 1. Search for matching RecoveryAttempt within company scope
    const openAttempts = await this.db.recoveryAttempt.findMany({
      where: {
        paymentEvent: { companyId: params.companyId },
      },
      include: {
        paymentEvent: true,
        outcome: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let matchedAttempt = openAttempts.find((att) => {
      if (params.recoveryAttemptId && att.id === params.recoveryAttemptId) return true;
      if (
        params.paymentEventId &&
        (att.paymentEventId === params.paymentEventId ||
          att.paymentEvent.externalPaymentId === params.paymentEventId)
      ) {
        return true;
      }
      if (
        params.originalExternalPaymentId &&
        att.paymentEvent.externalPaymentId === params.originalExternalPaymentId
      ) {
        return true;
      }
      if (
        params.providerReference &&
        att.providerReference &&
        att.providerReference === params.providerReference
      ) {
        return true;
      }
      if (
        params.invoiceId &&
        att.providerReference &&
        att.providerReference === params.invoiceId
      ) {
        return true;
      }
      if (
        params.paymentLinkId &&
        att.providerReference &&
        att.providerReference === params.paymentLinkId
      ) {
        return true;
      }
      if (
        params.orderId &&
        ((att.paymentEvent.orderReference &&
          att.paymentEvent.orderReference === params.orderId) ||
          (att.metadata &&
            typeof att.metadata === "object" &&
            (att.metadata as Record<string, unknown>).orderId &&
            (att.metadata as Record<string, unknown>).orderId === params.orderId))
      ) {
        return true;
      }
      if (
        att.metadata &&
        typeof att.metadata === "object" &&
        (att.metadata as Record<string, unknown>).paymentLinkId &&
        ((params.paymentLinkId &&
          (att.metadata as Record<string, unknown>).paymentLinkId === params.paymentLinkId) ||
          (params.invoiceId &&
            (att.metadata as Record<string, unknown>).paymentLinkId === params.invoiceId))
      ) {
        return true;
      }
      return false;
    });

    // 2. If not matched in-memory and Razorpay credentials exist, verify against Razorpay API
    if (!matchedAttempt && params.providerPaymentId?.startsWith("pay_")) {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (keyId && keySecret) {
        try {
          const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
          const payRes = await fetch(
            `https://api.razorpay.com/v1/payments/${params.providerPaymentId}`,
            { headers: { Authorization: auth } }
          );
          if (payRes.ok) {
            const payData = (await payRes.json()) as {
              invoice_id?: string;
              notes?: Record<string, unknown>;
              description?: string;
            };

            if (payData.invoice_id) {
              matchedAttempt = openAttempts.find(
                (att) => att.providerReference && att.providerReference === payData.invoice_id
              );
            }

            if (!matchedAttempt && payData.notes && typeof payData.notes === "object") {
              const recId = payData.notes.recoveryAttemptId as string | undefined;
              const origId = (payData.notes.originalExternalPaymentId ||
                payData.notes.paymentEventId) as string | undefined;
              matchedAttempt = openAttempts.find(
                (att) =>
                  (recId && att.id === recId) ||
                  (origId && att.paymentEvent.externalPaymentId === origId)
              );
            }
          }

          // Check if any open attempt Payment Link shows this payment
          if (!matchedAttempt) {
            for (const att of openAttempts) {
              if (att.providerReference?.startsWith("plink_")) {
                try {
                  const linkRes = await fetch(
                    `https://api.razorpay.com/v1/payment_links/${att.providerReference}`,
                    { headers: { Authorization: auth } }
                  );
                  if (linkRes.ok) {
                    const linkData = (await linkRes.json()) as {
                      status: string;
                      payments?: Array<{ payment_id: string }> | null;
                      notes?: Record<string, unknown>;
                    };
                    const isPaidLink =
                      Array.isArray(linkData.payments) &&
                      linkData.payments.some(
                        (p) => p.payment_id === params.providerPaymentId
                      );
                    if (isPaidLink) {
                      matchedAttempt = att;
                      break;
                    }
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        } catch {
          // ignore network failure
        }
      }
    }

    if (!matchedAttempt) {
      return { isRecovery: false };
    }

    // 3. Idempotency check: verify outcome does not already exist
    if (matchedAttempt.outcome && matchedAttempt.outcome.outcome === "SUCCESSFUL") {
      return {
        isRecovery: true,
        attemptId: matchedAttempt.id,
        outcomeId: matchedAttempt.outcome.id,
        status: matchedAttempt.outcome.outcome,
        actualRecoveredAmount: Number(matchedAttempt.outcome.actualRecoveredAmount ?? 0),
        message: "Recovery already confirmed (idempotent duplicate webhook)",
      };
    }

    const isSuccess =
      params.event === "payment.captured" ||
      params.event === "order.paid" ||
      params.event === "payment_link.paid";

    const finalStatus = isSuccess ? "SUCCESSFUL" : "FAILED";
    const actualAmount = isSuccess ? params.confirmedAmount : 0;

    // 4. Atomically persist confirmed outcome and update attempt status
    const result = await this.db.$transaction(async (tx) => {
      // Update attempt status
      const updatedAttempt = await tx.recoveryAttempt.update({
        where: { id: matchedAttempt.id },
        data: {
          status: finalStatus,
          completedAt: new Date(),
        },
      });

      // Upsert RecoveryOutcome (in case an incomplete failure outcome existed)
      const outcome = await tx.recoveryOutcome.upsert({
        where: { recoveryAttemptId: matchedAttempt.id },
        create: {
          recoveryAttemptId: matchedAttempt.id,
          paymentEventId: matchedAttempt.paymentEventId,
          outcome: finalStatus,
          actualRecoveredAmount: new Prisma.Decimal(actualAmount),
          outcomeTimestamp: new Date(),
          notes:
            params.notes ||
            `Recovery confirmed via ${params.event} (Provider Ref: ${params.providerPaymentId})`,
        },
        update: {
          outcome: finalStatus,
          actualRecoveredAmount: new Prisma.Decimal(actualAmount),
          outcomeTimestamp: new Date(),
          notes:
            params.notes ||
            `Recovery confirmed via ${params.event} (Provider Ref: ${params.providerPaymentId})`,
        },
      });

      // Update parent BusinessTransaction if present
      if (isSuccess && matchedAttempt.paymentEvent.businessTransactionId) {
        await tx.businessTransaction.update({
          where: { id: matchedAttempt.paymentEvent.businessTransactionId },
          data: {
            status: "RECOVERED",
            recoveryAttribution: "RECOVERAI",
          },
        });
      }

      return { attempt: updatedAttempt, outcome };
    }, {
      timeout: 30000,
      maxWait: 15000,
    });



    return {
      isRecovery: true,
      attemptId: result.attempt.id,
      outcomeId: result.outcome.id,
      status: result.outcome.outcome,
      actualRecoveredAmount: Number(result.outcome.actualRecoveredAmount ?? 0),
      message: `Recovery ${finalStatus.toLowerCase()} successfully recorded.`,
    };
  }
}

