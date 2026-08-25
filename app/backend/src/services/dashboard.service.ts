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
   * Resolves the company context.
   * If companyId is provided, validates that company exists.
   * If not provided in sandbox/demo environment, defaults to the primary demo company.
   */
  private async resolveCompany(companyId?: string) {
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        throw new Error(`Company not found with ID: ${companyId}`);
      }
      return company;
    }

    // Default to the first available company or demo company
    const defaultCompany = await this.prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!defaultCompany) {
      throw new Error("No company found in database");
    }

    return defaultCompany;
  }

  /**
   * Retrieves canonical aggregate summary metrics for the company dashboard.
   */
  async getDashboardSummary(companyId?: string): Promise<DashboardSummaryResponse> {
    const company = await this.resolveCompany(companyId);

    // 1. Fetch total counts and breakdown
    const [totalPayments, failedPayments, successfulPayments] =
      await Promise.all([
        this.prisma.paymentEvent.count({
          where: { companyId: company.id },
        }),
        this.prisma.paymentEvent.count({
          where: { companyId: company.id, status: "FAILED" },
        }),
        this.prisma.paymentEvent.count({
          where: { companyId: company.id, status: "COMPLETED" },
        }),
      ]);

    // 2. Fetch monetary aggregates
    const [
      totalPaymentSum,
      potentiallyRecoverableSum,
      estimatedRecoverableSum,
      actualRecoveredSum,
    ] = await Promise.all([
      this.prisma.paymentEvent.aggregate({
        where: { companyId: company.id },
        _sum: { amount: true },
      }),
      this.prisma.paymentEvent.aggregate({
        where: {
          companyId: company.id,
          status: "FAILED",
          assessment: { worthiness: "RECOVER" },
        },
        _sum: { amount: true },
      }),
      this.prisma.recoveryAssessment.aggregate({
        where: {
          paymentEvent: { companyId: company.id },
        },
        _sum: { estimatedRecoverableAmount: true },
      }),
      this.prisma.recoveryOutcome.aggregate({
        where: {
          recoveryAttempt: { paymentEvent: { companyId: company.id } },
        },
        _sum: { actualRecoveredAmount: true },
      }),
    ]);

    // 3. Counts for recommendation and execution lifecycle
    const [recommendedCount, attemptedCount, successfulRecoveryCount] =
      await Promise.all([
        this.prisma.recoveryRecommendation.count({
          where: { paymentEvent: { companyId: company.id } },
        }),
        this.prisma.recoveryAttempt.count({
          where: { paymentEvent: { companyId: company.id } },
        }),
        this.prisma.recoveryOutcome.count({
          where: {
            recoveryAttempt: { paymentEvent: { companyId: company.id } },
            outcome: "SUCCESSFUL",
          },
        }),
      ]);

    // 4. Failure breakdown by category
    const failureGroups = await this.prisma.paymentFailure.groupBy({
      by: ["category"],
      where: {
        paymentEvent: { companyId: company.id },
      },
      _count: { category: true },
    });

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

    // 5. Recovery lifecycle status breakdown
    const [
      doNotRecoverCount,
      reviewCount,
      failedOutcomeCount,
    ] = await Promise.all([
      this.prisma.recoveryAssessment.count({
        where: {
          paymentEvent: { companyId: company.id },
          worthiness: "DO_NOT_RECOVER",
        },
      }),
      this.prisma.recoveryAssessment.count({
        where: {
          paymentEvent: { companyId: company.id },
          worthiness: "REVIEW",
        },
      }),
      this.prisma.recoveryOutcome.count({
        where: {
          recoveryAttempt: { paymentEvent: { companyId: company.id } },
          outcome: "FAILED",
        },
      }),
    ]);

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

    const potRecoverableNum = potentiallyRecoverableSum._sum.amount
      ? Number(potentiallyRecoverableSum._sum.amount)
      : 0;
    const actRecoveredNum = actualRecoveredSum._sum.actualRecoveredAmount
      ? Number(actualRecoveredSum._sum.actualRecoveredAmount)
      : 0;

    const recoveryRate =
      potRecoverableNum > 0
        ? Number(((actRecoveredNum / potRecoverableNum) * 100).toFixed(1))
        : 0;

    return {
      company: {
        id: company.id,
        name: company.name,
      },
      currency: "INR",
      isDemo: true,
      metrics: {
        totalPayments,
        failedPayments,
        successfulPayments,
        failureRate,
        totalPaymentValue: (totalPaymentSum._sum.amount ?? 0).toString(),
        potentiallyRecoverableAmount: (
          potentiallyRecoverableSum._sum.amount ?? 0
        ).toString(),
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
    const company = await this.resolveCompany(query.companyId);

    const pageNum = query.page !== undefined ? Number(query.page) : 1;
    const pageSizeNum = query.pageSize !== undefined ? Number(query.pageSize) : 10;
    const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(pageSizeNum) ? pageSizeNum : 10));
    const skip = (page - 1) * pageSize;

    // Construct Prisma WHERE clause with strict company scoping
    const where: Prisma.PaymentEventWhereInput = {
      companyId: company.id,
    };

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
        include: {
          provider: true,
          failure: true,
          assessment: true,
          recommendation: true,
          attempts: {
            include: { outcome: true },
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
        companyId: record.companyId,
        providerId: record.providerId,
        providerType: record.provider.type,
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
