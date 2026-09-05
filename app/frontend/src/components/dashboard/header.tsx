"use client";

import { useState } from "react";
import { type DashboardDatePreset } from "@recoverai/contracts";
import { ThemeToggle } from "./theme-toggle";

interface HeaderProps {
  companyName?: string;
  isDemo?: boolean;
  onRefresh?: () => void;
  isLoading?: boolean;
  sseStatus?: "connected" | "connecting" | "disconnected";
  selectedDatePreset?: DashboardDatePreset;
  onDatePresetChange?: (preset: DashboardDatePreset) => void;
  onResetDemoData?: () => Promise<void> | void;
  isResetting?: boolean;
}

const DATE_PRESET_LABELS: Record<DashboardDatePreset, string> = {
  ALL: "All Time",
  "7D": "Last 7 Days",
  "30D": "Last 30 Days",
  "60D": "Last 60 Days",
};

export function DashboardHeader({
  companyName = "Acme Retail Technologies (Demo)",
  isDemo = true,
  onRefresh,
  isLoading = false,
  sseStatus = "connected",
  selectedDatePreset = "ALL",
  onDatePresetChange,
  onResetDemoData,
  isResetting = false,
}: HeaderProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleConfirmReset = async () => {
    setShowResetConfirm(false);
    if (onResetDemoData) {
      await onResetDemoData();
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md transition-colors">
      {/* Environment & Mode Notice Strip */}
      {isDemo && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center justify-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold tracking-wide text-[11px] uppercase">
            Demo / Razorpay Test Mode
          </span>
          <span className="hidden sm:inline text-amber-700/80 dark:text-amber-300/80 text-xs">
            — Operating on synthetic payment failure simulations
          </span>
        </div>
      )}

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Company Scope */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 ring-1 ring-white/20 shrink-0">
            <svg
              className="h-5 w-5"
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
              <span className="font-extrabold text-base tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text">
                RecoverAI
              </span>
              <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.2 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                Fintech Recovery
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/90">{companyName}</span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-[11px] text-muted-foreground font-mono">Single Business / Razorpay Live</span>
            </div>
          </div>
        </div>

        {/* Center: Date Range Filter Pills */}
        {onDatePresetChange && (
          <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-card/80 p-1 shadow-2xs backdrop-blur-xs self-start md:self-auto">
            {(["ALL", "7D", "30D", "60D"] as DashboardDatePreset[]).map((preset) => {
              const isSelected = selectedDatePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onDatePresetChange(preset)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {DATE_PRESET_LABELS[preset]}
                </button>
              );
            })}
          </div>
        )}

        {/* Right: Action Controls, Reset Demo Data, Live Indicator & Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5 self-end md:self-auto flex-wrap sm:flex-nowrap">
          {/* Reset Demo Data Button */}
          {onResetDemoData && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isResetting || isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 shadow-2xs hover:bg-rose-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              title="Reset Demo Data (Transactions & Recoveries)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-3.5 w-3.5 ${isResetting ? "animate-spin" : "text-rose-500"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>{isResetting ? "Resetting..." : "Reset Demo Data"}</span>
            </button>
          )}

          {/* SSE Live Connection Badge */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs backdrop-blur-xs">
            {sseStatus === "connected" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-semibold tracking-tight">
                  LIVE SSE
                </span>
              </>
            ) : sseStatus === "connecting" ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]">
                  CONNECTING...
                </span>
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <span className="text-muted-foreground font-mono text-[10px]">
                  OFFLINE
                </span>
              </>
            )}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted hover:border-border active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
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

      {/* Reset Demo Data Safety Confirmation Modal */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 border border-rose-500/20">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3
                  id="reset-modal-title"
                  className="text-base font-bold text-foreground"
                >
                  Reset Demo Data
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Development / Demo Environment Only
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This action will reset transient transaction events, recovery attempts, and payment records. It will <strong className="text-foreground">NOT</strong> affect users, providers, ML models, configuration, or Razorpay webhook listeners.
            </p>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              The dashboard metrics and payment table will enter a clean zero state. New webhook payments will continue to arrive and display normally.
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="rounded-lg border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-500 active:scale-95 transition-all cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}


