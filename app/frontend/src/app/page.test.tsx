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
});