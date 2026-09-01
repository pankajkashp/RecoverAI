import { describe, expect, it, vi, beforeEach } from "vitest";
import DashboardPage from "./page";
import {
  fetchDashboardSummary,
  fetchDashboardPayments,
  ApiError,
} from "../lib/api-client";

describe("Phase 9 — Frontend Dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the main DashboardPage component function", () => {
    expect(DashboardPage).toBeTypeOf("function");
  });

  describe("API Client — fetchDashboardSummary", () => {
    it("successfully fetches and validates summary data", async () => {
      const mockSummaryData = {
        company: {
          id: "demo_comp_001",
          name: "Acme Retail Technologies (Demo)",
        },
        currency: "INR",
        isDemo: true,
        metrics: {
          totalPayments: 10,
          failedPayments: 4,
          successfulPayments: 6,
          failureRate: 40.0,
          totalPaymentValue: "50000.00",
          potentiallyRecoverableAmount: "25000.00",
          estimatedRecoverableAmount: "20000.00",
          actualRecoveredAmount: "18000.00",
          recoveryRate: 72.0,
          recommendedCount: 3,
          attemptedCount: 3,
          successfulRecoveryCount: 2,
        },
        failureBreakdown: [
          {
            category: "INSUFFICIENT_FUNDS",
            count: 2,
            percentage: 50.0,
          },
          {
            category: "NETWORK",
            count: 2,
            percentage: 50.0,
          },
        ],
        recoveryBreakdown: [
          {
            status: "Recovered",
            count: 2,
            percentage: 50.0,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: mockSummaryData }),
      });

      const result = await fetchDashboardSummary("demo_comp_001");
      expect(result.company.id).toBe("demo_comp_001");
      expect(result.metrics.totalPayments).toBe(10);
      expect(result.metrics.actualRecoveredAmount).toBe("18000.00");
      expect(result.failureBreakdown).toHaveLength(2);
    });

    it("throws ApiError when summary endpoint returns non-200 status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal Server Error" }),
      });

      await expect(fetchDashboardSummary()).rejects.toThrow(ApiError);
    });
  });

  describe("API Client — fetchDashboardPayments", () => {
    it("successfully fetches and validates payment lifecycle items", async () => {
      const mockPaymentsData = {
        items: [
          {
            id: "evt_001",
            externalPaymentId: "pay_synth_001",
            companyId: "demo_comp_001",
            providerId: "prov_001",
            providerType: "DEMO",
            customerReference: "cust_123",
            amount: "12500.00",
            currency: "INR",
            status: "FAILED",
            paymentMethod: "CARD",
            eventType: "PAYMENT_FAILED",
            failureCode: "INSUFFICIENT_FUNDS",
            failureMessage: "Declined due to balance",
            eventTimestamp: "2026-08-25T10:00:00.000Z",
            createdAt: "2026-08-25T10:00:00.000Z",
            isDemoSandbox: true,
            failure: {
              category: "INSUFFICIENT_FUNDS",
              failureCode: "INSUFFICIENT_FUNDS",
              failureMessage: "Declined due to balance",
              failedAt: "2026-08-25T10:00:00.000Z",
            },
            assessment: {
              worthiness: "RECOVER",
              estimatedRecoverableAmount: "12500.00",
              confidence: 0.9,
              reasoning: "Balance retry",
              assessedAt: "2026-08-25T10:01:00.000Z",
            },
            recommendation: {
              action: "RETRY_PAYMENT",
              status: "EXECUTED",
              reason: "Smart retry",
              confidence: 0.9,
              createdAt: "2026-08-25T10:02:00.000Z",
            },
            latestAttempt: {
              id: "att_001",
              status: "SUCCESSFUL",
              attemptedAt: "2026-08-25T10:05:00.000Z",
              completedAt: "2026-08-25T10:06:00.000Z",
            },
            latestOutcome: {
              id: "out_001",
              outcome: "SUCCESSFUL",
              actualRecoveredAmount: "12500.00",
              outcomeTimestamp: "2026-08-25T10:06:00.000Z",
              notes: "Payment recovered",
            },
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
        isDemo: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: mockPaymentsData }),
      });

      const result = await fetchDashboardPayments({ page: 1, pageSize: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].externalPaymentId).toBe("pay_synth_001");
      expect(result.items[0].failure?.category).toBe("INSUFFICIENT_FUNDS");
      expect(result.items[0].assessment?.worthiness).toBe("RECOVER");
      expect(result.items[0].latestOutcome?.actualRecoveredAmount).toBe(
        "12500.00"
      );
      expect(result.pagination.total).toBe(1);
    });

    it("correctly constructs query string parameters", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [],
            pagination: { page: 2, pageSize: 25, total: 0, totalPages: 0 },
            isDemo: true,
          },
        }),
      });

      await fetchDashboardPayments({
        companyId: "comp_123",
        page: 2,
        pageSize: 25,
        status: "FAILED",
        failureCategory: "NETWORK",
        recoveryWorthiness: "RECOVER",
        sortBy: "amount",
        sortOrder: "asc",
        search: "pay_synth",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callUrl = (vi.mocked(global.fetch).mock.calls[0][0] as string | URL).toString();
      const parsedUrl = new URL(callUrl);

      expect(parsedUrl.searchParams.get("companyId")).toBe("comp_123");
      expect(parsedUrl.searchParams.get("page")).toBe("2");
      expect(parsedUrl.searchParams.get("pageSize")).toBe("25");
      expect(parsedUrl.searchParams.get("status")).toBe("FAILED");
      expect(parsedUrl.searchParams.get("failureCategory")).toBe("NETWORK");
      expect(parsedUrl.searchParams.get("recoveryWorthiness")).toBe("RECOVER");
      expect(parsedUrl.searchParams.get("sortBy")).toBe("amount");
      expect(parsedUrl.searchParams.get("sortOrder")).toBe("asc");
      expect(parsedUrl.searchParams.get("search")).toBe("pay_synth");
    });
  });

  describe("Phase 16: API Client — executeRecovery", () => {
    it("successfully sends execution request and returns pipeline result", async () => {
      const mockResult = {
        status: "EXECUTED",
        isExecuted: true,
        recoveryAttemptId: "att_123",
        recoveryOutcomeId: "out_123",
        paymentEventId: "evt_123",
        recommendationId: "rec_123",
        recommendationAction: "RETRY_PAYMENT",
        attemptStatus: "SUCCESSFUL",
        outcomeStatus: "SUCCESSFUL",
        actualRecoveredAmount: "12500.00",
        estimatedRecoverableAmount: "12500.00",
        isDemoSandbox: true,
        message: "Recovery attempt executed and outcome recorded successfully.",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: mockResult }),
      });

      const { executeRecovery } = await import("../lib/api-client");
      const result = await executeRecovery(
        {
          paymentEventId: "evt_123",
          recommendationId: "rec_123",
          forceSimulationOutcome: "SUCCESSFUL",
        },
        "test-token"
      );

      expect(result.status).toBe("EXECUTED");
      expect(result.isExecuted).toBe(true);
      expect(result.actualRecoveredAmount).toBe("12500.00");
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [callUrl, callInit] = vi.mocked(global.fetch).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(callUrl).toContain("/api/recovery-attempts");
      expect(callInit.method).toBe("POST");
      expect((callInit.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-token"
      );
      expect(JSON.parse(callInit.body as string)).toEqual({
        paymentEventId: "evt_123",
        recommendationId: "rec_123",
        forceSimulationOutcome: "SUCCESSFUL",
      });
    });

    it("handles ALREADY_EXECUTED idempotent response", async () => {
      const mockResult = {
        status: "ALREADY_EXECUTED",
        isExecuted: false,
        paymentEventId: "evt_123",
        recommendationId: "rec_123",
        recommendationAction: "RETRY_PAYMENT",
        attemptStatus: "SUCCESSFUL",
        outcomeStatus: "SUCCESSFUL",
        actualRecoveredAmount: "12500.00",
        estimatedRecoverableAmount: "12500.00",
        isDemoSandbox: true,
        message:
          "Recovery has already been executed for this recommendation. Existing outcome preserved (idempotent).",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockResult }),
      });

      const { executeRecovery } = await import("../lib/api-client");
      const result = await executeRecovery({
        paymentEventId: "evt_123",
      });

      expect(result.status).toBe("ALREADY_EXECUTED");
      expect(result.isExecuted).toBe(false);
    });

    it("throws ApiError when neither recommendationId nor paymentEventId is provided", async () => {
      const { executeRecovery } = await import("../lib/api-client");
      await expect(executeRecovery({})).rejects.toThrow(ApiError);
    });

    it("throws ApiError on server/validation failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          success: false,
          error:
            "Recovery action 'CUSTOMER_ACTION_REQUIRED' is not eligible for automatic execution.",
        }),
      });

      const { executeRecovery } = await import("../lib/api-client");
      await expect(
        executeRecovery({ paymentEventId: "evt_invalid" })
      ).rejects.toThrow(ApiError);
    });
  });

  describe("Phase 16: Payment Detail Modal & UX States", () => {
    const baseMockPayment = {
      id: "evt_test_1",
      externalPaymentId: "pay_test_001",
      companyId: "demo_comp_001",
      providerId: "prov_001",
      providerType: "DEMO" as const,
      customerReference: "cust_123",
      amount: "15000.00",
      currency: "INR",
      status: "FAILED" as const,
      paymentMethod: "CARD" as const,
      eventType: "PAYMENT_FAILED" as const,
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "Card balance low",
      eventTimestamp: "2026-08-25T10:00:00.000Z",
      createdAt: "2026-08-25T10:00:00.000Z",
      isDemoSandbox: true,
      failure: {
        category: "INSUFFICIENT_FUNDS" as const,
        failureCode: "INSUFFICIENT_FUNDS",
        failureMessage: "Card balance low",
        failedAt: "2026-08-25T10:00:00.000Z",
      },
      assessment: {
        worthiness: "RECOVER" as const,
        estimatedRecoverableAmount: "15000.00",
        confidence: 0.85,
        reasoning: "Eligible for auto-retry",
        assessedAt: "2026-08-25T10:01:00.000Z",
      },
      recommendation: {
        id: "rec_test_1",
        action: "RETRY_PAYMENT" as const,
        status: "RECOMMENDED" as const,
        reason: "Retry after delay",
        confidence: 0.85,
        createdAt: "2026-08-25T10:02:00.000Z",
      },
      latestAttempt: null,
      latestOutcome: null,
    };

    it("renders 'Execute Recovery Attempt' button for eligible RETRY_PAYMENT action", async () => {
      const { PaymentDetailModal } = await import(
        "../components/dashboard/payment-detail-modal"
      );
      const { renderToString } = await import("react-dom/server");
      const React = await import("react");

      const html = renderToString(
        React.createElement(PaymentDetailModal, {
          payment: baseMockPayment,
          onClose: () => {},
        })
      );

      expect(html).toContain("Execute Recovery Attempt");
      expect(html).toContain("4. Recommended Action");
      expect(html).toContain("RETRY_PAYMENT");
      expect(html).not.toContain("Manual/customer action required");
    });

    it("does not show execution button for ineligible CUSTOMER_ACTION_REQUIRED action", async () => {
      const { PaymentDetailModal } = await import(
        "../components/dashboard/payment-detail-modal"
      );
      const { renderToString } = await import("react-dom/server");
      const React = await import("react");

      const ineligiblePayment = {
        ...baseMockPayment,
        recommendation: {
          ...baseMockPayment.recommendation,
          action: "CUSTOMER_ACTION_REQUIRED" as const,
        },
      };

      const html = renderToString(
        React.createElement(PaymentDetailModal, {
          payment: ineligiblePayment,
          onClose: () => {},
        })
      );

      expect(html).not.toContain("Execute Recovery Attempt");
      expect(html).toContain("Manual/customer action required");
      expect(html).toContain("customer intervention");
    });

    it("does not show execution button for ineligible REVIEW and DO_NOT_RECOVER actions", async () => {
      const { PaymentDetailModal } = await import(
        "../components/dashboard/payment-detail-modal"
      );
      const { renderToString } = await import("react-dom/server");
      const React = await import("react");

      const reviewPayment = {
        ...baseMockPayment,
        recommendation: {
          ...baseMockPayment.recommendation,
          action: "REVIEW" as const,
        },
      };

      const htmlReview = renderToString(
        React.createElement(PaymentDetailModal, {
          payment: reviewPayment,
          onClose: () => {},
        })
      );
      expect(htmlReview).not.toContain("Execute Recovery Attempt");
      expect(htmlReview).toContain("Manual/customer action required");
      expect(htmlReview).toContain("manual risk/compliance review");

      const doNotRecoverPayment = {
        ...baseMockPayment,
        recommendation: {
          ...baseMockPayment.recommendation,
          action: "DO_NOT_RECOVER" as const,
        },
      };

      const htmlDoNotRecover = renderToString(
        React.createElement(PaymentDetailModal, {
          payment: doNotRecoverPayment,
          onClose: () => {},
        })
      );
      expect(htmlDoNotRecover).not.toContain("Execute Recovery Attempt");
      expect(htmlDoNotRecover).toContain("non-recoverable");
    });

    it("displays 'Already Executed' and does not show active button if already successfully recovered", async () => {
      const { PaymentDetailModal } = await import(
        "../components/dashboard/payment-detail-modal"
      );
      const { renderToString } = await import("react-dom/server");
      const React = await import("react");

      const recoveredPayment = {
        ...baseMockPayment,
        latestAttempt: {
          id: "att_001",
          status: "SUCCESSFUL" as const,
          attemptedAt: "2026-08-25T10:05:00.000Z",
          completedAt: "2026-08-25T10:06:00.000Z",
        },
        latestOutcome: {
          id: "out_001",
          outcome: "SUCCESSFUL" as const,
          actualRecoveredAmount: "15000.00",
          outcomeTimestamp: "2026-08-25T10:06:00.000Z",
          notes: "Recovered via retry",
        },
      };

      const html = renderToString(
        React.createElement(PaymentDetailModal, {
          payment: recoveredPayment,
          onClose: () => {},
        })
      );

      expect(html).not.toContain("Execute Recovery Attempt");
      expect(html).toContain("Already Executed");
      expect(html).toContain("Successfully recovered");
      expect(html).toContain("15000.00");
    });

    it("clicking button executes recovery and triggers refresh callback", async () => {
      const { performRecoveryExecution } = await import(
        "../components/dashboard/payment-detail-modal"
      );

      const mockExecuteFn = vi.fn().mockResolvedValue({
        status: "EXECUTED",
        isExecuted: true,
        attemptStatus: "SUCCESSFUL",
        outcomeStatus: "SUCCESSFUL",
        actualRecoveredAmount: "15000.00",
        message: "Payment recovered successfully",
      });

      const setIsExecuting = vi.fn();
      const setExecutionResult = vi.fn();
      const setExecutionError = vi.fn();
      const onRecoverySuccess = vi.fn();

      const result = await performRecoveryExecution({
        payment: baseMockPayment,
        isExecuting: false,
        setIsExecuting,
        setExecutionResult,
        setExecutionError,
        onRecoverySuccess,
        executeFn: mockExecuteFn,
      });

      expect(mockExecuteFn).toHaveBeenCalledTimes(1);
      expect(mockExecuteFn).toHaveBeenCalledWith({
        paymentEventId: "evt_test_1",
      });

      expect(setExecutionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "EXECUTED",
          outcomeStatus: "SUCCESSFUL",
        })
      );
      expect(onRecoverySuccess).toHaveBeenCalledTimes(1);
      expect(result?.isExecuted).toBe(true);
      expect(setIsExecuting).toHaveBeenCalledWith(true);
      expect(setIsExecuting).toHaveBeenCalledWith(false);
    });

    it("loading state prevents duplicate execution (double-click protection)", async () => {
      const { performRecoveryExecution } = await import(
        "../components/dashboard/payment-detail-modal"
      );

      const mockExecuteFn = vi.fn();
      const setIsExecuting = vi.fn();
      const setExecutionResult = vi.fn();
      const setExecutionError = vi.fn();

      await performRecoveryExecution({
        payment: baseMockPayment,
        isExecuting: true, // Already executing!
        setIsExecuting,
        setExecutionResult,
        setExecutionError,
        executeFn: mockExecuteFn,
      });

      expect(mockExecuteFn).not.toHaveBeenCalled();
      expect(setIsExecuting).not.toHaveBeenCalled();
    });

    it("ALREADY_EXECUTED response displays correct idempotent state and calls refresh", async () => {
      const { performRecoveryExecution } = await import(
        "../components/dashboard/payment-detail-modal"
      );

      const mockExecuteFn = vi.fn().mockResolvedValue({
        status: "ALREADY_EXECUTED",
        isExecuted: false,
        attemptStatus: "SUCCESSFUL",
        outcomeStatus: "SUCCESSFUL",
        actualRecoveredAmount: "15000.00",
        message: "Recovery has already been executed.",
      });

      const setIsExecuting = vi.fn();
      const setExecutionResult = vi.fn();
      const setExecutionError = vi.fn();
      const onRecoverySuccess = vi.fn();

      await performRecoveryExecution({
        payment: baseMockPayment,
        isExecuting: false,
        setIsExecuting,
        setExecutionResult,
        setExecutionError,
        onRecoverySuccess,
        executeFn: mockExecuteFn,
      });

      expect(setExecutionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "ALREADY_EXECUTED",
          isExecuted: false,
        })
      );
      expect(onRecoverySuccess).toHaveBeenCalledTimes(1);
    });

    it("failed execution displays human-readable error", async () => {
      const { performRecoveryExecution } = await import(
        "../components/dashboard/payment-detail-modal"
      );

      const mockExecuteFn = vi
        .fn()
        .mockRejectedValue(new Error("Network timeout during provider retry"));

      const setIsExecuting = vi.fn();
      const setExecutionResult = vi.fn();
      const setExecutionError = vi.fn();

      await performRecoveryExecution({
        payment: baseMockPayment,
        isExecuting: false,
        setIsExecuting,
        setExecutionResult,
        setExecutionError,
        executeFn: mockExecuteFn,
      });

      expect(setExecutionError).toHaveBeenCalledWith(
        "Network timeout during provider retry"
      );
      expect(setIsExecuting).toHaveBeenCalledWith(false);
    });
  });
});