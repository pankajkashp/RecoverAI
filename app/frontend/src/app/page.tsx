"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  type DashboardSummaryResponse,
  type DashboardPaymentsResponse,
  type PaymentStatus,
  type FailureCategory,
  type RecoveryWorthiness,
  type RecoveryAttemptStatus,
  type DashboardDatePreset,
} from "@recoverai/contracts";
import {
  fetchDashboardSummary,
  fetchDashboardPayments,
  resetDemoData,
  ApiError,
} from "@/lib/api-client";
import { DashboardHeader } from "@/components/dashboard/header";
import { SummaryOverview } from "@/components/dashboard/summary-overview";
import { BreakdownCards } from "@/components/dashboard/breakdown-cards";
import {
  PaymentFilters,
  type FilterState,
} from "@/components/dashboard/payment-filters";
import { PaymentTable } from "@/components/dashboard/payment-table";

const initialFilterState: FilterState = {
  search: "",
  status: "",
  failureCategory: "",
  recoveryWorthiness: "",
  recoveryStatus: "",
};

function computeDateRange(preset: DashboardDatePreset): {
  from?: string;
  to?: string;
} {
  if (preset === "ALL") return { from: undefined, to: undefined };
  const now = new Date();
  const days = preset === "7D" ? 7 : preset === "30D" ? 30 : 60;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [payments, setPayments] = useState<DashboardPaymentsResponse | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [selectedDatePreset, setSelectedDatePreset] = useState<DashboardDatePreset>("ALL");

  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortBy, setSortBy] = useState<"eventTimestamp" | "amount">("eventTimestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isRefreshingRef = useRef(false);

  // Fetch summary data with date range
  const loadSummary = useCallback(async () => {
    try {
      setIsLoadingSummary(true);
      setError(null);
      const dateRange = computeDateRange(selectedDatePreset);
      const data = await fetchDashboardSummary(dateRange);
      setSummary(data);
    } catch (err: unknown) {
      console.error("Failed to load dashboard summary:", err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Unable to connect to RecoverAI backend read API");
      }
    } finally {
      setIsLoadingSummary(false);
    }
  }, [selectedDatePreset]);

  // Fetch payments list with date range
  const loadPayments = useCallback(async () => {
    try {
      setIsLoadingPayments(true);
      const dateRange = computeDateRange(selectedDatePreset);
      const data = await fetchDashboardPayments({
        page,
        pageSize,
        status: filters.status ? (filters.status as PaymentStatus) : undefined,
        failureCategory: filters.failureCategory
          ? (filters.failureCategory as FailureCategory)
          : undefined,
        recoveryWorthiness: filters.recoveryWorthiness
          ? (filters.recoveryWorthiness as RecoveryWorthiness)
          : undefined,
        recoveryStatus: filters.recoveryStatus
          ? (filters.recoveryStatus as RecoveryAttemptStatus)
          : undefined,
        from: dateRange.from ? new Date(dateRange.from) : undefined,
        to: dateRange.to ? new Date(dateRange.to) : undefined,
        search: filters.search ? filters.search : undefined,
        sortBy,
        sortOrder,
      });
      setPayments(data);
    } catch (err: unknown) {
      console.error("Failed to load payments:", err);
    } finally {
      setIsLoadingPayments(false);
    }
  }, [page, pageSize, filters, sortBy, sortOrder, selectedDatePreset]);

  // Initial load & when dependencies change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments();
  }, [loadPayments]);

  // Safe background refresh without duplicate overlapping calls
  const refreshDashboard = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      await Promise.allSettled([loadSummary(), loadPayments()]);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [loadSummary, loadPayments]);

  // Real-time Event-Driven Dashboard Refresh via Server-Sent Events (SSE)
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSseStatus("disconnected");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const eventSourceUrl = `${apiUrl}/api/dashboard/events`;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(eventSourceUrl, { withCredentials: true });

      eventSource.onopen = () => {
        setSseStatus("connected");
      };

      eventSource.addEventListener("dashboard_update", () => {
        refreshDashboard();
      });

      eventSource.onmessage = () => {
        refreshDashboard();
      };

      eventSource.onerror = () => {
        setSseStatus("connecting");
      };
    } catch (err) {
      console.warn("EventSource connection error:", err);
      setSseStatus("disconnected");
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [refreshDashboard]);

  const handleRefreshAll = () => {
    refreshDashboard();
  };

  const handleDatePresetChange = (preset: DashboardDatePreset) => {
    setSelectedDatePreset(preset);
    setPage(1);
  };

  const handleResetDemoData = async () => {
    try {
      setIsResetting(true);
      setError(null);
      await resetDemoData();
      await refreshDashboard();
    } catch (err: unknown) {
      console.error("Failed to reset demo data:", err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to reset demo data.");
      }
    } finally {
      setIsResetting(false);
    }
  };

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to page 1 on filter change
  };

  const handleResetFilters = () => {
    setFilters(initialFilterState);
    setPage(1);
  };

  const handleSortChange = (field: "eventTimestamp" | "amount") => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Ambient background glow effects */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-30 dark:opacity-20" aria-hidden="true">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/20 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 h-[450px] w-[450px] rounded-full bg-emerald-500/15 blur-[120px]" />
      </div>

      {/* 1. Header with Date Filter and Reset Demo Data */}
      <DashboardHeader
        companyName={summary?.company?.name || "RecoverAI"}
        isDemo={summary?.isDemo ?? true}
        onRefresh={handleRefreshAll}
        isLoading={isLoadingSummary || isLoadingPayments}
        sseStatus={sseStatus}
        selectedDatePreset={selectedDatePreset}
        onDatePresetChange={handleDatePresetChange}
        onResetDemoData={handleResetDemoData}
        isResetting={isResetting}
      />

      {/* 2. Main Dashboard Content */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Alert with Retry */}
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={handleRefreshAll}
              className="rounded-lg bg-rose-500/20 px-3 py-1 font-semibold hover:bg-rose-500/30 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* 3. Top Overview KPI Summary Cards */}
        {summary && <SummaryOverview summary={summary} />}

        {/* 4. Failure & Recovery Lifecycle Distribution Breakdowns */}
        {summary && (
          <BreakdownCards
            failureBreakdown={summary.failureBreakdown}
            recoveryBreakdown={summary.recoveryBreakdown}
          />
        )}

        {/* 5. Filter Controls */}
        <PaymentFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />

        {/* 6. Payment Recovery Lifecycle Table */}
        <PaymentTable
          data={payments}
          isLoading={isLoadingPayments}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          onRecoverySuccess={handleRefreshAll}
        />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/70 bg-card/40 backdrop-blur-md py-4 mt-auto text-xs text-muted-foreground">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>RecoverAI — Autonomous Payment Failure Recovery Platform</span>
          <span className="font-mono text-[11px] text-muted-foreground/80">
            Demo / Razorpay Test Mode (Synthetic Failure Simulations)
          </span>
        </div>
      </footer>
    </div>
  );
}