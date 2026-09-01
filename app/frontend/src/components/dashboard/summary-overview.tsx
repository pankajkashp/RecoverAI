import { KpiCard } from "./kpi-card";
import { type DashboardSummaryResponse } from "@recoverai/contracts";

interface SummaryOverviewProps {
  summary: DashboardSummaryResponse;
}

export function SummaryOverview({ summary }: SummaryOverviewProps) {
  const { metrics, currency } = summary;

  return (
    <section aria-label="Recovery Funnel Overview" className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Recovery Funnel Pipeline
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            (Ingestion → Target Pool → Forecast → Realized)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Stage 1: Ingested Failures */}
        <KpiCard
          stageNumber="01 • Ingested Failures"
          title="Failed Payments"
          value={metrics.failedPayments}
          subtitle={`${metrics.totalPayments} total payments ingested`}
          badgeText={`${metrics.failureRate}% failure rate`}
          badgeVariant={metrics.failedPayments > 0 ? "warning" : "default"}
        />

        {/* Stage 2: Target Pool */}
        <KpiCard
          stageNumber="02 • Target Pool"
          title="Potentially Recoverable"
          value={metrics.potentiallyRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle="Assessed high-confidence (RECOVER)"
          badgeText="Target Pool"
          badgeVariant="info"
        />

        {/* Stage 3: Forecasted Recovery */}
        <KpiCard
          stageNumber="03 • Forecast"
          title="Estimated Recovery"
          value={metrics.estimatedRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`Forecast across ${metrics.recommendedCount} recommendations`}
          badgeText="Model Forecast"
          badgeVariant="default"
        />

        {/* Stage 4: Realized Recovery */}
        <KpiCard
          stageNumber="04 • Realized"
          title="Actually Recovered"
          value={metrics.actualRecoveredAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`${metrics.successfulRecoveryCount} of ${metrics.attemptedCount} attempts successful`}
          badgeText={`${metrics.recoveryRate}% realized`}
          badgeVariant="success"
        />
      </div>
    </section>
  );
}

