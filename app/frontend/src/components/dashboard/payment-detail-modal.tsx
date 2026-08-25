import { type PaymentLifecycleItem } from "@recoverai/contracts";

interface PaymentDetailModalProps {
  payment: PaymentLifecycleItem | null;
  onClose: () => void;
}

export function PaymentDetailModal({
  payment,
  onClose,
}: PaymentDetailModalProps) {
  if (!payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">
                Payment Lifecycle Audit
              </h2>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                Demo / Sandbox
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              ID: {payment.externalPaymentId}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Content / Timeline */}
        <div className="mt-4 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* Step 1: Canonical Payment Event */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                1. Canonical Payment Event
              </span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {new Date(payment.eventTimestamp).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Amount
                </span>
                <span className="font-semibold text-foreground">
                  {payment.currency} {payment.amount}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Status
                </span>
                <span
                  className={`font-semibold ${
                    payment.status === "COMPLETED"
                      ? "text-emerald-500"
                      : "text-rose-500"
                  }`}
                >
                  {payment.status}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Method
                </span>
                <span className="font-semibold text-foreground">
                  {payment.paymentMethod}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Provider
                </span>
                <span className="font-semibold text-foreground">
                  {payment.providerType}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Customer Ref
                </span>
                <span className="font-mono text-foreground">
                  {payment.customerReference || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Step 2: Payment Failure Analysis */}
          {payment.failure ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  2. Failure Analysis
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {new Date(payment.failure.failedAt).toLocaleString()}
                </span>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-bold text-foreground">
                    {payment.failure.category}
                  </span>
                </div>
                {payment.failure.failureCode && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Code:</span>
                    <span className="font-mono text-foreground">
                      {payment.failure.failureCode}
                    </span>
                  </div>
                )}
                {payment.failure.failureMessage && (
                  <div className="text-muted-foreground mt-1">
                    <span className="block text-[11px] font-semibold text-foreground/80">
                      Reason / Message:
                    </span>
                    <p className="italic text-foreground/90 bg-background/50 p-2 rounded-md border border-border/40 mt-0.5">
                      &ldquo;{payment.failure.failureMessage}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/20 text-muted-foreground italic">
              No failure analysis required (Payment succeeded).
            </div>
          )}

          {/* Step 3: Recovery Intelligence Assessment */}
          {payment.assessment && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  3. Recovery Assessment
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {new Date(payment.assessment.assessedAt).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Worthiness Decision
                  </span>
                  <span className="font-bold text-foreground">
                    {payment.assessment.worthiness}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Estimated Recoverable
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {payment.currency}{" "}
                    {payment.assessment.estimatedRecoverableAmount ?? "0.00"}
                  </span>
                </div>
              </div>
              {payment.assessment.reasoning && (
                <div className="mt-1">
                  <span className="text-muted-foreground block text-[11px]">
                    Intelligence Reasoning:
                  </span>
                  <p className="text-foreground/90 mt-0.5">
                    {payment.assessment.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Recovery Recommendation */}
          {payment.recommendation && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  4. Recommended Action
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {new Date(payment.recommendation.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Action
                  </span>
                  <span className="font-bold text-foreground">
                    {payment.recommendation.action}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Recommendation Status
                  </span>
                  <span className="font-semibold text-foreground">
                    {payment.recommendation.status}
                  </span>
                </div>
              </div>
              {payment.recommendation.reason && (
                <div className="mt-1">
                  <span className="text-muted-foreground block text-[11px]">
                    Action Explanation:
                  </span>
                  <p className="text-foreground/90 mt-0.5">
                    {payment.recommendation.reason}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Execution Attempt & Outcome */}
          {payment.latestAttempt && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  5. Recovery Execution & Actual Outcome
                </span>
                {payment.latestOutcome?.outcomeTimestamp && (
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {new Date(
                      payment.latestOutcome.outcomeTimestamp
                    ).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Attempt Status
                  </span>
                  <span className="font-semibold text-foreground">
                    {payment.latestAttempt.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Outcome Status
                  </span>
                  <span
                    className={`font-bold ${
                      payment.latestOutcome?.outcome === "SUCCESSFUL"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {payment.latestOutcome?.outcome ?? "PENDING"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Actual Recovered
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {payment.currency}{" "}
                    {payment.latestOutcome?.actualRecoveredAmount ?? "0.00"}
                  </span>
                </div>
              </div>

              {payment.latestOutcome?.notes && (
                <div className="mt-1">
                  <span className="text-muted-foreground block text-[11px]">
                    Outcome Notes:
                  </span>
                  <p className="text-foreground/90 mt-0.5 italic">
                    &ldquo;{payment.latestOutcome.notes}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}
