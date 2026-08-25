/**
 * RecoverAI — Frontend API Client
 *
 * Phase 9: Dashboard & Read API
 *
 * Provides typed read-only data fetching methods for the RecoverAI dashboard.
 * Communicates strictly with the backend Express Read API.
 */

import {
  DashboardSummaryResponseSchema,
  DashboardPaymentsResponseSchema,
  type DashboardSummaryResponse,
  type DashboardPaymentsQuery,
  type DashboardPaymentsResponse,
} from "@recoverai/contracts";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches company dashboard summary metrics.
 */
export async function fetchDashboardSummary(
  companyId?: string
): Promise<DashboardSummaryResponse> {
  const url = new URL(`${API_BASE_URL}/api/dashboard/summary`);
  if (companyId) {
    url.searchParams.set("companyId", companyId);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMsg = `Failed to fetch dashboard summary: HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, errorMsg);
  }

  const json = await response.json();
  const parsed = DashboardSummaryResponseSchema.safeParse(json.data);
  if (!parsed.success) {
    console.error("DashboardSummary validation failed:", parsed.error);
    return json.data as DashboardSummaryResponse;
  }

  return parsed.data;
}

/**
 * Fetches paginated, sorted, and filtered payment lifecycle records.
 */
export async function fetchDashboardPayments(
  query: DashboardPaymentsQuery
): Promise<DashboardPaymentsResponse> {
  const url = new URL(`${API_BASE_URL}/api/dashboard/payments`);

  if (query.companyId) url.searchParams.set("companyId", query.companyId);
  if (query.page) url.searchParams.set("page", query.page.toString());
  if (query.pageSize) url.searchParams.set("pageSize", query.pageSize.toString());
  if (query.status) url.searchParams.set("status", query.status);
  if (query.failureCategory)
    url.searchParams.set("failureCategory", query.failureCategory);
  if (query.recoveryWorthiness)
    url.searchParams.set("recoveryWorthiness", query.recoveryWorthiness);
  if (query.recommendationAction)
    url.searchParams.set("recommendationAction", query.recommendationAction);
  if (query.recoveryStatus)
    url.searchParams.set("recoveryStatus", query.recoveryStatus);
  if (query.sortBy) url.searchParams.set("sortBy", query.sortBy);
  if (query.sortOrder) url.searchParams.set("sortOrder", query.sortOrder);
  if (query.search) url.searchParams.set("search", query.search);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMsg = `Failed to fetch payments: HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, errorMsg);
  }

  const json = await response.json();
  const parsed = DashboardPaymentsResponseSchema.safeParse(json.data);
  if (!parsed.success) {
    console.error("DashboardPayments validation failed:", parsed.error);
    return json.data as DashboardPaymentsResponse;
  }

  return parsed.data;
}
