/**
 * @recoverai/contracts
 *
 * Canonical contracts and domain types for RecoverAI.
 *
 * All external payment providers (Demo, Razorpay, Stripe, etc.) must be
 * translated via their respective ProviderAdapter into this provider-agnostic
 * CanonicalPaymentEvent contract before entering the RecoverAI core pipeline.
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export const ProviderTypeEnum = z.enum([
  "DEMO",
  "RAZORPAY",
  "STRIPE",
  "PAYPAL",
  "OTHER",
]);
export type ProviderType = z.infer<typeof ProviderTypeEnum>;

export const PaymentStatusEnum = z.enum([
  "PENDING",
  "AUTHORIZED",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const PaymentMethodEnum = z.enum([
  "CARD",
  "UPI",
  "NETBANKING",
  "WALLET",
  "BANK_TRANSFER",
  "OTHER",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const EventTypeEnum = z.enum([
  "PAYMENT_CREATED",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_COMPLETED",
  "PAYMENT_FAILED",
  "PAYMENT_REFUNDED",
  "OTHER",
]);
export type EventType = z.infer<typeof EventTypeEnum>;

export const FailureCategoryEnum = z.enum([
  "AUTHENTICATION",
  "INSUFFICIENT_FUNDS",
  "NETWORK",
  "BANK",
  "CARD",
  "PROVIDER",
  "CUSTOMER_ACTION_REQUIRED",
  "TEMPORARY",
  "UNKNOWN",
]);
export type FailureCategory = z.infer<typeof FailureCategoryEnum>;

export const FailureClassificationEnum = z.enum([
  "TEMPORARY",
  "PERMANENT",
  "UNKNOWN",
]);
export type FailureClassification = z.infer<typeof FailureClassificationEnum>;

export const RecoveryWorthinessEnum = z.enum([
  "RECOVER",
  "DO_NOT_RECOVER",
  "REVIEW",
]);
export type RecoveryWorthiness = z.infer<typeof RecoveryWorthinessEnum>;

/**
 * The set of recovery actions that RecoverAI can recommend.
 * These are recommendations only — NOT execution instructions.
 * Actual execution belongs to Phase 8.
 */
export const RecoveryActionEnum = z.enum([
  /** Retry the payment automatically or after a short delay. */
  "RETRY_PAYMENT",
  /** The customer must take an action (e.g. complete authentication or update card). */
  "CUSTOMER_ACTION_REQUIRED",
  /** Manual review is required before deciding a recovery path. */
  "REVIEW",
  /** Recovery is not worthwhile; do not attempt. */
  "DO_NOT_RECOVER",
]);
export type RecoveryAction = z.infer<typeof RecoveryActionEnum>;

/**
 * Lifecycle status of a recovery recommendation.
 * RECOMMENDED is the initial status when the engine creates a recommendation.
 */
