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
}
