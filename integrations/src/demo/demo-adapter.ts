/**
 * RecoverAI — Demo / Sandbox Provider Adapter
 *
 * Phase 3: Payment Event Pipeline
 *
 * Translates synthetic sandbox events into the canonical RecoverAI format.
 * All events handled by this adapter are explicitly DEMO / SYNTHETIC data.
 */

import { z } from "zod";
import {
  CanonicalPaymentEvent,
  CanonicalPaymentEventSchema,
  IProviderAdapter,
  PaymentMethodEnum,
  PaymentStatusEnum,
  EventTypeEnum,
  FailureCategoryEnum,
} from "@recoverai/contracts";

/**
 * Raw input schema for synthetic demo payment events.
 * Accepts both snake_case (typical webhook/API format) and camelCase.
 */
export const DemoRawPaymentEventSchema = z
  .object({
    // Identifier
    external_payment_id: z.string().min(1).optional(),
    externalPaymentId: z.string().min(1).optional(),

    // Context
    company_id: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),

    provider_id: z.string().optional(),
    providerId: z.string().optional(),

    customer_reference: z.string().nullish(),
    customerReference: z.string().nullish(),

    // Financial
    amount: z.coerce.number().positive("amount must be a positive number"),
    currency: z.string().min(3).max(3).default("INR"),

    // Status & Methods
    status: PaymentStatusEnum.default("PENDING"),
    payment_method: PaymentMethodEnum.optional(),
    paymentMethod: PaymentMethodEnum.optional(),

    event_type: EventTypeEnum.optional(),
    eventType: EventTypeEnum.optional(),

    // Failure Details
    failure_code: z.string().nullish(),
    failureCode: z.string().nullish(),

    failure_message: z.string().nullish(),
    failureMessage: z.string().nullish(),

    failure_category: FailureCategoryEnum.nullish(),
    failureCategory: FailureCategoryEnum.nullish(),

    // Timestamps & Meta
    timestamp: z.coerce.date().optional(),
    event_timestamp: z.coerce.date().optional(),
    eventTimestamp: z.coerce.date().optional(),

    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => Boolean(data.external_payment_id || data.externalPaymentId),
    {
      message: "external_payment_id or externalPaymentId is required",
      path: ["externalPaymentId"],
    }
  )
  .refine(
    (data) => Boolean(data.company_id || data.companyId),
    {
      message: "company_id or companyId is required",
      path: ["companyId"],
    }
  );

export type DemoRawPaymentEvent = z.infer<typeof DemoRawPaymentEventSchema>;

/**
 * Demo Adapter Implementation
 */
export class DemoAdapter implements IProviderAdapter<DemoRawPaymentEvent | unknown> {
  readonly providerType = "DEMO" as const;

  /**
   * Translates and normalizes raw demo payload into a CanonicalPaymentEvent.
   */
  normalize(rawEvent: unknown): CanonicalPaymentEvent {
    const parsed = DemoRawPaymentEventSchema.parse(rawEvent);

    const externalPaymentId = (
      parsed.externalPaymentId || parsed.external_payment_id
    )!.trim();
    const companyId = (parsed.companyId || parsed.company_id)!.trim();
    const providerId = (
      parsed.providerId ||
      parsed.provider_id ||
      "provider_demo_sandbox"
    ).trim();

    const customerReference =
      parsed.customerReference ?? parsed.customer_reference ?? null;
    const paymentMethod =
      parsed.paymentMethod ?? parsed.payment_method ?? "OTHER";

    // Auto-infer event type if not explicitly supplied
    let eventType = parsed.eventType ?? parsed.event_type;
    if (!eventType) {
      switch (parsed.status) {
        case "COMPLETED":
          eventType = "PAYMENT_COMPLETED";
          break;
        case "FAILED":
          eventType = "PAYMENT_FAILED";
          break;
        case "AUTHORIZED":
          eventType = "PAYMENT_AUTHORIZED";
          break;
        case "REFUNDED":
          eventType = "PAYMENT_REFUNDED";
          break;
        default:
          eventType = "PAYMENT_CREATED";
      }
    }

    const failureCode = parsed.failureCode ?? parsed.failure_code ?? null;
    const failureMessage =
      parsed.failureMessage ?? parsed.failure_message ?? null;
    const failureCategory =
      parsed.failureCategory ?? parsed.failure_category ?? null;

    const eventTimestamp =
      parsed.eventTimestamp ??
      parsed.event_timestamp ??
      parsed.timestamp ??
      new Date();

    const metadata = {
      ...(parsed.metadata || {}),
      is_demo_synthetic: true,
      adapter: "DemoAdapter",
    };

    // Construct and validate canonical event
    return CanonicalPaymentEventSchema.parse({
      externalPaymentId,
      companyId,
      providerId,
      customerReference,
      amount: parsed.amount,
      currency: parsed.currency.toUpperCase(),
      status: parsed.status,
      paymentMethod,
      eventType,
      failureCode,
      failureMessage,
      failureCategory,
      eventTimestamp,
      metadata,
    });
  }
}

/**
 * Factory helper for producing synthetic demo events in tests and sandbox triggers.
 */
export function createSyntheticDemoEvent(
  overrides?: Partial<DemoRawPaymentEvent>
): DemoRawPaymentEvent {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return {
    external_payment_id: `pay_demo_synth_${randomSuffix}`,
    company_id: "demo_company_001",
    provider_id: "provider_demo_sandbox",
    customer_reference: `cust_demo_${randomSuffix}`,
    amount: 1500.0,
    currency: "INR",
    status: "FAILED",
    payment_method: "CARD",
    event_type: "PAYMENT_FAILED",
    failure_code: "INSUFFICIENT_FUNDS",
    failure_message: "Card issuer declined payment due to insufficient funds",
    timestamp: new Date(),
    metadata: {
      synthetic: true,
      simulationScenario: "insufficient_balance_recovery_candidate",
    },
    ...overrides,
  };
}
