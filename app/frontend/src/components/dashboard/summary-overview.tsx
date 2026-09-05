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
        {/* KPI 1: Ingested Payments */}
        <KpiCard
          title="Ingested Payments"
          value={metrics.totalPayments}
          subtitle={`${metrics.successfulPayments} completed • ${metrics.failedPayments} failed (${metrics.failureRate}%)`}
          badgeText={metrics.failedPayments > 0 ? `${metrics.failedPayments} Failures` : "Healthy"}
          badgeVariant={metrics.failedPayments > 0 ? "warning" : "success"}
          accentColor={metrics.failedPayments > 0 ? "amber" : "default"}
        />

        {/* KPI 2: Potentially Recoverable Pool */}
        <KpiCard
          title="Potentially Recoverable"
          value={metrics.potentiallyRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle="Qualified high-confidence failure pool"
          badgeText="Target Pool"
          badgeVariant="info"
          accentColor="sky"
        />

        {/* KPI 3: Expected Recovery */}
        <KpiCard
          title="Expected Recovery"
          value={metrics.estimatedRecoverableAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`Forecast across ${metrics.recommendedCount} recommendations`}
          badgeText="ML Forecast"
          badgeVariant="primary"
          accentColor="indigo"
        />

        {/* KPI 4: Actually Recovered (Strongest Hero Highlight) */}
        <KpiCard
          title="Actually Recovered"
          value={metrics.actualRecoveredAmount}
          isCurrency={true}
          currency={currency}
          subtitle={`${metrics.successfulRecoveryCount} of ${metrics.attemptedCount} attempts recovered`}
          badgeText={`${metrics.recoveryRate}% Realized`}
          badgeVariant="success"
          accentColor="emerald"
        />
      </div>

      {/* 2. Recovery Conversion Pipeline & Realized Revenue Callout */}
      <div className="rounded-2xl border border-border/70 bg-card/85 backdrop-blur-md px-5 py-3.5 shadow-sm space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-foreground/90 uppercase tracking-wider text-[11px]">
              Recovery Conversion Pipeline
            </span>
            <span className="hidden sm:inline text-muted-foreground text-[11px]">
              — Real-time financial conversion flow
            </span>
          </div>

          {/* Funnel Step Pills */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium rounded-lg border border-border/80 bg-background/60 px-2.5 py-1">
              <span className="text-muted-foreground text-[11px]">1. Ingested Failures:</span>
              <span className="font-mono font-bold text-foreground text-[11px]">
                {metrics.failedPayments}
              </span>
            </div>

            <span className="text-muted-foreground/50 font-bold">→</span>

            <div className="flex items-center gap-1.5 font-medium rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-2.5 py-1 text-indigo-700 dark:text-indigo-300">
              <span className="text-muted-foreground text-[11px]">2. Recommended:</span>
              <span className="font-mono font-bold text-[11px]">
                {metrics.recommendedCount}
              </span>
            </div>

            <span className="text-muted-foreground/50 font-bold">→</span>

            <div className="flex items-center gap-1.5 font-medium rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-1 text-sky-700 dark:text-sky-300">
              <span className="text-muted-foreground text-[11px]">3. Attempted:</span>
              <span className="font-mono font-bold text-[11px]">
                {metrics.attemptedCount}
              </span>
            </div>

            <span className="text-muted-foreground/50 font-bold">→</span>

            <div className="flex items-center gap-1.5 font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300 shadow-xs">
              <span className="font-semibold text-[11px]">4. Realized Recovered:</span>
              <span className="font-mono font-extrabold text-[11px]">
                {metrics.successfulRecoveryCount} ({metrics.recoveryRate}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



