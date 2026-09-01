import { useState } from "react";
import {
  type PaymentLifecycleItem,
  type DashboardPaymentsResponse,
} from "@recoverai/contracts";
import { PaymentDetailModal } from "./payment-detail-modal";

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
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  FAILED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  PENDING:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  AUTHORIZED:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  CANCELLED:
    "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  REFUNDED:
    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

const worthinessBadgeClasses: Record<string, string> = {
  RECOVER:
    "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  REVIEW:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  DO_NOT_RECOVER:
    "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

const recoveryOutcomeBadgeClasses: Record<string, string> = {
  SUCCESSFUL:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  FAILED: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  ATTEMPTED:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  RECOMMENDED:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  NOT_ATTEMPTED:
    "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
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
    <div className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden flex flex-col">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Payment Recovery Lifecycle
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full audit trail from ingestion through failure analysis to recovery outcome
          </p>
        </div>

        {pagination && (
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{pagination.total}</span> events
          </div>
        )}
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th
                className="py-3 px-4 cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => onSortChange("eventTimestamp")}
              >
                <div className="flex items-center gap-1">
                  <span>Payment / Time</span>
                  {sortBy === "eventTimestamp" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>

              <th
                className="py-3 px-4 cursor-pointer hover:text-foreground select-none transition-colors"
                onClick={() => onSortChange("amount")}
              >
                <div className="flex items-center gap-1">
                  <span>Amount</span>
                  {sortBy === "amount" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>

              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Failure Category & Reason</th>
              <th className="py-3 px-4">Worthiness</th>
              <th className="py-3 px-4">Estimated Recov.</th>
              <th className="py-3 px-4">Recommended Action</th>
              <th className="py-3 px-4">Recovery Status</th>
              <th className="py-3 px-4">Actual Recov.</th>
              <th className="py-3 px-4 text-center">Env</th>
              <th className="py-3 px-4 text-right">Audit</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40 text-xs">
            {isLoading ? (
              // Loading Skeleton
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-24 bg-muted rounded mb-1" />
                    <div className="h-2.5 w-16 bg-muted/60 rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-16 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-5 w-16 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-28 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-5 w-16 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-14 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-24 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-5 w-16 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="h-3.5 w-14 bg-muted rounded" />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="h-4 w-10 bg-muted rounded mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="h-6 w-12 bg-muted rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              // Empty State
              <tr>
                <td
                  colSpan={11}
                  className="py-12 px-4 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg
                      className="h-8 w-8 text-muted-foreground/50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
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
                  "bg-muted text-muted-foreground";

                const worthinessClass = item.assessment
                  ? worthinessBadgeClasses[item.assessment.worthiness] ||
                    "bg-muted text-muted-foreground"
                  : null;

                const effectiveRecoveryStatus =
                  item.latestOutcome?.outcome ||
                  item.latestAttempt?.status ||
                  (item.recommendation ? "RECOMMENDED" : null);

                const outcomeClass = effectiveRecoveryStatus
                  ? recoveryOutcomeBadgeClasses[effectiveRecoveryStatus] ||
                    "bg-muted text-muted-foreground"
                  : null;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setSelectedPayment(item)}
                  >
                    {/* Payment / ID */}
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-foreground truncate max-w-[130px]">
                        {item.externalPaymentId}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {new Date(item.eventTimestamp).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 font-semibold text-foreground font-mono">
                      {item.currency} {item.amount}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}
                      >
                        {item.status}
                      </span>
                    </td>

                    {/* Failure Category & Reason */}
                    <td className="py-3 px-4">
                      {item.failure ? (
                        <div className="max-w-[160px]">
                          <span className="font-semibold text-rose-600 dark:text-rose-400 block truncate">
                            {item.failure.category}
                          </span>
                          <span
                            className="text-[11px] text-muted-foreground truncate block"
                            title={item.failure.failureMessage || item.failure.failureCode || ""}
                          >
                            {item.failure.failureMessage || item.failure.failureCode || "Declined"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          —
                        </span>
                      )}
                    </td>

                    {/* Worthiness */}
                    <td className="py-3 px-4">
                      {item.assessment ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${worthinessClass}`}
                        >
                          {item.assessment.worthiness}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          —
                        </span>
                      )}
                    </td>

                    {/* Estimated Recoverable */}
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {item.assessment?.estimatedRecoverableAmount !== null &&
                      item.assessment?.estimatedRecoverableAmount !== undefined ? (
                        <span className="text-foreground font-medium">
                          {item.currency}{" "}
                          {item.assessment.estimatedRecoverableAmount}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Recommended Action */}
                    <td className="py-3 px-4">
                      {item.recommendation ? (
                        <span className="font-mono text-[11px] bg-muted/80 px-1.5 py-0.5 rounded border border-border/60 text-foreground">
                          {item.recommendation.action}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          —
                        </span>
                      )}
                    </td>

                    {/* Recovery Status */}
                    <td className="py-3 px-4">
                      {effectiveRecoveryStatus ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${outcomeClass}`}
                        >
                          {effectiveRecoveryStatus}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          —
                        </span>
                      )}
                    </td>

                    {/* Actual Recovered */}
                    <td className="py-3 px-4 font-mono">
                      {item.latestOutcome?.actualRecoveredAmount !== null &&
                      item.latestOutcome?.actualRecoveredAmount !== undefined ? (
                        <span
                          className={`font-semibold ${
                            Number(item.latestOutcome.actualRecoveredAmount) > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.currency}{" "}
                          {item.latestOutcome.actualRecoveredAmount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Environment */}
                    <td className="py-3 px-4 text-center">
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                        DEMO
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPayment(item);
                        }}
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted active:scale-95 transition-all shadow-2xs"
                      >
                        Audit
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
