/**
 * RecoverAI — Razorpay Webhook & Entity Zod Schemas
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Defines runtime validation schemas for Razorpay webhooks and payment entities
 * matching the official Razorpay API specifications.
 *
 * Handles Razorpay edge cases:
 * - Empty associative arrays serialized as `[]` in JSON for `notes`, `acquirer_data`, and `metadata`
 * - Webhook envelopes containing `payment`, `order`, or `payment_link` entities
 * - Strict type-safety with safe fallback transformations
 */

import { z } from "zod";

/**
 * Safe Record Schema:
 * Handles Razorpay's convention of serializing empty associative arrays as JSON arrays `[]`.
 * Automatically transforms `[]`, `null`, or `undefined` into `{}` so Zod never throws
 * "expected record, received array".
 */
export const RazorpaySafeRecordSchema = z.preprocess((val) => {
  if (Array.isArray(val)) return {};
  if (val === null || val === undefined) return {};
  if (typeof val === "object") return val;
  return {};
}, z.record(z.string(), z.unknown()));

/**
 * Razorpay Payment Error Object
 */
export const RazorpayErrorSchema = z
  .object({
    code: z.string().nullish(),
    description: z.string().nullish(),
    source: z.string().nullish(), // "bank" | "customer" | "gateway" | "business"
    step: z.string().nullish(), // "payment_authorization" | "payment_initiation" | etc.
    reason: z.string().nullish(), // "insufficient_funds" | "card_expired" | etc.
    metadata: RazorpaySafeRecordSchema.nullish(),
  })
  .passthrough();
export type RazorpayError = z.infer<typeof RazorpayErrorSchema>;

/**
 * Safe Non-Sensitive Card Metadata
 */
export const RazorpayCardSchema = z
  .object({
    id: z.string().nullish(),
    entity: z.literal("card").nullish(),
    name: z.string().nullish(),
    last4: z.string().nullish(),
    network: z.string().nullish(), // "Visa" | "MasterCard" | "RuPay" | etc.
    type: z.string().nullish(), // "credit" | "debit" | "prepaid"
    issuer: z.string().nullish(),
    international: z.boolean().nullish(),
    emi: z.boolean().nullish(),
    sub_type: z.string().nullish(),
  })
  .passthrough();
export type RazorpayCard = z.infer<typeof RazorpayCardSchema>;

/**
 * Razorpay Payment Entity
 */
export const RazorpayPaymentEntitySchema = z
  .object({
    id: z.string().min(1, "Razorpay payment ID is required"),
    entity: z.string().default("payment"),
    amount: z.coerce.number().int().nonnegative(), // in paise / lowest subunit
    currency: z.string().min(3).max(3).default("INR"),
    status: z.string(), // "created" | "authorized" | "captured" | "refunded" | "failed"
    order_id: z.string().nullish(),
    invoice_id: z.string().nullish(),
    international: z.boolean().nullish(),
    method: z.string().default("other"), // "card" | "upi" | "netbanking" | "wallet" | "emi" | "bank_transfer"
    amount_refunded: z.coerce.number().nullish(),
    refund_status: z.string().nullish(),
    captured: z.boolean().nullish(),
    description: z.string().nullish(),
    card_id: z.string().nullish(),
    card: RazorpayCardSchema.nullish(),
    bank: z.string().nullish(),
    wallet: z.string().nullish(),
    vpa: z.string().nullish(),
    email: z.string().nullish(),
    contact: z.string().nullish(),
    notes: RazorpaySafeRecordSchema.nullish(),
    fee: z.coerce.number().nullish(),
    tax: z.coerce.number().nullish(),
    error_code: z.string().nullish(),
    error_description: z.string().nullish(),
    error_source: z.string().nullish(),
    error_step: z.string().nullish(),
    error_reason: z.string().nullish(),
    error: RazorpayErrorSchema.nullish(),
    acquirer_data: RazorpaySafeRecordSchema.nullish(),
    created_at: z.coerce.number(), // unix timestamp in seconds
  })
  .passthrough();
export type RazorpayPaymentEntity = z.infer<typeof RazorpayPaymentEntitySchema>;

/**
 * Razorpay Order Entity
 */
export const RazorpayOrderEntitySchema = z
  .object({
    id: z.string().min(1, "Razorpay order ID is required"),
    entity: z.string().default("order"),
    amount: z.coerce.number().int().nonnegative(),
    amount_paid: z.coerce.number().nullish(),
    amount_due: z.coerce.number().nullish(),
    currency: z.string().min(3).max(3).default("INR"),
    receipt: z.string().nullish(),
    offer_id: z.string().nullish(),
    status: z.string(), // "created" | "attempted" | "paid"
    attempts: z.coerce.number().nullish(),
    notes: RazorpaySafeRecordSchema.nullish(),
    created_at: z.coerce.number(),
  })
  .passthrough();
export type RazorpayOrderEntity = z.infer<typeof RazorpayOrderEntitySchema>;

/**
 * Razorpay Payment Link Entity
 */
export const RazorpayPaymentLinkEntitySchema = z
  .object({
    id: z.string().min(1),
    entity: z.string().default("payment_link"),
    amount: z.coerce.number().int().nonnegative().optional(),
    currency: z.string().optional(),
    status: z.string().optional(),
    order_id: z.string().nullish(),
    short_url: z.string().nullish(),
    notes: RazorpaySafeRecordSchema.nullish(),
    created_at: z.coerce.number().optional(),
  })
  .passthrough();
export type RazorpayPaymentLinkEntity = z.infer<typeof RazorpayPaymentLinkEntitySchema>;

/**
 * Razorpay Webhook Payload Wrapper
 */
export const RazorpayWebhookPayloadSchema = z
  .object({
    entity: z.literal("event").optional(),
    account_id: z.string().nullish(),
    event: z.string(), // "payment.failed" | "payment.authorized" | "payment.captured" | "order.paid" | etc.
    contains: z.array(z.string()).optional(),
    payload: z
      .object({
        payment: z
          .object({
            entity: RazorpayPaymentEntitySchema,
          })
          .optional(),
        order: z
          .object({
            entity: RazorpayOrderEntitySchema,
          })
          .optional(),
        payment_link: z
          .object({
            entity: RazorpayPaymentLinkEntitySchema,
          })
          .optional(),
      })
      .passthrough(),
    created_at: z.coerce.number().optional(),
  })
  .passthrough();
export type RazorpayWebhookPayload = z.infer<typeof RazorpayWebhookPayloadSchema>;
