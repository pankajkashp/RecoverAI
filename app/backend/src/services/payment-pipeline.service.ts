/**
 * RecoverAI — Payment Pipeline Service
 *
 * Phase 3, 4 & 5: Payment Event Pipeline, Automatic Failure Analysis & Recovery Intelligence
 *
 * Core service responsible for:
 * 1. Validating CanonicalPaymentEvents.
 * 2. Enforcing idempotency (preventing duplicate events from creating duplicate business records).
 * 3. Automatically triggering Failure Analysis for failed payments.
 * 4. Automatically generating Recovery Assessments (worthiness & estimated recoverable amount).
 * 5. Persisting payment events, failure records, and recovery assessments in PostgreSQL.
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

export class PaymentPipelineService {
  constructor(
    private readonly db: PrismaClient = defaultPrisma,
    private readonly failureAnalysisService: FailureAnalysisService = new FailureAnalysisService(),
    private readonly recoveryIntelligenceService: RecoveryIntelligenceService = new RecoveryIntelligenceService()
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
      return {
        status: "DUPLICATE",
        isDuplicate: true,
        paymentEventId: existing.id,
        externalPaymentId: existing.externalPaymentId,
        companyId: existing.companyId,
        providerId: existing.providerId,
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

    // 4. Automatic Failure Analysis & Recovery Intelligence (for failed payments)
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

    // 5. Persist Payment Event, PaymentFailure, and RecoveryAssessment in a Transaction
    try {
      const created = await this.db.$transaction(async (tx) => {
        const paymentRecord = await tx.paymentEvent.create({
          data: {
            externalPaymentId: event.externalPaymentId,
            companyId: event.companyId,
            providerId: event.providerId,
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
            metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });

        // Persist normalized PaymentFailure record when payment is failed
        if (failureAnalysis) {
          await tx.paymentFailure.create({
            data: {
              paymentEventId: paymentRecord.id,
              category: failureAnalysis.category,
              failureCode: failureAnalysis.originalFailureCode || event.failureCode || null,
              failureMessage: failureAnalysis.reason,
              failedAt: new Date(event.eventTimestamp),
            },
          });
        }

        // Persist RecoveryAssessment record when payment is failed
        if (recoveryAssessment) {
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

        return paymentRecord;
      }, {
        timeout: 30000,
        maxWait: 15000,
      });

      return {
        status: "CREATED",
        isDuplicate: false,
        paymentEventId: created.id,
        externalPaymentId: created.externalPaymentId,
        companyId: created.companyId,
        providerId: created.providerId,
        amount: created.amount.toString(),
        currency: created.currency,
        paymentStatus: created.status,
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
          };
        }
      }

      throw err;
    }
  }
}
