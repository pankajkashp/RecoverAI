"use client";

import { useState } from "react";
import {
  type PaymentLifecycleItem,
  type RecoveryExecutionPipelineResult,
} from "@recoverai/contracts";
import { executeRecovery, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

interface PaymentDetailModalProps {
  payment: PaymentLifecycleItem | null;
  onClose: () => void;
  onRecoverySuccess?: () => void;
}

export interface PerformRecoveryExecutionParams {
  payment: PaymentLifecycleItem;
  isExecuting: boolean;
  setIsExecuting: (val: boolean) => void;
  setExecutionResult: (val: RecoveryExecutionPipelineResult | null) => void;
  setExecutionError: (val: string | null) => void;
  onRecoverySuccess?: () => void;
  executeFn?: (
    request: Parameters<typeof executeRecovery>[0],
    token?: string
  ) => Promise<RecoveryExecutionPipelineResult>;
}

export async function performRecoveryExecution({
  payment,
  isExecuting,
  setIsExecuting,
  setExecutionResult,
  setExecutionError,
  onRecoverySuccess,
  executeFn = executeRecovery,
}: PerformRecoveryExecutionParams): Promise<
  RecoveryExecutionPipelineResult | undefined
> {
  if (isExecuting) return;
  setIsExecuting(true);
  setExecutionError(null);

  try {
    const result = await executeFn({
      paymentEventId: payment.id,
    });

    setExecutionResult(result);

    if (onRecoverySuccess) {
      onRecoverySuccess();
    }
    return result;
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
}

export function PaymentDetailModal({
  payment,
  onClose,
  onRecoverySuccess,
}: PaymentDetailModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<RecoveryExecutionPipelineResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  if (!payment) return null;

  const isAlreadySuccessful =
    payment.latestOutcome?.outcome === "SUCCESSFUL" ||
    executionResult?.outcomeStatus === "SUCCESSFUL";

  const handleExecute = () => {
    if (!payment) return;
    return performRecoveryExecution({
      payment,
      isExecuting,
      setIsExecuting,
      setExecutionResult,
      setExecutionError,
      onRecoverySuccess,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="modal-title" className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                Payment Lifecycle Audit
              </h2>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Demo / Razorpay Test Mode
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Payment Ref: {payment.externalPaymentId}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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

        {/* Modal Content / Unified Financial Ledger */}
        <div className="mt-4 overflow-y-auto pr-1 space-y-3.5 text-xs">
          <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-2xs">
            {/* 1. Transaction Details */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  1. Transaction Details
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {new Date(payment.eventTimestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Amount
                  </span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    {formatCurrency(payment.amount, payment.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Status
                  </span>
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      payment.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {payment.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Method & Provider
                  </span>
                  <span className="font-medium text-foreground">
                    {payment.paymentMethod} • {payment.providerType}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Customer Ref
                  </span>
                  <span className="font-mono text-foreground truncate block">
                    {payment.customerReference || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Failure Root Cause */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  2. Failure Root Cause
                </span>
                {payment.failure && (
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {new Date(payment.failure.failedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {payment.failure ? (
                <div className="space-y-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold block">
                        Category
                      </span>
                      <span className="font-semibold text-rose-700 dark:text-rose-300">
                        {payment.failure.category}
                      </span>
                    </div>
                    {payment.failure.failureCode && (
                      <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-semibold block">
                          Failure Code
                        </span>
                        <span className="font-mono text-foreground">
                          {payment.failure.failureCode}
                        </span>
                      </div>
                    )}
                  </div>

                  {payment.failure.failureMessage && (
                    <div className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-0.5">
                        Provider Failure Explanation
                      </span>
                      <p className="text-foreground/90 font-mono text-[11px] leading-relaxed">
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

            {/* 3. Recovery Intelligence */}
            {payment.assessment && (
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    3. Recovery Intelligence
                  </span>
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {new Date(payment.assessment.assessedAt).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-0.5">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Worthiness Decision
                    </span>
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
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

                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Estimated Recoverable
                    </span>
                    <span className="font-mono font-bold text-foreground text-sm">
                      {formatCurrency(
                        payment.assessment.estimatedRecoverableAmount,
                        payment.currency
                      )}
                    </span>
                  </div>

                  {payment.assessment.confidence !== null &&
                    payment.assessment.confidence !== undefined && (
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                          Model Confidence
                        </span>
                        <span className="font-mono font-semibold text-foreground">
                          {Math.round(payment.assessment.confidence * 100)}%
                        </span>
                      </div>
                    )}
                </div>


                {payment.assessment.reasoning && (
                  <div className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-0.5">
                      Recovery Intelligence Reasoning
                    </span>
                    <p className="text-foreground/90 leading-relaxed">
                      {payment.assessment.reasoning}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 4. Recovery Action & Interactive Execution */}
            {payment.recommendation && (
              <div className="p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500" />
                    4. Recovery Action
                  </span>
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {new Date(payment.recommendation.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-0.5">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Recommended Action
                    </span>
                    <span className="font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded border border-border inline-block">
                      {payment.recommendation.action}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Recommendation Status
                    </span>
                    <span className="font-semibold text-foreground">
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

                {/* Execution / Resolution Sub-Panel */}
                <div
                  className="pt-3 border-t border-border/60"
                  role="status"
                  aria-live="polite"
                >
                  {/* Ineligible Actions */}
                  {payment.recommendation.action !== "RETRY_PAYMENT" ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
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
                      <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
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
                    /* Already successfully executed prior to opening modal */
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        <svg
                          className="h-4 w-4 shrink-0 text-emerald-500"
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
                        <span>Already Executed</span>
                        <span className="text-[11px] font-normal text-muted-foreground">
                          — Successfully recovered
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(
                          payment.latestOutcome?.actualRecoveredAmount,
                          payment.currency
                        )}
                      </span>
                    </div>
                  ) : executionResult ? (
                    /* Execution Result Returned from API */
                    executionResult.status === "ALREADY_EXECUTED" ? (
                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300">
                          <svg
                            className="h-4 w-4 shrink-0 text-sky-500"
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
                          <span>Already Executed</span>
                        </div>
                        <p className="text-[11px] text-sky-800/90 dark:text-sky-200/90">
                          {executionResult.message}
                        </p>
                      </div>
                    ) : executionResult.outcomeStatus === "SUCCESSFUL" ? (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            <svg
                              className="h-4 w-4 shrink-0 text-emerald-500"
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
                          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(
                              executionResult.actualRecoveredAmount,
                              payment.currency
                            )}{" "}
                            recovered
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800/90 dark:text-emerald-200/90">
                          {executionResult.message}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 dark:text-rose-300">
                          <svg
                            className="h-4 w-4 shrink-0 text-rose-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Recovery Failed</span>
                        </div>
                        <p className="text-[11px] text-rose-800/90 dark:text-rose-200/90">
                          {executionResult.message ||
                            "Recovery attempt executed but funds could not be recovered."}
                        </p>
                      </div>
                    )
                  ) : (
                    /* Eligible for Execution — Primary Action Trigger */
                    <div className="space-y-2">
                      {executionError && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
                          <svg
                            className="h-4 w-4 shrink-0 mt-0.5 text-rose-500"
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
                            <span className="font-semibold block">Recovery Failed</span>
                            <span className="text-[11px] leading-relaxed">
                              {executionError}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <p className="text-[11px] text-muted-foreground">
                          Initiates synthetic automated retry via provider adapter boundary.
                        </p>
                        <button
                          type="button"
                          onClick={handleExecute}
                          disabled={isExecuting}
                          aria-busy={isExecuting}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all cursor-pointer shrink-0"
                        >
                          {isExecuting ? (
                            <>
                              <svg
                                className="h-3.5 w-3.5 animate-spin text-white"
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
                              <span>Executing...</span>
                            </>
                          ) : (
                            <>
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

            {/* 5. Verified Outcome */}
            {(executionResult || payment.latestAttempt) && (
              <div className="p-4 space-y-2.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        (executionResult
                          ? executionResult.outcomeStatus === "SUCCESSFUL"
                          : payment.latestOutcome?.outcome === "SUCCESSFUL")
                          ? "bg-emerald-500"
                          : "bg-rose-500"
                      }`}
                    />
                    5. Verified Outcome
                  </span>
                  <span className="font-mono text-muted-foreground text-[11px]">
                    {executionResult
                      ? "Verified just now"
                      : payment.latestOutcome?.outcomeTimestamp
                      ? new Date(
                          payment.latestOutcome.outcomeTimestamp
                        ).toLocaleString()
                      : ""}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Attempt Status
                    </span>
                    <span className="font-mono font-semibold text-foreground">
                      {executionResult
                        ? executionResult.attemptStatus
                        : payment.latestAttempt?.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Outcome Status
                    </span>
                    <span
                      className={`font-semibold ${
                        (executionResult
                          ? executionResult.outcomeStatus === "SUCCESSFUL"
                          : payment.latestOutcome?.outcome === "SUCCESSFUL")
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {executionResult
                        ? executionResult.outcomeStatus
                        : payment.latestOutcome?.outcome ?? "PENDING"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Actually Recovered
                    </span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-300 font-mono text-sm">
                      {formatCurrency(
                        executionResult
                          ? executionResult.actualRecoveredAmount
                          : payment.latestOutcome?.actualRecoveredAmount,
                        payment.currency
                      )}
                    </span>
                  </div>
                </div>

                {(executionResult?.message || payment.latestOutcome?.notes) && (
                  <div className="rounded-md border border-border/70 bg-card p-2.5 mt-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground block mb-0.5">
                      Provider Verification Notes
                    </span>
                    <p className="text-foreground/90 font-mono text-[11px] leading-relaxed">
                      &ldquo;
                      {executionResult?.message || payment.latestOutcome?.notes}
                      &rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {executionResult?.isExecuted && (
              <span className="text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 shrink-0"
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
                <span>Dashboard metrics updated</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Close Details
          </button>

        </div>
      </div>
    </div>
  );
}
