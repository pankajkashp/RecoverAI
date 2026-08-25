import {
  type FailureBreakdownItem,
  type RecoveryBreakdownItem,
} from "@recoverai/contracts";

interface BreakdownCardsProps {
  failureBreakdown: FailureBreakdownItem[];
  recoveryBreakdown: RecoveryBreakdownItem[];
}

const failureCategoryLabels: Record<string, { label: string; color: string }> = {
  INSUFFICIENT_FUNDS: {
    label: "Insufficient Funds",
    color: "bg-amber-500",
  },
  NETWORK: {
    label: "Network / Timeout",
    color: "bg-sky-500",
  },
  AUTHENTICATION: {
    label: "Authentication / OTP",
    color: "bg-indigo-500",
  },
  CARD: {
    label: "Card / Invalidation",
    color: "bg-rose-500",
  },
  BANK: {
    label: "Bank / Switch Down",
    color: "bg-orange-500",
  },
  PROVIDER: {
    label: "Provider Error",
    color: "bg-purple-500",
  },
  CUSTOMER_ACTION_REQUIRED: {
    label: "Customer Action",
    color: "bg-blue-500",
  },
  TEMPORARY: {
    label: "Temporary Glitch",
    color: "bg-teal-500",
  },
  UNKNOWN: {
    label: "Unknown / Unclassified",
    color: "bg-slate-500",
  },
};

const recoveryStatusColors: Record<string, string> = {
  Recommended: "bg-indigo-500",
  Attempted: "bg-blue-500",
  Recovered: "bg-emerald-500",
  "Failed Recovery": "bg-rose-500",
  "Review Required": "bg-amber-500",
  "Do Not Recover": "bg-slate-500",
};

export function BreakdownCards({
  failureBreakdown,
  recoveryBreakdown,
}: BreakdownCardsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Failure Reasons Breakdown */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Failure Reasons Breakdown
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Root causes detected across canonical payment failures
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            {failureBreakdown.reduce((acc, curr) => acc + curr.count, 0)} Total
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {failureBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No payment failures recorded
            </div>
          ) : (
            failureBreakdown.map((item) => {
              const meta =
                failureCategoryLabels[item.category] || {
                  label: item.category,
                  color: "bg-primary",
                };

              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {meta.label}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        {item.count} {item.count === 1 ? "event" : "events"}
                      </span>
                      <span className="font-semibold text-foreground">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${meta.color}`}
                      style={{ width: `${Math.max(item.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Recovery Lifecycle Status Breakdown */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Recovery Lifecycle Status
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Distribution of intelligence decisions and execution outcomes
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            Active States
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {recoveryBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No recovery activity recorded
            </div>
          ) : (
            recoveryBreakdown.map((item) => {
              const color = recoveryStatusColors[item.status] || "bg-primary";

              return (
                <div key={item.status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {item.status}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        {item.count}
                      </span>
                      <span className="font-semibold text-foreground">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${Math.max(item.percentage, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
