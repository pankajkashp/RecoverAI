import React from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface KpiCardProps {
  stageNumber?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info";
  isCurrency?: boolean;
  currency?: string;
}

export function KpiCard({
  stageNumber,
  title,
  value,
  subtitle,
  badgeText,
  badgeVariant = "default",
  isCurrency = false,
  currency = "INR",
}: KpiCardProps) {
  const badgeClasses = {
    default:
      "bg-muted text-muted-foreground border-border/80",
    success:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-medium",
    warning:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30 font-medium",
    danger:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 font-medium",
    info: "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30 font-medium",
  };

  const formattedValue = isCurrency
    ? formatCurrency(value, currency)
    : formatNumber(value);

  return (
    <div className="rounded-xl border border-border bg-card p-4.5 flex flex-col justify-between transition-colors shadow-2xs">
      <div>
        <div className="flex items-center justify-between gap-2">
          {stageNumber && (
            <span className="font-mono text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
              {stageNumber}
            </span>
          )}
          {badgeText && (
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide border ${badgeClasses[badgeVariant]}`}
            >
              {badgeText}
            </span>
          )}
        </div>

        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">
          {title}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
          {formattedValue}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-border/50">
        {subtitle && (
          <span className="text-xs text-muted-foreground block truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

