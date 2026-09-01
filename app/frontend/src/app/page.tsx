"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type DashboardSummaryResponse,
  type DashboardPaymentsResponse,
  type PaymentStatus,
  type FailureCategory,
  type RecoveryWorthiness,
  type RecoveryAttemptStatus,
} from "@recoverai/contracts";
import {
  fetchDashboardSummary,
  fetchDashboardPayments,
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

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [payments, setPayments] = useState<DashboardPaymentsResponse | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [sortBy, setSortBy] = useState<"eventTimestamp" | "amount">("eventTimestamp");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch summary data
  const loadSummary = useCallback(async () => {
    try {
      setIsLoadingSummary(true);
      setError(null);
      const data = await fetchDashboardSummary();
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
  }, []);

  // Fetch payments list
  const loadPayments = useCallback(async () => {
    try {
      setIsLoadingPayments(true);
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
        search: filters.search ? filters.search : undefined,
        sortBy,
        sortOrder,
      });
      setPayments(data);
    } catch (err: unknown) {
      console.error("Failed to load payments:", err);
      // We don't overwrite the main error unless summary also failed
    } finally {
      setIsLoadingPayments(false);
    }
  }, [page, pageSize, filters, sortBy, sortOrder]);

  // Initial load & when dependencies change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPayments();
  }, [loadPayments]);

  const handleRefreshAll = () => {
    loadSummary();
    loadPayments();
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
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* 1. Header */}
      <DashboardHeader
        companyName={summary?.company.name}
        isDemo={summary?.isDemo ?? true}
        onRefresh={handleRefreshAll}
        isLoading={isLoadingSummary || isLoadingPayments}
      />

      {/* 2. Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Alert with Retry */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3">
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
              className="rounded-md bg-rose-500/20 px-3 py-1 font-semibold hover:bg-rose-500/30 transition-colors"
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
      <footer className="border-t border-border/80 bg-card/40 py-4 mt-auto text-center text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>RecoverAI — Autonomous Payment Failure Recovery Platform</span>
          <span className="font-mono text-[11px] text-muted-foreground/70">
            Phase 9 Dashboard & Read API (Synthetic Demo Context)
          </span>
        </div>
      </footer>
    </div>
  );
}