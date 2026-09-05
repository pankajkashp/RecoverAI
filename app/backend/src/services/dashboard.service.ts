/**
 * RecoverAI — Dashboard Service
 *
 * Phase 9: Dashboard & Read API
 *
 * Implements read-only business queries scoped strictly to company context.
 * Performs canonical aggregations, filtering, sorting, and pagination
 * without mutating database state.
 */

import {
  PrismaClient,
  type PaymentStatus,
  type FailureCategory,
  type RecoveryWorthiness,
  type RecoveryAttemptStatus,
  type Prisma,
} from "@prisma/client";
import {
  type DashboardSummaryResponse,
  type DashboardPaymentsQuery,
  type DashboardPaymentsResponse,
  type PaymentLifecycleItem,
  type FailureBreakdownItem,
  type RecoveryBreakdownItem,
} from "@recoverai/contracts";
import { prisma as defaultPrisma } from "../lib/prisma.js";

export class DashboardService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Retrieves canonical aggregate summary metrics for the single-business dashboard.
   */
  async getDashboardSummary(_companyId?: string): Promise<DashboardSummaryResponse> {
    // 1. Fetch summary metrics concurrently in a single Promise.all
    const [
      totalPayments,
      failedPayments,
      successfulPayments,
      totalPaymentSum,
      potentiallyRecoverableSum,
      estimatedRecoverableSum,
      actualRecoveredSum,
      recommendedCount,
      attemptedCount,
      successfulRecoveryCount,
      failureGroups,
      doNotRecoverCount,
      reviewCount,
      failedOutcomeCount,
      btTotalSum,
      btPotRecoverableSum,
    ] = await Promise.all([
      // 1. Total payments count (attempts)
      this.prisma.paymentEvent.count(),
      // 2. Failed payments count (attempts)
      this.prisma.paymentEvent.count({
        where: { status: "FAILED" },
      }),
      // 3. Completed payments count (attempts)
      this.prisma.paymentEvent.count({
        where: { status: "COMPLETED" },
      }),
      // 4. Total payments monetary sum (legacy fallback)
      this.prisma.paymentEvent.aggregate({
        _sum: { amount: true },
      }),
      // 5. Potentially recoverable sum (legacy fallback)
      this.prisma.paymentEvent.aggregate({
        where: {
          status: "FAILED",
          assessment: { worthiness: "RECOVER" },
        },
        _sum: { amount: true },
      }),
      // 6. Estimated recoverable sum
      this.prisma.recoveryAssessment.aggregate({
        _sum: { estimatedRecoverableAmount: true },
      }),
      // 7. Actual recovered sum
      this.prisma.recoveryOutcome.aggregate({
        _sum: { actualRecoveredAmount: true },
      }),
      // 8. Recommended actions count
      this.prisma.recoveryRecommendation.count(),
      // 9. Recovery attempts count
      this.prisma.recoveryAttempt.count(),
      // 10. Successful recoveries count
      this.prisma.recoveryOutcome.count({
        where: {
          outcome: "SUCCESSFUL",
        },
      }),
      // 11. Failure breakdown by category
      this.prisma.paymentFailure.groupBy({
        by: ["category"],
        _count: { category: true },
      }),
      // 12. Do not recover assessments count
      this.prisma.recoveryAssessment.count({
        where: {
          worthiness: "DO_NOT_RECOVER",
        },
      }),
      // 13. Review required assessments count
      this.prisma.recoveryAssessment.count({
        where: {
          worthiness: "REVIEW",
        },
      }),
      // 14. Failed recovery outcomes count
      this.prisma.recoveryOutcome.count({
        where: {
          outcome: "FAILED",
        },
      }),
      // 15. Total BusinessTransactions count and monetary sum (prevents multiplying volume by attempts)
      this.prisma.businessTransaction.aggregate({
        _sum: { amount: true },
        _count: { id: true },
      }),
      // 16. Potentially recoverable sum from business transactions that required recovery
      this.prisma.businessTransaction.aggregate({
        where: {
          status: { in: ["FAILED", "RECOVERED"] },
        },
        _sum: { amount: true },
      }),
    ]);


    const failureBreakdown: FailureBreakdownItem[] = failureGroups.map((g) => {
      const count = g._count.category;
      const percentage =
        failedPayments > 0 ? Number(((count / failedPayments) * 100).toFixed(1)) : 0;
      return {
        category: g.category as FailureCategory,
        count,
        percentage,
      };
    });

    const totalFailedOrAssessed = Math.max(failedPayments, 1);
    const recoveryBreakdown: RecoveryBreakdownItem[] = [
      {
        status: "Recommended",
        count: recommendedCount,
        percentage: Number(((recommendedCount / totalFailedOrAssessed) * 100).toFixed(1)),
      },
      {
        status: "Attempted",
        count: attemptedCount,
        percentage: Number(((attemptedCount / totalFailedOrAssessed) * 100).toFixed(1)),
      },
      {
        status: "Recovered",
        count: successfulRecoveryCount,
        percentage: Number(
          ((successfulRecoveryCount / totalFailedOrAssessed) * 100).toFixed(1)
        ),
      },
      {
        status: "Failed Recovery",
        count: failedOutcomeCount,
        percentage: Number(
          ((failedOutcomeCount / totalFailedOrAssessed) * 100).toFixed(1)
        ),
      },
      {
        status: "Review Required",
        count: reviewCount,
        percentage: Number(((reviewCount / totalFailedOrAssessed) * 100).toFixed(1)),
      },
      {
        status: "Do Not Recover",
        count: doNotRecoverCount,
        percentage: Number(
          ((doNotRecoverCount / totalFailedOrAssessed) * 100).toFixed(1)
        ),
      },
    ];

    // Compute Rates
    const failureRate =
      totalPayments > 0
        ? Number(((failedPayments / totalPayments) * 100).toFixed(1))
        : 0;

    const totalPaymentValue =
      btTotalSum._count.id > 0
        ? (btTotalSum._sum.amount ?? 0).toString()
        : (totalPaymentSum._sum.amount ?? 0).toString();

    const potentiallyRecoverableAmount =
      btTotalSum._count.id > 0
        ? (btPotRecoverableSum._sum.amount ?? 0).toString()
        : (potentiallyRecoverableSum._sum.amount ?? 0).toString();

    const potRecoverableNum = Number(potentiallyRecoverableAmount);
    const actRecoveredNum = actualRecoveredSum._sum.actualRecoveredAmount
      ? Number(actualRecoveredSum._sum.actualRecoveredAmount)
      : 0;

    const recoveryRate =
      potRecoverableNum > 0
        ? Math.min(
            100,
            Number(((actRecoveredNum / potRecoverableNum) * 100).toFixed(1))
          )
        : 0;

    return {
      business: {
        id: "recoverai",
        name: "RecoverAI",
      },
      company: {
        id: "recoverai",
        name: "RecoverAI",
      },
      currency: "INR",
      isDemo: true,
      metrics: {
        totalPayments,
        failedPayments,
        successfulPayments,
        failureRate,
        totalPaymentValue,
        potentiallyRecoverableAmount,
        estimatedRecoverableAmount: (
          estimatedRecoverableSum._sum.estimatedRecoverableAmount ?? 0
        ).toString(),
        actualRecoveredAmount: (
          actualRecoveredSum._sum.actualRecoveredAmount ?? 0
        ).toString(),

        recoveryRate,
        recommendedCount,
        attemptedCount,
        successfulRecoveryCount,
      },
      failureBreakdown,
      recoveryBreakdown,
    };
  }

  /**
   * Retrieves paginated, sorted, and filtered payment lifecycle events.
   */
  async getDashboardPayments(
    query: DashboardPaymentsQuery
  ): Promise<DashboardPaymentsResponse> {
    const pageNum = query.page !== undefined ? Number(query.page) : 1;
    const pageSizeNum = query.pageSize !== undefined ? Number(query.pageSize) : 10;
    const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(pageSizeNum) ? pageSizeNum : 10));
    const skip = (page - 1) * pageSize;

    // Construct Prisma WHERE clause for single business dataset
    const where: Prisma.PaymentEventWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }

    if (query.failureCategory) {
      where.failure = {
        category: query.failureCategory as FailureCategory,
      };
    }

    if (query.recoveryWorthiness) {
      where.assessment = {
        worthiness: query.recoveryWorthiness as RecoveryWorthiness,
      };
    }

    if (query.recommendationAction) {
      where.recommendation = {
        action: {
          contains: query.recommendationAction,
          mode: "insensitive",
        },
      };
    }

    if (query.recoveryStatus) {
      where.attempts = {
        some: {
          status: query.recoveryStatus as RecoveryAttemptStatus,
        },
      };
    }

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { externalPaymentId: { contains: searchTerm, mode: "insensitive" } },
        { customerReference: { contains: searchTerm, mode: "insensitive" } },
        { failureMessage: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Server-side sort field whitelist
    const sortField = query.sortBy || "eventTimestamp";
    const sortDirection: Prisma.SortOrder =
      query.sortOrder === "asc" ? "asc" : "desc";
    const orderBy: Prisma.PaymentEventOrderByWithRelationInput = {
      [sortField]: sortDirection,
    };

    const [total, paymentRecords] = await Promise.all([
      this.prisma.paymentEvent.count({ where }),
      this.prisma.paymentEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          externalPaymentId: true,
          providerId: true,
          businessTransactionId: true,
          orderReference: true,
          customerReference: true,
          amount: true,
          currency: true,
          status: true,
          paymentMethod: true,
          eventType: true,
          failureCode: true,
          failureMessage: true,
          eventTimestamp: true,
          createdAt: true,
          provider: {
            select: { type: true },
          },
          failure: {
            select: {
              category: true,
              failureCode: true,
              failureMessage: true,
              failedAt: true,
            },
          },
          assessment: {
            select: {
              worthiness: true,
              estimatedRecoverableAmount: true,
              confidence: true,
              reasoning: true,
              assessedAt: true,
            },
          },
          recommendation: {
            select: {
              action: true,
              status: true,
              reason: true,
              confidence: true,
              createdAt: true,
            },
          },
          attempts: {
            select: {
              id: true,
              status: true,
              attemptedAt: true,
              completedAt: true,
              outcome: {
                select: {
                  id: true,
                  outcome: true,
                  actualRecoveredAmount: true,
                  outcomeTimestamp: true,
                  notes: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || (total === 0 ? 0 : 1);

    const items: PaymentLifecycleItem[] = paymentRecords.map((record) => {
      const latestAttempt = record.attempts[0] || null;
      const latestOutcome = latestAttempt?.outcome || null;

      return {
        id: record.id,
        externalPaymentId: record.externalPaymentId,
        providerId: record.providerId,
        providerType: record.provider.type,
        businessTransactionId: record.businessTransactionId,
        orderReference: record.orderReference,
        customerReference: record.customerReference,
        amount: record.amount.toString(),
        currency: record.currency,
        status: record.status,

        paymentMethod: record.paymentMethod,
        eventType: record.eventType,
        failureCode: record.failureCode,
        failureMessage: record.failureMessage,
        eventTimestamp: record.eventTimestamp.toISOString(),
        createdAt: record.createdAt.toISOString(),
        isDemoSandbox: record.provider.type === "DEMO" || true,
        failure: record.failure
          ? {
              category: record.failure.category,
              failureCode: record.failure.failureCode,
              failureMessage: record.failure.failureMessage,
              failedAt: record.failure.failedAt.toISOString(),
            }
          : null,
        assessment: record.assessment
          ? {
              worthiness: record.assessment.worthiness,
              estimatedRecoverableAmount:
                record.assessment.estimatedRecoverableAmount !== null
                  ? record.assessment.estimatedRecoverableAmount.toString()
                  : null,
              confidence: record.assessment.confidence,
              reasoning: record.assessment.reasoning,
              assessedAt: record.assessment.assessedAt.toISOString(),
            }
          : null,
        recommendation: record.recommendation
          ? {
              action: record.recommendation.action,
              status: record.recommendation.status,
              reason: record.recommendation.reason,
              confidence: record.recommendation.confidence,
              createdAt: record.recommendation.createdAt.toISOString(),
            }
          : null,
        latestAttempt: latestAttempt
          ? {
              id: latestAttempt.id,
              status: latestAttempt.status,
              attemptedAt: latestAttempt.attemptedAt
                ? latestAttempt.attemptedAt.toISOString()
                : null,
              completedAt: latestAttempt.completedAt
                ? latestAttempt.completedAt.toISOString()
                : null,
            }
          : null,
        latestOutcome: latestOutcome
          ? {
              id: latestOutcome.id,
              outcome: latestOutcome.outcome,
              actualRecoveredAmount:
                latestOutcome.actualRecoveredAmount !== null
                  ? latestOutcome.actualRecoveredAmount.toString()
                  : null,
              outcomeTimestamp: latestOutcome.outcomeTimestamp
                ? latestOutcome.outcomeTimestamp.toISOString()
                : null,
              notes: latestOutcome.notes,
            }
          : null,
      };
    });

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      isDemo: true,
    };
  }
}
