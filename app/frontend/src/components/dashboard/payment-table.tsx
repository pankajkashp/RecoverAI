import { useState } from "react";
import {
  type PaymentLifecycleItem,
  type DashboardPaymentsResponse,
} from "@recoverai/contracts";
import { PaymentDetailModal } from "./payment-detail-modal";
import { formatCurrency } from "@/lib/utils";

interface PaymentTableProps {
  data: DashboardPaymentsResponse | null;
  isLoading: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (field: "eventTimestamp" | "amount") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRecoverySuccess?: () => void;
}

const statusBadgeClasses: Record<string, string> = {
  COMPLETED:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  FAILED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  PENDING:
    "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  AUTHORIZED:
    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  CANCELLED:
    "bg-muted text-muted-foreground border-border",
  REFUNDED:
    "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
};

const worthinessBadgeClasses: Record<string, string> = {
  RECOVER:
    "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30",
  REVIEW:
    "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  DO_NOT_RECOVER:
    "bg-muted text-muted-foreground border-border",
};

const recoveryOutcomeBadgeClasses: Record<string, string> = {
  SUCCESSFUL:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  FAILED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  ATTEMPTED:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  RECOMMENDED:
    "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  NOT_ATTEMPTED:
    "bg-muted text-muted-foreground border-border",
};

const ACTION_LABELS: Record<string, string> = {
  RETRY_PAYMENT: "Retry payment",
  CUSTOMER_ACTION_REQUIRED: "Customer action required",
  REVIEW: "Review required",
  DO_NOT_RECOVER: "Do not recover",
};

const WORTHINESS_LABELS: Record<string, string> = {
  RECOVER: "Recoverable",
  REVIEW: "Review required",
  DO_NOT_RECOVER: "Do not recover",
};

const RECOVERY_OUTCOME_LABELS: Record<string, string> = {
  SUCCESSFUL: "Recovered",
  FAILED: "Recovery failed",
  ATTEMPTED: "Attempted",
  RECOMMENDED: "Pending execution",
  PENDING: "Processing",
};

