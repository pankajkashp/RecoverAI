"use client";

import { useState } from "react";
import {
  type PaymentLifecycleItem,
  type RecoveryExecutionPipelineResult,
} from "@recoverai/contracts";
import { executeRecovery, ApiError } from "@/lib/api-client";


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

          {/* Step 4: Recovery Recommendation & Execution */}
          {payment.recommendation && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
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
                    {executionResult
                      ? executionResult.isExecuted
                        ? "EXECUTED"
                        : payment.recommendation.status
                      : payment.recommendation.status}
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

              {/* Execution Action & Status Feedback Section */}
              <div
                className="pt-2.5 border-t border-violet-500/20"
                role="status"
                aria-live="polite"
              >
                {/* Case A: Ineligible Actions: CUSTOMER_ACTION_REQUIRED, REVIEW, DO_NOT_RECOVER */}
                {payment.recommendation.action !== "RETRY_PAYMENT" ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
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
                  /* Case B: Already successfully executed before opening modal */
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
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
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {payment.currency}{" "}
                      {payment.latestOutcome?.actualRecoveredAmount ?? "0.00"}
                    </span>
                  </div>
                ) : executionResult ? (
                  /* Case C: Execution Result Returned from API */
                  executionResult.status === "ALREADY_EXECUTED" ? (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                        <svg
                          className="h-4 w-4 shrink-0 text-blue-500"
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
                      <p className="text-[11px] text-blue-800/90 dark:text-blue-200/90">
                        {executionResult.message}
                      </p>
                    </div>
                  ) : executionResult.outcomeStatus === "SUCCESSFUL" ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
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
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {payment.currency}{" "}
                          {executionResult.actualRecoveredAmount ?? "0.00"} recovered
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800/90 dark:text-emerald-200/90">
                        {executionResult.message}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
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
                  /* Case D: Eligible for Execution — Show Primary Action Button */
                  <div className="space-y-2">
                    {executionError && (
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
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
                          <span className="text-[11px] text-rose-700/90 dark:text-rose-300/90">
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
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all cursor-pointer shrink-0"
                      >
                        {isExecuting ? (
                          <>
                            <svg
                              className="h-3.5 w-3.5 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
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

          {/* Step 5: Execution Attempt & Actual Outcome */}
          {(executionResult || payment.latestAttempt) && (
            <div
              className={`rounded-xl border p-4 space-y-2 ${
                (executionResult
                  ? executionResult.outcomeStatus === "SUCCESSFUL"
                  : payment.latestOutcome?.outcome === "SUCCESSFUL")
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    (executionResult
                      ? executionResult.outcomeStatus === "SUCCESSFUL"
                      : payment.latestOutcome?.outcome === "SUCCESSFUL")
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      (executionResult
                        ? executionResult.outcomeStatus === "SUCCESSFUL"
                        : payment.latestOutcome?.outcome === "SUCCESSFUL")
                        ? "bg-emerald-500"
                        : "bg-rose-500"
                    }`}
                  />
                  5. Recovery Execution & Actual Outcome
                </span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {executionResult
                    ? "Just now"
                    : payment.latestOutcome?.outcomeTimestamp
                    ? new Date(
                        payment.latestOutcome.outcomeTimestamp
                      ).toLocaleString()
                    : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Attempt Status
                  </span>
                  <span className="font-semibold text-foreground">
                    {executionResult
                      ? executionResult.attemptStatus
                      : payment.latestAttempt?.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Outcome Status
                  </span>
                  <span
                    className={`font-bold ${
                      (executionResult
                        ? executionResult.outcomeStatus === "SUCCESSFUL"
                        : payment.latestOutcome?.outcome === "SUCCESSFUL")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {executionResult
                      ? executionResult.outcomeStatus
                      : payment.latestOutcome?.outcome ?? "PENDING"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Actual Recovered
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {payment.currency}{" "}
                    {executionResult
                      ? executionResult.actualRecoveredAmount ?? "0.00"
                      : payment.latestOutcome?.actualRecoveredAmount ?? "0.00"}
                  </span>
                </div>
              </div>

              {(executionResult?.message || payment.latestOutcome?.notes) && (
                <div className="mt-1">
                  <span className="text-muted-foreground block text-[11px]">
                    Outcome Notes:
                  </span>
                  <p className="text-foreground/90 mt-0.5 italic">
                    &ldquo;
                    {executionResult?.message || payment.latestOutcome?.notes}
                    &rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {executionResult?.isExecuted && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
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
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}

