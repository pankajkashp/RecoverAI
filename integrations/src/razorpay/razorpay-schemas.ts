/**
 * RecoverAI — Razorpay Webhook & Entity Zod Schemas
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Defines runtime validation schemas for Razorpay webhooks and payment entities
 * matching the official Razorpay API specifications.
 */

import { z } from "zod";

/**
 * Razorpay Payment Error Object
 */
export const RazorpayErrorSchema = z.object({
  code: z.string().nullish(),
  description: z.string().nullish(),
  source: z.string().nullish(), // "bank" | "customer" | "gateway" | "business"
  step: z.string().nullish(), // "payment_authorization" | "payment_initiation" | etc.
  reason: z.string().nullish(), // "insufficient_funds" | "card_expired" | etc.
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type RazorpayError = z.infer<typeof RazorpayErrorSchema>;

/**
 * Safe Non-Sensitive Card Metadata
 */
export const RazorpayCardSchema = z.object({
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
});
export type RazorpayCard = z.infer<typeof RazorpayCardSchema>;

/**
 * Razorpay Payment Entity
 */
export const RazorpayPaymentEntitySchema = z.object({
  id: z.string().min(1, "Razorpay payment ID is required"),
  entity: z.literal("payment").default("payment"),
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
  notes: z.record(z.string(), z.unknown()).nullish(),
  fee: z.coerce.number().nullish(),
  tax: z.coerce.number().nullish(),
  error_code: z.string().nullish(),
  error_description: z.string().nullish(),
  error_source: z.string().nullish(),
  error_step: z.string().nullish(),
  error_reason: z.string().nullish(),
  acquirer_data: z.record(z.string(), z.unknown()).nullish(),
  created_at: z.coerce.number(), // unix timestamp in seconds
});
export type RazorpayPaymentEntity = z.infer<typeof RazorpayPaymentEntitySchema>;

/**
 * Razorpay Webhook Payload Wrapper
 */
export const RazorpayWebhookPayloadSchema = z.object({
  entity: z.literal("event").optional(),
  account_id: z.string().nullish(),
  event: z.string(), // "payment.failed" | "payment.authorized" | "payment.captured" | etc.
  contains: z.array(z.string()).optional(),
  payload: z.object({
    payment: z.object({
      entity: RazorpayPaymentEntitySchema,
    }),
  }),
  created_at: z.coerce.number().optional(),
});
export type RazorpayWebhookPayload = z.infer<typeof RazorpayWebhookPayloadSchema>;