export function PaymentTable({
  data,
  isLoading,
  sortBy,
  sortOrder,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onRecoverySuccess,
}: PaymentTableProps) {

  const [selectedPayment, setSelectedPayment] =
    useState<PaymentLifecycleItem | null>(null);

  const items = data?.items || [];
  const pagination = data?.pagination;

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground tracking-tight">
            Ingested Payment Events & Recovery Chain
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time canonical payment failure stream and automated recovery decisions
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded border border-border/60">
            {pagination ? `${pagination.total} total events` : "0 total events"}
          </span>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {/* 1. Payment & Time */}
              <th
                scope="col"
                aria-sort={
                  sortBy === "eventTimestamp"
                    ? sortOrder === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="py-2.5 px-3 cursor-pointer hover:text-foreground select-none transition-colors w-[14%]"
                onClick={() => onSortChange("eventTimestamp")}
              >
                <div className="flex items-center gap-1">
                  <span>Payment / Time</span>
                  {sortBy === "eventTimestamp" && (
                    <span className="font-mono">{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>

              {/* 2. Amount */}
              <th
                scope="col"
                aria-sort={
                  sortBy === "amount"
                    ? sortOrder === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className="py-2.5 px-3 text-right cursor-pointer hover:text-foreground select-none transition-colors w-[11%]"
                onClick={() => onSortChange("amount")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Amount</span>
                  {sortBy === "amount" && (
                    <span className="font-mono">{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>

              {/* 3. Status & Failure Reason */}
              <th scope="col" className="py-2.5 px-3 w-[25%]">
                Status & Root Cause
              </th>

              {/* 4. Recoverability */}
              <th scope="col" className="py-2.5 px-3 w-[18%]">
                Recoverability
              </th>

              {/* 5. Recommended Action */}
              <th scope="col" className="py-2.5 px-3 w-[14%]">
                Recommended Action
              </th>

              {/* 6. Recovery Result & Actual Recovered */}
              <th scope="col" className="py-2.5 px-3 text-right w-[12%]">
                Recovery Result
              </th>

              {/* 7. Action */}
              <th scope="col" className="py-2.5 px-3 text-right w-[6%]">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40 text-xs">
            {isLoading ? (
              // Loading Skeleton
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <td className="py-3 px-3">
                    <div className="h-3.5 w-24 bg-muted rounded mb-1" />
                    <div className="h-2.5 w-16 bg-muted/60 rounded" />
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="h-3.5 w-20 bg-muted rounded ml-auto" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-4 w-20 bg-muted rounded mb-1" />
                    <div className="h-3 w-32 bg-muted/60 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-4 w-18 bg-muted rounded mb-1" />
                    <div className="h-3 w-20 bg-muted/60 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-4 w-24 bg-muted rounded" />
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="h-4 w-20 bg-muted rounded mb-1 ml-auto" />
                    <div className="h-3 w-16 bg-muted/60 rounded ml-auto" />
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="h-6 w-12 bg-muted rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              // Empty State
              <tr>
                <td
                  colSpan={7}
                  className="py-12 px-4 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg
                      className="h-8 w-8 text-muted-foreground/40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                    <p className="font-semibold text-foreground text-sm">
                      No payment events found
                    </p>
                    <p className="text-xs max-w-sm">
                      Try clearing or adjusting your search and filter criteria.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              // Data Rows
              items.map((item) => {
                const statusClass =
                  statusBadgeClasses[item.status] ||
                  "bg-muted text-muted-foreground border-border";

                const worthinessClass = item.assessment
                  ? worthinessBadgeClasses[item.assessment.worthiness] ||
                    "bg-muted text-muted-foreground border-border"
                  : null;

                const effectiveRecoveryStatus =
                  item.latestOutcome?.outcome ||
                  item.latestAttempt?.status ||
                  (item.recommendation ? "RECOMMENDED" : null);

                const outcomeClass = effectiveRecoveryStatus
                  ? recoveryOutcomeBadgeClasses[effectiveRecoveryStatus] ||
                    "bg-muted text-muted-foreground border-border"
                  : null;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedPayment(item)}
                  >
                    {/* 1. Payment ID & Timestamp */}
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-medium text-foreground truncate max-w-[130px]">
                        {item.externalPaymentId}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {new Date(item.eventTimestamp).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </div>
                    </td>

                    {/* 2. Amount */}
                    <td className="py-2.5 px-3 text-right font-semibold text-foreground font-mono tabular-nums whitespace-nowrap">
                      {formatCurrency(item.amount, item.currency)}
                    </td>

                    {/* 3. Status & Failure Root Cause */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass}`}
                        >
                          {item.status}
                        </span>
                        {item.failure && (
                          <span className="font-medium text-rose-700 dark:text-rose-300 truncate max-w-[150px]">
                            {item.failure.category}
                          </span>
                        )}
                      </div>
                      {item.failure?.failureMessage || item.failure?.failureCode ? (
                        <div
                          className="text-[11px] text-muted-foreground truncate max-w-[240px] mt-0.5"
                          title={item.failure.failureMessage || item.failure.failureCode || ""}
                        >
                          {item.failure.failureMessage || item.failure.failureCode}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>

                    {/* 4. Recoverability & Estimated Recovery */}
                    <td className="py-2.5 px-3">
                      {item.assessment ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${worthinessClass}`}
                            >
                              {WORTHINESS_LABELS[item.assessment.worthiness] || item.assessment.worthiness}
                            </span>
                            {item.assessment.confidence !== null && item.assessment.confidence !== undefined && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {Math.round(item.assessment.confidence * 100)}% confidence
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-foreground/90 font-medium">
                            {item.assessment.estimatedRecoverableAmount !== null &&
                            item.assessment.estimatedRecoverableAmount !== undefined ? (
                              <span>
                                Est. {formatCurrency(item.assessment.estimatedRecoverableAmount, item.currency)}
                              </span>
                            ) : (
                              "Est. —"
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>

                    {/* 5. Recommended Action */}
                    <td className="py-2.5 px-3">
                      {item.recommendation ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${
                            item.recommendation.action === "RETRY_PAYMENT"
                              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20"
                              : item.recommendation.action === "CUSTOMER_ACTION_REQUIRED"
                              ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20"
                              : "bg-muted text-foreground border-border"
                          }`}
                        >
                          {ACTION_LABELS[item.recommendation.action] || item.recommendation.action}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          —
                        </span>
                      )}
                    </td>

                    {/* 6. Recovery Result & Actual Recovered */}
                    <td className="py-2.5 px-3 text-right">
                      {effectiveRecoveryStatus ? (
                        <div>
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${outcomeClass}`}
                          >
                            {RECOVERY_OUTCOME_LABELS[effectiveRecoveryStatus] || effectiveRecoveryStatus}
                          </span>
                          <div className="font-mono tabular-nums text-[11px] mt-0.5">
                            {item.latestOutcome?.actualRecoveredAmount !== null &&
                            item.latestOutcome?.actualRecoveredAmount !== undefined ? (
                              <span
                                className={`font-semibold ${
                                  Number(item.latestOutcome.actualRecoveredAmount) > 0
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {formatCurrency(item.latestOutcome.actualRecoveredAmount, item.currency)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>

                    {/* 7. Action Button */}
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPayment(item);
                        }}
                        className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs"
                        title="View payment lifecycle details"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>


      {/* Pagination Bar */}
      {pagination && pagination.totalPages > 0 && (
        <div className="p-3.5 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-muted/20">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Show:</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>per page</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => onPageChange(pagination.page - 1)}
              className="rounded-md border border-border bg-card px-2.5 py-1 font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>

            <span className="font-medium text-foreground px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => onPageChange(pagination.page + 1)}
              className="rounded-md border border-border bg-card px-2.5 py-1 font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedPayment && (
        <PaymentDetailModal
          key={selectedPayment.id}
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onRecoverySuccess={onRecoverySuccess}
        />
      )}


    </div>
  );
}
