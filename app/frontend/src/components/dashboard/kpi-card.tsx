import React from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info";
  icon?: React.ReactNode;
  isCurrency?: boolean;
  currency?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  badgeText,
  badgeVariant = "default",
  icon,
  isCurrency = false,
  currency = "INR",
}: KpiCardProps) {
  const badgeClasses = {
    default:
      "bg-secondary text-secondary-foreground border-border",
    success:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    danger:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    info: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  };

  const formattedValue =
    typeof value === "number"
      ? isCurrency
        ? new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(value)
        : new Intl.NumberFormat("en-IN").format(value)
      : isCurrency && !isNaN(Number(value))
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(Number(value))
      : value;

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:shadow-md hover:border-border/90 flex flex-col justify-between group">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-lg bg-muted/60 text-muted-foreground group-hover:text-foreground group-hover:bg-muted transition-colors">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {formattedValue}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-border/40">
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
        )}
        {badgeText && (
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${badgeClasses[badgeVariant]}`}
          >
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
}
