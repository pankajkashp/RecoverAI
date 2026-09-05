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
  type RecoveryExecutionRequest,
  type RecoveryExecutionPipelineResult,
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
 * Triggers execution of an eligible recovery recommendation.
 * Communicates with POST /api/recovery-attempts.
 * Supports recommendationId, paymentEventId, and forceSimulationOutcome.
 */
export async function executeRecovery(
  request: RecoveryExecutionRequest,
  token?: string
): Promise<RecoveryExecutionPipelineResult> {
  if (!request.recommendationId && !request.paymentEventId) {
    throw new ApiError(
      400,
      "Either recommendationId or paymentEventId must be provided for recovery execution"
    );
  }

  const url = `${API_BASE_URL}/api/recovery-attempts`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (typeof window !== "undefined") {
    try {
      const storedToken = localStorage.getItem("recoverai_token");
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }
    } catch {
      // localStorage may be unavailable
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMsg = `Failed to execute recovery: HTTP ${response.status}`;
    let details: unknown = undefined;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
      if (errJson.details) details = errJson.details;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, errorMsg, details);
  }

  const json = await response.json();
  return json.data as RecoveryExecutionPipelineResult;
}


/**
 * Fetches company dashboard summary metrics with optional date range.
 */
export async function fetchDashboardSummary(
  options?: string | { companyId?: string; from?: string; to?: string }
): Promise<DashboardSummaryResponse> {
  const url = new URL(`${API_BASE_URL}/api/dashboard/summary`);
  if (typeof options === "string") {
    url.searchParams.set("companyId", options);
  } else if (options) {
    if (options.companyId) url.searchParams.set("companyId", options.companyId);
    if (options.from) url.searchParams.set("from", options.from);
    if (options.to) url.searchParams.set("to", options.to);
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
 * Fetches paginated, sorted, and filtered payment lifecycle records with optional date range.
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
  if (query.from) {
    url.searchParams.set(
      "from",
      query.from instanceof Date ? query.from.toISOString() : String(query.from)
    );
  }
  if (query.to) {
    url.searchParams.set(
      "to",
      query.to instanceof Date ? query.to.toISOString() : String(query.to)
    );
  }
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

/**
 * Safely resets transient demo transaction data in development/demo mode.
 * Communicates with POST /api/dashboard/reset-demo-data.
 */
export async function resetDemoData(): Promise<{ deletedCount: number }> {
  const url = `${API_BASE_URL}/api/dashboard/reset-demo-data`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMsg = `Failed to reset demo data: HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, errorMsg);
  }

  const json = await response.json();
  return json.data as { deletedCount: number };
}

