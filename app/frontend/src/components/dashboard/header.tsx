"use client";

import { ThemeToggle } from "./theme-toggle";

interface HeaderProps {
  companyName?: string;
  isDemo?: boolean;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function DashboardHeader({
  companyName = "Acme Retail Technologies (Demo)",
  isDemo = true,
  onRefresh,
  isLoading = false,
}: HeaderProps) {
  return (
    <header className="border-b border-border bg-card sticky top-0 z-30 transition-colors">
      {/* Environment & Mode Notice Strip */}
      {isDemo && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center justify-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="font-semibold tracking-wide text-[11px] uppercase">
            Demo / Razorpay Test Mode
          </span>
          <span className="hidden sm:inline text-amber-700/80 dark:text-amber-300/80 text-xs">
            — Operating on synthetic payment failure simulations
          </span>
        </div>
      )}

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Brand & Company Scope */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <svg
              className="h-4.5 w-4.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-foreground">
                RecoverAI
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{companyName}</span>
              <span>•</span>
              <span className="text-[11px] text-muted-foreground font-mono">Single Business / Razorpay Live</span>
            </div>
          </div>
        </div>


        {/* Action Controls & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted active:scale-95 transition-all disabled:opacity-50"
              title="Refresh Dashboard Data"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-primary" : "text-muted-foreground"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{isLoading ? "Syncing..." : "Refresh"}</span>
            </button>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