export const RecommendationStatusEnum = z.enum([
  "RECOMMENDED",
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXECUTED",
  "EXPIRED",
  "SUPERSEDED",
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatusEnum>;

// ============================================================================
// Canonical Payment Event Schema & Types
// ============================================================================

export const CanonicalPaymentEventSchema = z.object({
  /**
   * Provider-side / external payment or transaction identifier.
   * e.g. "pay_demo_12345" or "pay_H123456789"
   */
  externalPaymentId: z
    .string()
    .min(1, "externalPaymentId must not be empty")
    .trim(),

  /**
   * RecoverAI internal company identifier that owns this transaction.
   */
  companyId: z
    .string()
    .min(1, "companyId must not be empty")
    .trim(),

  /**
   * Internal provider record ID or recognized provider identifier.
   */
  providerId: z
    .string()
    .min(1, "providerId must not be empty")
    .trim(),

  /**
   * Customer identifier from merchant or provider context (optional).
   */
  customerReference: z.string().trim().nullish(),

  /**
   * Numeric monetary amount in standard unit (e.g. 12500.00). Must be positive.
   */
  amount: z.coerce
    .number()
    .positive("amount must be a positive number")
    .finite("amount must be finite"),

  /**
   * 3-letter ISO currency code (e.g. "INR", "USD", "EUR").
   */
  currency: z
    .string()
    .min(3, "currency must be 3 characters")
    .max(3, "currency must be 3 characters")
    .toUpperCase(),

  /**
   * Current normalized status of the payment.
   */
  status: PaymentStatusEnum,

  /**
   * Payment method used for the transaction.
   */
  paymentMethod: PaymentMethodEnum.default("OTHER"),

  /**
   * Event lifecycle type.
   */
  eventType: EventTypeEnum,

  /**
   * Provider-specific failure error code (if failed).
   */
  failureCode: z.string().trim().nullish(),

  /**
   * Human-readable failure explanation or error description (if failed).
   */
  failureMessage: z.string().trim().nullish(),

  /**
   * Normalized failure category (if classified at adapter or preliminary stage).
   */
  failureCategory: FailureCategoryEnum.nullish(),

  /**
   * Timestamp when the payment event occurred at the source.
   */
  eventTimestamp: z.coerce.date(),

  /**
   * Provider/merchant contextual metadata (raw references, bank name, etc.).
   */
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type CanonicalPaymentEvent = z.infer<typeof CanonicalPaymentEventSchema>;

// ============================================================================
// Failure Analysis Result Contract
// ============================================================================

export const FailureAnalysisResultSchema = z.object({
  category: FailureCategoryEnum,
  reason: z.string().min(1, "reason must not be empty"),
  classification: FailureClassificationEnum,
  isTemporary: z.boolean().nullable(),
  originalFailureCode: z.string().nullable(),
  originalFailureMessage: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FailureAnalysisResult = z.infer<typeof FailureAnalysisResultSchema>;

// ============================================================================
// Recovery Assessment Result Contract
// ============================================================================

export const RecoveryAssessmentResultSchema = z.object({
  worthiness: RecoveryWorthinessEnum,
  estimatedRecoverableAmount: z.number().nonnegative(),
  originalAmount: z.number().positive(),
  confidence: z.number().min(0).max(1).nullable(),
  reasoning: z.string().min(1, "reasoning must not be empty"),
  ruleId: z.string().default("deterministic-v1"),
  assessedAt: z.coerce.date(),
});

export type RecoveryAssessmentResult = z.infer<
  typeof RecoveryAssessmentResultSchema
>;

// ============================================================================
// Recovery Recommendation Result Contract (Phase 7)
// ============================================================================

export const RecoveryRecommendationResultSchema = z.object({
  /** The recommended recovery action. */
  action: RecoveryActionEnum,

  /** Initial lifecycle status of this recommendation. */
  status: RecommendationStatusEnum.default("RECOMMENDED"),

  /** Human-readable explanation of why this action was recommended. */
  reason: z.string().min(1, "reason must not be empty"),

  /**
   * Confidence score [0..1] in the recommendation.
   * Derived from deterministic rules and optionally adjusted by ML signal.
   */
  confidence: z.number().min(0).max(1).nullable(),

  /**
   * Source of the recommendation rule.
   * 'deterministic-rules-v1' if no ML signal was used.
   * 'deterministic-rules-v1+ml-signal-v1' if ML signal influenced the result.
   */
  ruleSource: z.string().default("deterministic-rules-v1"),

  /** Whether an ML prediction was used as a supporting signal. */
  mlUsed: z.boolean().default(false),

  /**
   * ML recovery probability (0..1) if ML was called and returned a valid response.
   * Null if ML was not called or was unavailable.
   */
  mlProbability: z.number().min(0).max(1).nullable().default(null),

  /** Timestamp when this recommendation was generated. */
  recommendedAt: z.coerce.date(),
});

export type RecoveryRecommendationResult = z.infer<
  typeof RecoveryRecommendationResultSchema
>;

// ============================================================================
// Provider Adapter Interface Boundary
// ============================================================================

/**
 * Common interface that all provider adapters must implement.
 * Isolates provider-specific formats from the RecoverAI core.
 */
export interface IProviderAdapter<TRaw = unknown> {
  readonly providerType: ProviderType;

  /**
   * Validates and normalizes raw provider-specific payload into a CanonicalPaymentEvent.
   * Throws an error or ValidationError if the payload cannot be parsed.
   */
  normalize(rawEvent: TRaw): Promise<CanonicalPaymentEvent> | CanonicalPaymentEvent;
}

// ============================================================================
// Pipeline Processing Result Types
// ============================================================================

export interface PaymentPipelineResult {
  status: "CREATED" | "DUPLICATE";
  isDuplicate: boolean;
  paymentEventId: string;
  externalPaymentId: string;
  companyId: string;
  providerId: string;
  amount: string;
  currency: string;
  paymentStatus: PaymentStatus;
  message: string;
  failureAnalysis?: {
    category: FailureCategory;
    reason: string;
    classification: FailureClassification;
    isTemporary: boolean | null;
  };
  recoveryAssessment?: {
    worthiness: RecoveryWorthiness;
    estimatedRecoverableAmount: string;
    confidence: number | null;
    reasoning: string;
  };
  /** Phase 7: Recovery recommendation generated automatically for failed payments. */
  recoveryRecommendation?: {
    action: RecoveryAction;
    status: RecommendationStatus;
    reason: string;
    confidence: number | null;
    ruleSource: string;
    mlUsed: boolean;
    mlProbability: number | null;
  };
}

// ============================================================================
// Phase 8: Recovery Execution & Outcome Tracking Contracts
// ============================================================================

/**
 * Status of a recovery attempt / outcome.
 * Matches the Prisma schema RecoveryAttemptStatus enum.
 */
export const RecoveryAttemptStatusEnum = z.enum([
  "NOT_ATTEMPTED",
  "RECOMMENDED",
  "ATTEMPTED",
  "SUCCESSFUL",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "UNKNOWN",
]);
export type RecoveryAttemptStatus = z.infer<typeof RecoveryAttemptStatusEnum>;

/**
 * Request payload for triggering recovery execution.
 */
export const RecoveryExecutionRequestSchema = z
  .object({
    /** Target recommendation ID (optional if paymentEventId is given). */
    recommendationId: z.string().trim().min(1).optional(),

    /** Target payment event ID (optional if recommendationId is given). */
    paymentEventId: z.string().trim().min(1).optional(),

    /** Optional parameter for deterministic simulation in test/sandbox environments. */
    forceSimulationOutcome: RecoveryAttemptStatusEnum.optional(),
  })
  .refine((data) => Boolean(data.recommendationId || data.paymentEventId), {
    message: "Either recommendationId or paymentEventId must be provided",
    path: ["paymentEventId"],
  });

export type RecoveryExecutionRequest = z.infer<
  typeof RecoveryExecutionRequestSchema
>;

/**
 * Normalized result from a recovery provider adapter execution.
 */
export const RecoveryExecutionResultSchema = z.object({
  /** Simulated or actual outcome status. */
  status: RecoveryAttemptStatusEnum,

  /** Whether the recovery attempt succeeded in recovering funds. */
  isSuccess: z.boolean(),

  /** Actual amount recovered (null if failed or cancelled). */
  actualRecoveredAmount: z.number().nonnegative().nullable(),

  /** ISO currency code. */
  currency: z.string().min(3).max(3),

  /** Provider type executing the recovery (DEMO for Phase 8). */
  providerType: ProviderTypeEnum,

  /** Flag clearly indicating demo/sandbox execution. */
  isDemoSandbox: z.boolean().default(true),

  /** Provider/adapter attempt reference identifier. */
  attemptReference: z.string().min(1),

  /** Timestamp when outcome was produced. */
  outcomeTimestamp: z.coerce.date(),

  /** Human-readable notes or error explanation from execution. */
  notes: z.string().nullable(),

  /** Provider metadata or raw response if available. */
  rawResponse: z.record(z.string(), z.unknown()).optional(),
});

export type RecoveryExecutionResult = z.infer<
  typeof RecoveryExecutionResultSchema
>;

/**
 * Provider-independent recovery adapter boundary interface.
 * Any recovery provider (Demo, Razorpay, Stripe) must implement this interface.
 */
export interface IRecoveryProviderAdapter {
  readonly providerType: ProviderType;

  /**
   * Executes a recovery attempt for an eligible payment and recommendation.
   */
  executeRecovery(
    event: CanonicalPaymentEvent,
    recommendation: RecoveryRecommendationResult,
    options?: { forceOutcome?: RecoveryAttemptStatus }
  ): Promise<RecoveryExecutionResult>;
}

/**
 * Pipeline result returned by the RecoveryExecutionService.
 */
export interface RecoveryExecutionPipelineResult {
  status: "EXECUTED" | "ALREADY_EXECUTED" | "BLOCKED";
  isExecuted: boolean;
  recoveryAttemptId?: string;
  recoveryOutcomeId?: string;
  paymentEventId: string;
  recommendationId: string;
  recommendationAction: RecoveryAction;
  attemptStatus: RecoveryAttemptStatus;
  outcomeStatus: RecoveryAttemptStatus;
  actualRecoveredAmount: string | null;
  estimatedRecoverableAmount: string | null;
  isDemoSandbox: boolean;
  message: string;
  checkoutUrl?: string | null;
  providerReference?: string | null;
}


// ============================================================================
// Phase 9: Dashboard & Read API Contracts
// ============================================================================

/**
 * Failure category aggregate count.
 */
export const FailureBreakdownItemSchema = z.object({
  category: FailureCategoryEnum,
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});
export type FailureBreakdownItem = z.infer<typeof FailureBreakdownItemSchema>;

/**
 * Recovery lifecycle state aggregate count.
 */
export const RecoveryBreakdownItemSchema = z.object({
  status: z.string(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});
export type RecoveryBreakdownItem = z.infer<typeof RecoveryBreakdownItemSchema>;

/**
 * Dashboard Summary API response payload.
 */
export const DashboardSummaryResponseSchema = z.object({
  company: z.object({
    id: z.string(),
    name: z.string(),
  }),
  currency: z.string().min(3).max(3),
  isDemo: z.boolean().default(true),
  metrics: z.object({
    totalPayments: z.number().int().nonnegative(),
    failedPayments: z.number().int().nonnegative(),
    successfulPayments: z.number().int().nonnegative(),
    failureRate: z.number().min(0).max(100),
    totalPaymentValue: z.string(),
    /**
     * Potentially Recoverable:
     * Qualified opportunity volume — sum of original payment amounts (`PaymentEvent.amount`)
     * for failed payments evaluated as high-confidence recovery targets (`assessment.worthiness == 'RECOVER'`).
     */
    potentiallyRecoverableAmount: z.string(),
    /**
     * Estimated Recovery:
     * Total intelligence forecast — sum of all assessment estimates (`RecoveryAssessment.estimatedRecoverableAmount`),
     * including both `RECOVER` targets and payments currently under `REVIEW`.
     */
    estimatedRecoverableAmount: z.string(),
    /**
     * Actually Recovered:
     * Confirmed realized recovered funds from executed recovery attempts (`RecoveryOutcome.actualRecoveredAmount`).
     */
    actualRecoveredAmount: z.string(),
    recoveryRate: z.number().min(0).max(100),
    recommendedCount: z.number().int().nonnegative(),
    attemptedCount: z.number().int().nonnegative(),
    successfulRecoveryCount: z.number().int().nonnegative(),
  }),
  failureBreakdown: z.array(FailureBreakdownItemSchema),
  recoveryBreakdown: z.array(RecoveryBreakdownItemSchema),
});
export type DashboardSummaryResponse = z.infer<
  typeof DashboardSummaryResponseSchema
>;

/**
 * Query parameters for Dashboard Payments List API.
 */
export const DashboardPaymentsQuerySchema = z.object({
  companyId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: PaymentStatusEnum.optional(),
  failureCategory: FailureCategoryEnum.optional(),
  recoveryWorthiness: RecoveryWorthinessEnum.optional(),
  recommendationAction: z.string().optional(),
  recoveryStatus: RecoveryAttemptStatusEnum.optional(),
  sortBy: z
    .enum(["eventTimestamp", "amount", "createdAt"])
    .default("eventTimestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().optional(),
});
export type DashboardPaymentsQuery = z.input<
  typeof DashboardPaymentsQuerySchema
>;
export type DashboardPaymentsQueryOutput = z.infer<
  typeof DashboardPaymentsQuerySchema
>;

/**
 * Detailed lifecycle item representing a single payment event on the dashboard.
 */
export const PaymentLifecycleItemSchema = z.object({
  id: z.string(),
  externalPaymentId: z.string(),
  companyId: z.string(),
  providerId: z.string(),
  providerType: ProviderTypeEnum,
  customerReference: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  status: PaymentStatusEnum,
  paymentMethod: PaymentMethodEnum,
  eventType: EventTypeEnum,
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  eventTimestamp: z.string(),
  createdAt: z.string(),
  isDemoSandbox: z.boolean(),
  failure: z
    .object({
      category: FailureCategoryEnum,
      failureCode: z.string().nullable(),
      failureMessage: z.string().nullable(),
      failedAt: z.string(),
    })
    .nullable(),
  assessment: z
    .object({
      worthiness: RecoveryWorthinessEnum,
      estimatedRecoverableAmount: z.string().nullable(),
      confidence: z.number().nullable(),
      reasoning: z.string().nullable(),
      assessedAt: z.string(),
    })
    .nullable(),
  recommendation: z
    .object({
      action: z.string(),
      status: RecommendationStatusEnum,
      reason: z.string().nullable(),
      confidence: z.number().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  latestAttempt: z
    .object({
      id: z.string(),
      status: RecoveryAttemptStatusEnum,
      attemptedAt: z.string().nullable(),
      completedAt: z.string().nullable(),
    })
    .nullable(),
  latestOutcome: z
    .object({
      id: z.string(),
      outcome: RecoveryAttemptStatusEnum,
      actualRecoveredAmount: z.string().nullable(),
      outcomeTimestamp: z.string().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
});
export type PaymentLifecycleItem = z.infer<typeof PaymentLifecycleItemSchema>;

/**
 * Dashboard Payments API response payload.
 */
export const DashboardPaymentsResponseSchema = z.object({
  items: z.array(PaymentLifecycleItemSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  isDemo: z.boolean().default(true),
});
export type DashboardPaymentsResponse = z.infer<
  typeof DashboardPaymentsResponseSchema
>;

// ============================================================================
// Phase 12: Production Authentication, Authorization & User Contracts
// ============================================================================

/**
 * User Role enum matching the Prisma database schema.
 */
export const UserRoleEnum = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
export type UserRole = z.infer<typeof UserRoleEnum>;

/**
 * Authenticated user profile contract.
 */
export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleEnum,
  companyId: z.string().min(1),
  createdAt: z.coerce.date().optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Login request payload schema.
 */
export const LoginRequestSchema = z.object({
  email: z.string().email("A valid email address is required"),
  password: z.string().min(1, "Password is required").optional(),
  demoToken: z.string().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Login response payload schema.
 */
export const LoginResponseSchema = z.object({
  success: z.boolean(),
  token: z.string().min(1),
  user: AuthUserSchema,
  expiresIn: z.number().positive(), // in seconds
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;



