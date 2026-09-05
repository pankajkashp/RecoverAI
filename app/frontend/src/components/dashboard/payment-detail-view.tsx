"use client";

import { useState } from "react";
import {
  type PaymentLifecycleItem,
  type RecoveryExecutionPipelineResult,
} from "@recoverai/contracts";
import { executeRecovery, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

interface PaymentDetailViewProps {
  payment: PaymentLifecycleItem;
  onBack: () => void;
  onRecoverySuccess?: () => void;
}

export function PaymentDetailView({
  payment,
  onBack,
  onRecoverySuccess,
}: PaymentDetailViewProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<RecoveryExecutionPipelineResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const isAlreadySuccessful =
    payment.latestOutcome?.outcome === "SUCCESSFUL" ||
    executionResult?.outcomeStatus === "SUCCESSFUL";

  const handleExecute = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutionError(null);

    try {
      const result = await executeRecovery({
        paymentEventId: payment.id,
      });
      setExecutionResult(result);
      if (onRecoverySuccess) {
        onRecoverySuccess();
      }
    } catch (err: unknown) {
      let message =
        "Recovery execution failed. Please check network connectivity.";
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setExecutionError(message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const activeCheckoutUrl = executionResult?.checkoutUrl;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in-50 duration-200">
      {/* 1. Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-border transition-all cursor-pointer shadow-xs active:scale-95"
            title="Return to RecoverAI Dashboard"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Back to Dashboard</span>
          </button>

          <div className="h-5 w-px bg-border hidden sm:block" />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                Payment Lifecycle & Recovery Audit
              </h1>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Demo / Razorpay Test Mode
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Payment Ref: {payment.externalPaymentId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              payment.status === "COMPLETED"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : payment.status === "FAILED"
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                : "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                payment.status === "COMPLETED"
                  ? "bg-emerald-500"
                  : payment.status === "FAILED"
                  ? "bg-rose-500"
                  : "bg-amber-500"
              }`}
            />
            Status: {payment.status}
          </span>
        </div>
      </div>

      {/* 2. Structured Sections Container */}
      <div className="rounded-2xl border border-border/80 bg-card/90 shadow-sm divide-y divide-border/80 overflow-hidden">
        {/* Section 1: Transaction Details */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
              1. Transaction Details
            </span>
            <span className="font-mono text-muted-foreground text-xs">
              {new Date(payment.eventTimestamp).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                Gross Amount
              </span>
              <span className="font-mono font-bold text-foreground text-base sm:text-lg">
                {formatCurrency(payment.amount, payment.currency)}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                Payment Status
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase ${
                  payment.status === "COMPLETED"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                }`}
              >
                {payment.status}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                Method & Gateway
              </span>
              <span className="font-medium text-foreground text-xs sm:text-sm">
                {payment.paymentMethod} • {payment.providerType}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                Customer Reference
              </span>
              <span className="font-mono text-foreground text-xs sm:text-sm truncate block">
                {payment.customerReference || "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Failure Root Cause & Diagnostics */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              2. Failure Root Cause & Diagnostics
            </span>
            {payment.failure && (
              <span className="font-mono text-muted-foreground text-xs">
                {new Date(payment.failure.failedAt).toLocaleString()}
              </span>
            )}
          </div>

          {payment.failure ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-6 text-xs">
                <div>
                  <span className="text-muted-foreground text-[11px] uppercase font-semibold block">
                    Normalized Category
                  </span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300 text-sm">
                    {payment.failure.category}
                  </span>
                </div>
                {payment.failure.failureCode && (
                  <div>
                    <span className="text-muted-foreground text-[11px] uppercase font-semibold block">
                      Failure Code
                    </span>
                    <span className="font-mono text-foreground text-sm">
                      {payment.failure.failureCode}
                    </span>
                  </div>
                )}
              </div>

              {payment.failure.failureMessage && (
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-1">
                    Provider Error Message
                  </span>
                  <p className="text-foreground/90 font-mono text-xs leading-relaxed">
                    &ldquo;{payment.failure.failureMessage}&rdquo;
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs italic">
              No failure detected for this transaction.
            </p>
          )}
        </div>

        {/* Section 3: Recovery Intelligence & AI Assessment */}
        {payment.assessment && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                3. Recovery Intelligence & Worthiness
              </span>
              <span className="font-mono text-muted-foreground text-xs">
                {new Date(payment.assessment.assessedAt).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Worthiness Decision
                </span>
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    payment.assessment.worthiness === "RECOVER"
                      ? "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30"
                      : payment.assessment.worthiness === "REVIEW"
                      ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {payment.assessment.worthiness}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Estimated Recoverable
                </span>
                <span className="font-mono font-bold text-foreground text-base sm:text-lg">
                  {formatCurrency(
                    payment.assessment.estimatedRecoverableAmount,
                    payment.currency
                  )}
                </span>
              </div>

              {payment.assessment.confidence !== null &&
                payment.assessment.confidence !== undefined && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                      Recovery Confidence
                    </span>
                    <span className="font-mono font-semibold text-foreground text-base">
                      {Math.round(payment.assessment.confidence * 100)}%
                    </span>
                  </div>
                )}
            </div>

            {payment.assessment.reasoning && (
              <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-1">
                  Recovery Intelligence Reasoning
                </span>
                <p className="text-foreground/90 text-xs leading-relaxed">
                  {payment.assessment.reasoning}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Section 4: Recovery Action & Interactive Execution */}
        {payment.recommendation && (
          <div className="p-5 sm:p-6 space-y-4 bg-muted/10">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                4. Recovery Action & Execution
              </span>
              <span className="font-mono text-muted-foreground text-xs">
                {new Date(payment.recommendation.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Recommended Strategy
                </span>
                <span className="font-mono font-semibold text-foreground bg-muted px-2.5 py-1 rounded-md border border-border inline-block text-xs">
                  {payment.recommendation.action}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Status
                </span>
                <span className="font-semibold text-foreground text-xs sm:text-sm">
                  {executionResult
                    ? executionResult.isExecuted
                      ? "EXECUTED"
                      : payment.recommendation.status
                    : payment.recommendation.status}
                </span>
              </div>
            </div>

            {payment.recommendation.reason && (
              <p className="text-foreground/90 text-xs leading-relaxed">
                {payment.recommendation.reason}
              </p>
            )}

            {/* Execution Controls & Sub-Panels */}
            <div
              className="pt-4 border-t border-border/60"
              role="status"
              aria-live="polite"
            >
              {payment.recommendation.action !== "RETRY_PAYMENT" ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <svg
                      className="h-4 w-4 shrink-0 text-amber-500"
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
                    <span>Manual/customer action required</span>
                  </div>
                  <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                    {payment.recommendation.action ===
                      "CUSTOMER_ACTION_REQUIRED" &&
                      "Automated recovery unavailable: This failure requires customer intervention (e.g. updating payment method, re-authenticating 3D-Secure, or account balance verification)."}
                    {payment.recommendation.action === "REVIEW" &&
                      "Automated recovery unavailable: This transaction is flagged for manual risk/compliance review before any recovery attempt may proceed."}
                    {payment.recommendation.action === "DO_NOT_RECOVER" &&
                      "Automated recovery unavailable: Transaction was evaluated as non-recoverable (permanent decline or fraud prevention rule)."}
                  </p>
                </div>
              ) : isAlreadySuccessful && !executionResult ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <svg
                      className="h-5 w-5 shrink-0 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Already Executed — Successfully recovered</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(
                      payment.latestOutcome?.actualRecoveredAmount,
                      payment.currency
                    )}
                  </span>
                </div>
              ) : payment.latestAttempt?.status === "ATTEMPTED" && !executionResult ? (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-300">
                    <svg
                      className="h-5 w-5 shrink-0 text-sky-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Recovery Attempt Executed — Razorpay Payment Link active (awaiting provider confirmation)</span>
                  </div>
                </div>
              ) : executionResult ? (
                executionResult.outcomeStatus === "SUCCESSFUL" ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        <svg
                          className="h-5 w-5 shrink-0 text-emerald-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>Recovery Successful</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(
                          executionResult.actualRecoveredAmount,
                          payment.currency
                        )}{" "}
                        recovered
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                      {executionResult.message}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-300">
                      <svg
                        className="h-5 w-5 shrink-0 text-sky-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>Recovery Link Created & In Flight</span>
                    </div>
                    <p className="text-xs text-sky-800/90 dark:text-sky-200/90">
                      {executionResult.message}
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {executionError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                      <svg
                        className="h-5 w-5 shrink-0 text-rose-500"
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
                      <div>
                        <span className="font-semibold block">Execution Failed</span>
                        <span className="text-xs leading-relaxed">{executionError}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                      Creates a live Razorpay Payment Link and dispatches customer recovery notification.
                    </p>
                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={isExecuting}
                      aria-busy={isExecuting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all cursor-pointer shrink-0"
                    >
                      {isExecuting ? (
                        <>
                          <svg
                            className="h-4 w-4 animate-spin text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Executing Recovery...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Execute Recovery Attempt</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 5: Verified Outcome & Active Link */}
        {(executionResult || payment.latestAttempt || activeCheckoutUrl) && (
          <div className="p-5 sm:p-6 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    (executionResult
                      ? executionResult.outcomeStatus === "SUCCESSFUL"
                      : payment.latestOutcome?.outcome === "SUCCESSFUL")
                      ? "bg-emerald-500"
                      : "bg-indigo-500"
                  }`}
                />
                5. Verified Outcome & Attribution
              </span>
              <span className="font-mono text-muted-foreground text-xs">
                {executionResult
                  ? "Verified just now"
                  : payment.latestOutcome?.outcomeTimestamp
                  ? new Date(
                      payment.latestOutcome.outcomeTimestamp
                    ).toLocaleString()
                  : ""}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Attempt Status
                </span>
                <span className="font-mono font-semibold text-foreground text-xs sm:text-sm">
                  {executionResult
                    ? executionResult.attemptStatus
                    : payment.latestAttempt?.status}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Outcome Status
                </span>
                <span
                  className={`font-semibold text-xs sm:text-sm ${
                    (executionResult
                      ? executionResult.outcomeStatus === "SUCCESSFUL"
                      : payment.latestOutcome?.outcome === "SUCCESSFUL")
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-indigo-700 dark:text-indigo-300"
                  }`}
                >
                  {executionResult
                    ? executionResult.outcomeStatus
                    : payment.latestOutcome?.outcome ?? "IN_FLIGHT"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                  Actually Recovered
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 font-mono text-base">
                  {formatCurrency(
                    executionResult
                      ? executionResult.actualRecoveredAmount
                      : payment.latestOutcome?.actualRecoveredAmount,
                    payment.currency
                  )}
                </span>
              </div>
            </div>

            {activeCheckoutUrl && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-indigo-700 dark:text-indigo-400 block">
                    Razorpay Recovery Payment Link
                  </span>
                  <p className="text-xs font-mono text-foreground/90 truncate">
                    {activeCheckoutUrl}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyLink(activeCheckoutUrl)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs"
                  >
                    {copiedLink ? "✓ Copied" : "Copy Link"}
                  </button>
                  <a
                    href={activeCheckoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition-colors cursor-pointer"
                  >
                    <span>Open Payment Link</span>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Bottom Action Bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
        >
          ← Back to Dashboard
        </button>
        {executionResult?.isExecuted && (
          <span className="text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            Dashboard metrics automatically updated
          </span>
        )}
      </div>
    </div>
  );
}
