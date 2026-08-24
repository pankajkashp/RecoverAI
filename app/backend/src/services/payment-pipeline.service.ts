/**
 * RecoverAI — Payment Pipeline Service
 *
 * Phase 3: Payment Event Pipeline
 *
 * Core service responsible for:
 * 1. Validating CanonicalPaymentEvents.
 * 2. Enforcing idempotency (preventing duplicate events from creating duplicate business records).
 * 3. Persisting payment events and failure records in PostgreSQL.
 *
 * Strictly provider-agnostic. Operates only on CanonicalPaymentEvents.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  CanonicalPaymentEvent,
  CanonicalPaymentEventSchema,
  PaymentPipelineResult,
  FailureCategory,
} from "@recoverai/contracts";
import { prisma as defaultPrisma } from "../lib/prisma.js";

export class PaymentPipelineService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Processes an incoming canonical payment event through validation,
   * idempotency check, and persistence.
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

    // 4. Persist Payment Event (with transaction for failure record if FAILED)
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
            failureCode: event.failureCode || null,
            failureMessage: event.failureMessage || null,
            eventTimestamp: new Date(event.eventTimestamp),
            metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });

        // If payment failed and failure info exists, persist normalized PaymentFailure record
        if (
          event.status === "FAILED" &&
          (event.failureCode || event.failureMessage || event.failureCategory)
        ) {
          const category: FailureCategory =
            event.failureCategory || "UNKNOWN";

          await tx.paymentFailure.create({
            data: {
              paymentEventId: paymentRecord.id,
              category,
              failureCode: event.failureCode || null,
              failureMessage: event.failureMessage || null,
              failedAt: new Date(event.eventTimestamp),
            },
          });
        }

        return paymentRecord;
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
          };
        }
      }

      throw err;
    }
  }
}
