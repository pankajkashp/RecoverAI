import { KpiCard } from "./kpi-card";
import { type DashboardSummaryResponse } from "@recoverai/contracts";

interface SummaryOverviewProps {
  summary: DashboardSummaryResponse;
}

export function SummaryOverview({ summary }: SummaryOverviewProps) {
  const { metrics, currency } = summary;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Failed Payments */}
      <KpiCard
        title="Failed Payments"
        value={metrics.failedPayments}
        subtitle={`${metrics.totalPayments} total payments ingested`}
        badgeText={`${metrics.failureRate}% failure rate`}
        badgeVariant={metrics.failedPayments > 0 ? "warning" : "success"}
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        }
      />

      {/* 2. Potentially Recoverable */}
      <KpiCard
        title="Potentially Recoverable"
        value={metrics.potentiallyRecoverableAmount}
        isCurrency={true}
        currency={currency}
        subtitle="Identified from recoverable failures"
        badgeText="Worthiness: RECOVER"
        badgeVariant="info"
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        }
      />

      {/* 3. Estimated Recoverable Amount */}
      <KpiCard
        title="Estimated Recovery"
        value={metrics.estimatedRecoverableAmount}
        isCurrency={true}
        currency={currency}
        subtitle={`${metrics.recommendedCount} actions recommended`}
        badgeText="Predicted Pipeline"
        badgeVariant="default"
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        }
      />

      {/* 4. Actually Recovered Amount */}
      <KpiCard
        title="Actually Recovered"
        value={metrics.actualRecoveredAmount}
        isCurrency={true}
        currency={currency}
        subtitle={`${metrics.successfulRecoveryCount} of ${metrics.attemptedCount} attempts successful`}
        badgeText={`${metrics.recoveryRate}% recovered`}
        badgeVariant="success"
        icon={
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />
    </div>
  );
}
