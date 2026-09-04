import React from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info";
  isCurrency?: boolean;
  currency?: string;
}

export function KpiCard({
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
      "bg-muted/80 text-muted-foreground border-transparent",
    success:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent font-medium",
    warning:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent font-medium",
    danger:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-transparent font-medium",
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-transparent font-medium",
  };

  const formattedValue = isCurrency
    ? formatCurrency(value, currency)
    : formatNumber(value);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 flex flex-col justify-between transition-all hover:border-border shadow-xs">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground tracking-normal uppercase">
            {title}
          </span>
          {badgeText && (
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${badgeClasses[badgeVariant]}`}
            >
              {badgeText}
            </span>
          )}
        </div>

        <div className="mt-2.5">
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formattedValue}
          </div>
        </div>
      </div>

      {subtitle && (
        <div className="mt-3.5 pt-2.5 border-t border-border/40 text-xs text-muted-foreground truncate">
          {subtitle}
        </div>
      )}
    </div>
  );
}

