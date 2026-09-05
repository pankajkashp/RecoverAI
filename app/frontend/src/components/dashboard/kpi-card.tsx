import React from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  isCurrency?: boolean;
  currency?: string;
  accentColor?: "indigo" | "emerald" | "amber" | "sky" | "rose" | "default";
}

export function KpiCard({
  title,
  value,
  subtitle,
  badgeText,
  badgeVariant = "default",
  isCurrency = false,
  currency = "INR",
  accentColor = "default",
}: KpiCardProps) {
  const badgeClasses = {
    default:
      "bg-muted text-muted-foreground border-border/80 font-medium",
    success:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold",
    warning:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold",
    danger:
      "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 font-semibold",
    info:
      "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30 font-semibold",
    primary:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 font-semibold",
  };

  const accentGlow = {
    default: "hover:border-border",
    emerald: "hover:border-emerald-500/40 hover:shadow-emerald-500/5",
    amber: "hover:border-amber-500/40 hover:shadow-amber-500/5",
    sky: "hover:border-sky-500/40 hover:shadow-sky-500/5",
    indigo: "hover:border-indigo-500/40 hover:shadow-indigo-500/5",
    rose: "hover:border-rose-500/40 hover:shadow-rose-500/5",
  };

  const accentTopBorder = {
    default: "bg-transparent",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    indigo: "bg-indigo-500",
    rose: "bg-rose-500",
  };

  const formattedValue = isCurrency
    ? formatCurrency(value, currency)
    : formatNumber(value);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 backdrop-blur-md p-5 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-md ${accentGlow[accentColor]} group`}
    >
      {/* Top Accent Stripe */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${accentTopBorder[accentColor]} opacity-80 group-hover:opacity-100 transition-opacity`}
      />

      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
              {title}
            </span>
          </div>
          {badgeText && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] tracking-tight ${badgeClasses[badgeVariant]}`}
            >
              {badgeText}
            </span>
          )}
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono tabular-nums">
            {formattedValue}
          </div>
        </div>
      </div>

      {subtitle && (
        <div className="mt-3.5 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground truncate leading-relaxed">
          {subtitle}
        </div>
      )}
    </div>
  );
}


