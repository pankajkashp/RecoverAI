import { KpiCard } from "./kpi-card";
import { type DashboardSummaryResponse } from "@recoverai/contracts";

interface SummaryOverviewProps {
  summary: DashboardSummaryResponse;
}

export function SummaryOverview({ summary }: SummaryOverviewProps) {
  const { metrics, currency } = summary;

  return (
    <section aria-label="Recovery Funnel Overview" className="space-y-4">
      {/* 1. Main 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Failed Payments */}
        <KpiCard
          title="Failed Payments"
          value={metrics.failedPayments}
          subtitle={`${metrics.failureRate}% failure rate • ${metrics.totalPayments} total ingested`}
          badgeText={metrics.failedPayments > 0 ? "Failures Detected" : "Normal"}
          badgeVariant={metrics.failedPayments > 0 ? "warning" : "default"}
        />

        {/* KPI 2: Recoverable Value */}
        <KpiCard
          title="Recoverable Value"
          value={metrics.potentiallyRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle="Evaluated recovery candidate pool"
          badgeText="Target Pool"
          badgeVariant="info"
        />

        {/* KPI 3: Expected Recovery */}
        <KpiCard
          title="Expected Recovery"
          value={metrics.estimatedRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`Forecast across ${metrics.recommendedCount} recommendations`}
          badgeText="Intelligence Forecast"
          badgeVariant="default"
        />

        {/* KPI 4: Actually Recovered */}
        <KpiCard
          title="Actually Recovered"
          value={metrics.actualRecoveredAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`${metrics.successfulRecoveryCount} of ${metrics.attemptedCount} attempts successful`}
          badgeText={`${metrics.recoveryRate}% realized`}
          badgeVariant="success"
        />
      </div>

      {/* 2. Simplified Recovery Progress Funnel */}
      <div className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground/90 uppercase tracking-wider text-[11px]">
              Recovery Pipeline
            </span>
            <span className="text-muted-foreground text-[11px]">
              (Real-time conversion flow)
            </span>
          </div>

          {/* Funnel Steps */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-muted-foreground">Failed:</span>
              <span className="font-mono font-semibold text-foreground">
                {metrics.failedPayments}
              </span>
            </div>

            <span className="text-muted-foreground/60">→</span>

            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-muted-foreground">Recommended:</span>
              <span className="font-mono font-semibold text-foreground">
                {metrics.recommendedCount}
              </span>
            </div>

            <span className="text-muted-foreground/60">→</span>

            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-muted-foreground">Attempted:</span>
              <span className="font-mono font-semibold text-foreground">
                {metrics.attemptedCount}
              </span>
            </div>

            <span className="text-muted-foreground/60">→</span>

            <div className="flex items-center gap-1.5 font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md">
              <span>Recovered:</span>
              <span className="font-mono font-bold">
                {metrics.successfulRecoveryCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

