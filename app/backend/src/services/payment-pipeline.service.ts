/**
 * RecoverAI — Payment Pipeline Service
 *
 * Phase 3, 4, 5 & 7: Payment Event Pipeline, Automatic Failure Analysis,
 * Recovery Intelligence & Recovery Recommendation
 *
 * Core service responsible for:
 * 1. Validating CanonicalPaymentEvents.
 * 2. Enforcing idempotency (preventing duplicate events from creating duplicate business records).
 * 3. Automatically triggering Failure Analysis for failed payments.
 * 4. Automatically generating Recovery Assessments (worthiness & estimated recoverable amount).
 * 5. Automatically generating Recovery Recommendations (Phase 7).
 * 6. Persisting payment events, failure records, recovery assessments, and recommendations in PostgreSQL.
 *
 * Strictly provider-agnostic. Operates only on CanonicalPaymentEvents.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  CanonicalPaymentEvent,
  CanonicalPaymentEventSchema,
  PaymentPipelineResult,
} from "@recoverai/contracts";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { FailureAnalysisService } from "./failure-analysis.service.js";
import { RecoveryIntelligenceService } from "./recovery-intelligence.service.js";
import { RecoveryRecommendationService } from "./recovery-recommendation.service.js";

export class PaymentPipelineService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly failureAnalysisService: FailureAnalysisService = new FailureAnalysisService(),
    private readonly recoveryIntelligenceService: RecoveryIntelligenceService = new RecoveryIntelligenceService(),
    private readonly recoveryRecommendationService: RecoveryRecommendationService = new RecoveryRecommendationService()
  ) {}

  /**
   * Processes an incoming canonical payment event through validation,
   * idempotency check, automatic failure analysis, recovery intelligence assessment, and persistence.
   */
  async processEvent(
    rawCanonicalEvent: unknown
  ): Promise<PaymentPipelineResult> {
    // 1. Validation against Canonical Contract
    const event: CanonicalPaymentEvent =
      CanonicalPaymentEventSchema.parse(rawCanonicalEvent);

    // 2. Idempotency Check: Query existing by compound unique [providerId, externalPaymentId, companyId]
    const existing = await this.db.paymentEvent.findUnique({
      where: {
        provider_external_company_unique: {
          providerId: event.providerId,
          externalPaymentId: event.externalPaymentId,
          companyId: event.companyId,
        },
      },
      include: {
        failure: true,
        assessment: true,
      },
    });

    if (existing) {
      // Check if this is a legitimate state transition (e.g. FAILED -> COMPLETED or PENDING -> COMPLETED)
      if (existing.status !== event.status) {
        const updated = await this.db.$transaction(async (tx) => {
          const updPayment = await tx.paymentEvent.update({
            where: { id: existing.id },
            data: {
              status: event.status,
              eventType: event.eventType,
              updatedAt: new Date(),
            },
          });

          let btStatus: import("@prisma/client").BusinessTransactionStatus | undefined;
          let btAttribution: import("@prisma/client").RecoveryAttribution | undefined;

          if (updPayment.businessTransactionId) {
            const bt = await tx.businessTransaction.findUnique({
              where: { id: updPayment.businessTransactionId },
            });

            if (bt) {
              if (event.status === "COMPLETED") {
                if (bt.status !== "SUCCESSFUL" && bt.status !== "RECOVERED") {
                  const updatedBt = await tx.businessTransaction.update({
                    where: { id: bt.id },
                    data: {
                      status: "RECOVERED",
                      recoveryAttribution: "CUSTOMER",
                    },
                  });
                  btStatus = updatedBt.status;
                  btAttribution = updatedBt.recoveryAttribution;

                  // Cancel open recovery attempts for this transaction
                  await tx.recoveryAttempt.updateMany({
                    where: {
                      paymentEvent: { businessTransactionId: bt.id },
                      status: "ATTEMPTED",
                    },
                    data: {
                      status: "CANCELLED",
                      completedAt: new Date(),
                    },
                  });
                } else {
                  btStatus = bt.status;
                  btAttribution = bt.recoveryAttribution;
                }
              }
            }
          }

          return { updPayment, btStatus, btAttribution };
        });

        return {
          status: "CREATED",
          isDuplicate: false,
          paymentEventId: updated.updPayment.id,
          externalPaymentId: updated.updPayment.externalPaymentId,
          companyId: updated.updPayment.companyId,
          providerId: updated.updPayment.providerId,
          businessTransactionId: updated.updPayment.businessTransactionId || undefined,
          businessTransactionStatus: updated.btStatus,
          recoveryAttribution: updated.btAttribution,
          amount: updated.updPayment.amount.toString(),
          currency: updated.updPayment.currency,
          paymentStatus: updated.updPayment.status,
          message: `Payment status transitioned from ${existing.status} to ${event.status}.`,
        };
      }

      // Exact same status: Idempotent duplicate
      const existingRec = await this.db.recoveryRecommendation.findUnique({
        where: { paymentEventId: existing.id },
      });

      return {
        status: "DUPLICATE",
        isDuplicate: true,
        paymentEventId: existing.id,
        externalPaymentId: existing.externalPaymentId,
        companyId: existing.companyId,
        providerId: existing.providerId,
        businessTransactionId: existing.businessTransactionId || undefined,
        amount: existing.amount.toString(),
        currency: existing.currency,
        paymentStatus: existing.status,
        message: "Duplicate payment event detected. Existing record preserved (idempotent).",
        failureAnalysis: existing.failure
          ? {
              category: existing.failure.category,
              reason: existing.failure.failureMessage || "No reason recorded",
              classification: "UNKNOWN",
              isTemporary: null,
            }
          : undefined,
        recoveryAssessment: existing.assessment
          ? {
              worthiness: existing.assessment.worthiness,
              estimatedRecoverableAmount: (
                existing.assessment.estimatedRecoverableAmount ?? 0
              ).toString(),
              confidence: existing.assessment.confidence,
              reasoning:
                existing.assessment.reasoning || "No reasoning recorded",
            }
          : undefined,
        recoveryRecommendation: existingRec
          ? {
              action: existingRec.action as import("@recoverai/contracts").RecoveryAction,
              status: existingRec.status as import("@recoverai/contracts").RecommendationStatus,
              reason: existingRec.reason || "No reason recorded",
              confidence: existingRec.confidence,
              ruleSource: "deterministic-rules-v1",
              mlUsed: false,
              mlProbability: null,
            }
          : undefined,
      };
    }

    // 3. Verify Foreign Entity Existence
    const company = await this.db.company.findUnique({
      where: { id: event.companyId },
    });
    if (!company) {
      const error = new Error(`Company not found: '${event.companyId}'`);
      (error as unknown as { code: string }).code = "COMPANY_NOT_FOUND";
      throw error;
    }

    const provider = await this.db.provider.findUnique({
      where: { id: event.providerId },
    });
    if (!provider) {
      const error = new Error(`Provider not found: '${event.providerId}'`);
      (error as unknown as { code: string }).code = "PROVIDER_NOT_FOUND";
      throw error;
    }

    // 4. Automatic Failure Analysis, Recovery Intelligence & Recommendation (for failed payments)
    const isFailed = event.status === "FAILED";
    const failureAnalysis = isFailed
      ? this.failureAnalysisService.analyzeFailure(event)
      : null;

    const recoveryAssessment =
      isFailed && failureAnalysis
        ? this.recoveryIntelligenceService.assessRecovery(
            event,
            failureAnalysis
          )
        : null;

    // Phase 7: Generate recommendation (async; uses ML service with timeout fallback)
    const recommendation =
      isFailed && failureAnalysis && recoveryAssessment
        ? await this.recoveryRecommendationService.recommend(
            event,
            failureAnalysis,
            recoveryAssessment
          )
        : null;

    // 5. Persist Payment Event, BusinessTransaction, PaymentFailure, and RecoveryAssessment in a Transaction
    try {
      const created = await this.db.$transaction(async (tx) => {
        // Resolve or create BusinessTransaction
        let businessTransaction = null;

        // Priority 1: Match by merchantReference within company
        if (event.merchantTransactionReference) {
          businessTransaction = await tx.businessTransaction.findUnique({
            where: {
              company_merchant_ref_unique: {
                companyId: event.companyId,
                merchantReference: event.merchantTransactionReference,
              },
            },
          });
        }

        // Priority 2: Match by orderReference within company
        if (!businessTransaction && event.orderReference) {
          businessTransaction = await tx.businessTransaction.findFirst({
            where: {
              companyId: event.companyId,
              orderReference: event.orderReference,
            },
          });
        }

        const isPaymentSuccess = event.status === "COMPLETED";

        if (!businessTransaction) {
          businessTransaction = await tx.businessTransaction.create({
            data: {
              companyId: event.companyId,
              merchantReference: event.merchantTransactionReference || null,
              orderReference: event.orderReference || null,
              amount: new Prisma.Decimal(event.amount),
              currency: event.currency,
              status: isPaymentSuccess
                ? "SUCCESSFUL"
                : event.status === "FAILED"
                ? "FAILED"
                : "PENDING",
              customerReference: event.customerReference || null,
              recoveryAttribution: "NONE",
              metadata: event.metadata
                ? (event.metadata as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          });
        } else {
          // Existing BusinessTransaction found!
          if (isPaymentSuccess) {
            // Customer or RecoverAI succeeded on this attempt!
            if (
              businessTransaction.status === "FAILED" ||
              businessTransaction.status === "PENDING"
            ) {
              const meta = event.metadata as Record<string, unknown> | undefined;
              const metaNotes = meta?.notes as Record<string, unknown> | undefined;
              const isRecoverAiAttribution = Boolean(
                metaNotes?.recoveryAttemptId ||
                  meta?.recoveryAttemptId ||
                  meta?.action === "RETRY_PAYMENT"
              );

              businessTransaction = await tx.businessTransaction.update({
                where: { id: businessTransaction.id },
                data: {
                  status: "RECOVERED",
                  recoveryAttribution: isRecoverAiAttribution
                    ? "RECOVERAI"
                    : "CUSTOMER",
                },
              });

              // Cancel any pending recovery attempts for earlier attempts in this transaction
              await tx.recoveryAttempt.updateMany({
                where: {
                  paymentEvent: { businessTransactionId: businessTransaction.id },
                  status: "ATTEMPTED",
                },
                data: {
                  status: "CANCELLED",
                  completedAt: new Date(),
                },
              });
            }
          } else if (event.status === "FAILED") {
            // If already successful or recovered, do not downgrade business transaction
            if (
              businessTransaction.status !== "SUCCESSFUL" &&
              businessTransaction.status !== "RECOVERED"
            ) {
              businessTransaction = await tx.businessTransaction.update({
                where: { id: businessTransaction.id },
                data: {
                  status: "FAILED",
                },
              });
            }
          }
        }

        const paymentRecord = await tx.paymentEvent.create({
          data: {
            externalPaymentId: event.externalPaymentId,
            companyId: event.companyId,
            providerId: event.providerId,
            businessTransactionId: businessTransaction.id,
            orderReference: event.orderReference || null,
            customerReference: event.customerReference || null,
            amount: new Prisma.Decimal(event.amount),
            currency: event.currency,
            status: event.status,
            paymentMethod: event.paymentMethod,
            eventType: event.eventType,
            failureCode: failureAnalysis
              ? failureAnalysis.originalFailureCode || event.failureCode || null
              : event.failureCode || null,
            failureMessage: failureAnalysis
              ? failureAnalysis.reason
              : event.failureMessage || null,
            eventTimestamp: new Date(event.eventTimestamp),
            metadata: event.metadata
              ? (event.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });

        // Persist normalized PaymentFailure record when payment is failed
        if (failureAnalysis) {
          await tx.paymentFailure.create({
            data: {
              paymentEventId: paymentRecord.id,
              category: failureAnalysis.category,
              failureCode:
                failureAnalysis.originalFailureCode || event.failureCode || null,
              failureMessage: failureAnalysis.reason,
              failedAt: new Date(event.eventTimestamp),
            },
          });
        }

        // Only persist assessment and recommendation if transaction is not already resolved
        const isTxResolved =
          businessTransaction.status === "SUCCESSFUL" ||
          businessTransaction.status === "RECOVERED";

        if (recoveryAssessment && !isTxResolved) {
          await tx.recoveryAssessment.create({
            data: {
              paymentEventId: paymentRecord.id,
              worthiness: recoveryAssessment.worthiness,
              estimatedRecoverableAmount: new Prisma.Decimal(
                recoveryAssessment.estimatedRecoverableAmount
              ),
              confidence: recoveryAssessment.confidence,
              reasoning: recoveryAssessment.reasoning,
              assessedAt: recoveryAssessment.assessedAt,
            },
          });
        }

        if (recommendation && !isTxResolved) {
          await tx.recoveryRecommendation.create({
            data: {
              paymentEventId: paymentRecord.id,
              action: recommendation.action,
              status: recommendation.status as import("@prisma/client").RecommendationStatus,
              reason: recommendation.reason,
              confidence: recommendation.confidence,
            },
          });
        }

        return { paymentRecord, businessTransaction };
      }, {
        timeout: 30000,
        maxWait: 15000,
      });

      return {
        status: "CREATED",
        isDuplicate: false,
        paymentEventId: created.paymentRecord.id,
        externalPaymentId: created.paymentRecord.externalPaymentId,
        companyId: created.paymentRecord.companyId,
        providerId: created.paymentRecord.providerId,
        businessTransactionId: created.paymentRecord.businessTransactionId || undefined,
        businessTransactionStatus: created.businessTransaction.status,
        recoveryAttribution: created.businessTransaction.recoveryAttribution,
        amount: created.paymentRecord.amount.toString(),
        currency: created.paymentRecord.currency,
        paymentStatus: created.paymentRecord.status,
        message: "Canonical payment event successfully validated and persisted.",
        failureAnalysis: failureAnalysis
          ? {
              category: failureAnalysis.category,
              reason: failureAnalysis.reason,
              classification: failureAnalysis.classification,
              isTemporary: failureAnalysis.isTemporary,
            }
          : undefined,
        recoveryAssessment: recoveryAssessment
          ? {
              worthiness: recoveryAssessment.worthiness,
              estimatedRecoverableAmount:
                recoveryAssessment.estimatedRecoverableAmount.toString(),
              confidence: recoveryAssessment.confidence,
              reasoning: recoveryAssessment.reasoning,
            }
          : undefined,
        recoveryRecommendation: recommendation
          ? {
              action: recommendation.action,
              status: recommendation.status,
              reason: recommendation.reason,
              confidence: recommendation.confidence,
              ruleSource: recommendation.ruleSource,
              mlUsed: recommendation.mlUsed,
              mlProbability: recommendation.mlProbability,
            }
          : undefined,
      };

    } catch (err: unknown) {
      // Safe race-condition idempotency handler: if concurrent duplicate triggered P2002
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const duplicate = await this.db.paymentEvent.findUnique({
          where: {
            provider_external_company_unique: {
              providerId: event.providerId,
              externalPaymentId: event.externalPaymentId,
              companyId: event.companyId,
            },
          },
          include: {
            failure: true,
            assessment: true,
            recommendation: true,
          },
        });

        if (duplicate) {
          return {
            status: "DUPLICATE",
            isDuplicate: true,
            paymentEventId: duplicate.id,
            externalPaymentId: duplicate.externalPaymentId,
            companyId: duplicate.companyId,
            providerId: duplicate.providerId,
            businessTransactionId: duplicate.businessTransactionId || undefined,
            amount: duplicate.amount.toString(),
            currency: duplicate.currency,

            paymentStatus: duplicate.status,
            message: "Concurrent duplicate payment event detected. Existing record preserved.",
            failureAnalysis: duplicate.failure
              ? {
                  category: duplicate.failure.category,
                  reason: duplicate.failure.failureMessage || "No reason recorded",
                  classification: "UNKNOWN",
                  isTemporary: null,
                }
              : undefined,
            recoveryAssessment: duplicate.assessment
              ? {
                  worthiness: duplicate.assessment.worthiness,
                  estimatedRecoverableAmount: (
                    duplicate.assessment.estimatedRecoverableAmount ?? 0
                  ).toString(),
                  confidence: duplicate.assessment.confidence,
                  reasoning:
                    duplicate.assessment.reasoning || "No reasoning recorded",
                }
              : undefined,
            recoveryRecommendation: duplicate.recommendation
              ? {
                  action: duplicate.recommendation.action as import("@recoverai/contracts").RecoveryAction,
                  status: duplicate.recommendation.status as import("@recoverai/contracts").RecommendationStatus,
                  reason: duplicate.recommendation.reason || "No reason recorded",
                  confidence: duplicate.recommendation.confidence,
                  ruleSource: "deterministic-rules-v1",
                  mlUsed: false,
                  mlProbability: null,
                }
              : undefined,
          };
        }
      }

      throw err;
    }
  }
}
