"use client";

import { useState } from "react";
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
    color: "bg-slate-500 dark:bg-slate-400",
  },
  NETWORK: {
    label: "Network / Timeout",
    color: "bg-slate-500 dark:bg-slate-400",
  },
  AUTHENTICATION: {
    label: "Authentication / OTP",
    color: "bg-amber-500",
  },
  CARD: {
    label: "Card / Invalidation",
    color: "bg-rose-500",
  },
  BANK: {
    label: "Bank Switch Unreachable",
    color: "bg-slate-500 dark:bg-slate-400",
  },
  PROVIDER: {
    label: "Provider API Error",
    color: "bg-slate-500 dark:bg-slate-400",
  },
  CUSTOMER_ACTION_REQUIRED: {
    label: "Customer Action Required",
    color: "bg-amber-500",
  },
  TEMPORARY: {
    label: "Temporary Processing Glitch",
    color: "bg-slate-500 dark:bg-slate-400",
  },
  UNKNOWN: {
    label: "Unclassified / Other",
    color: "bg-slate-400 dark:bg-slate-500",
  },
};

const recoveryStatusColors: Record<string, string> = {
  Recovered: "bg-emerald-500",
  "Failed Recovery": "bg-rose-500",
  "Review Required": "bg-amber-500",
  Attempted: "bg-slate-600 dark:bg-slate-300",
  Recommended: "bg-slate-400 dark:bg-slate-500",
  "Do Not Recover": "bg-slate-300 dark:bg-slate-600",
};

export function BreakdownCards({
  failureBreakdown,
  recoveryBreakdown,
}: BreakdownCardsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const totalFailures = failureBreakdown.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/85 backdrop-blur-md overflow-hidden shadow-sm">
      {/* Collapsible Section Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Failure Analysis & Lifecycle Distribution
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            ({totalFailures} failures classified)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-[11px] font-medium">
            {isOpen ? "Hide Analytics" : "View Breakdown Analytics"}
          </span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable Breakdown Cards Grid */}
      {isOpen && (
        <div className="p-5 border-t border-border/60 grid grid-cols-1 lg:grid-cols-2 gap-5 bg-muted/5">
          {/* 1. Failure Reasons Breakdown */}
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Failure Reasons Breakdown
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Root cause classification across canonical payment failures
                </p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {totalFailures} Total
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {failureBreakdown.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
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
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground text-[11px]">
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

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${meta.color}`}
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
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Recovery Lifecycle Status
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Distribution of intelligence decisions and execution outcomes
                </p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Active States
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {recoveryBreakdown.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No recovery activity recorded
                </div>
              ) : (
                recoveryBreakdown.map((item) => {
                  const color = recoveryStatusColors[item.status] || "bg-slate-500";

                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground text-[11px]">
                          {item.status}
                        </span>
                        <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
                          <span className="text-muted-foreground">
                            {item.count} {item.count === 1 ? "event" : "events"}
                          </span>
                          <span className="font-semibold text-foreground">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${color}`}
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
      )}
    </div>
  );
}
