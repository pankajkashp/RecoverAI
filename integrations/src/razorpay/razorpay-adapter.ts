/**
 * RecoverAI — Razorpay Provider Adapter
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Translates Razorpay webhook events and payment entities into the
 * provider-independent CanonicalPaymentEvent format.
 *
 * Encapsulates all Razorpay-specific conventions (paise conversion, error tuples,
 * method enums) so the RecoverAI core remains 100% provider-agnostic.
 */

import {
  CanonicalPaymentEvent,
  CanonicalPaymentEventSchema,
  IProviderAdapter,
  PaymentMethod,
  PaymentStatus,
  EventType,
  FailureCategory,
} from "@recoverai/contracts";
import {
  RazorpayWebhookPayloadSchema,
  RazorpayPaymentEntitySchema,
  type RazorpayWebhookPayload,
  type RazorpayPaymentEntity,
} from "./razorpay-schemas.js";

export interface RazorpayAdapterOptions {
  companyId?: string;
  providerId?: string;
}

export class RazorpayProviderAdapter
  implements IProviderAdapter<RazorpayWebhookPayload | unknown>
{
  readonly providerType = "RAZORPAY" as const;

  /**
   * Normalizes a raw Razorpay webhook payload or payment entity into CanonicalPaymentEvent.
   */
  normalize(
    rawEvent: unknown,
    options?: RazorpayAdapterOptions
  ): CanonicalPaymentEvent {
    let paymentEntity: RazorpayPaymentEntity;
    let eventName: string | undefined;
    let accountId: string | undefined;

    // 1. Try parsing as full Webhook Payload
    const webhookParse = RazorpayWebhookPayloadSchema.safeParse(rawEvent);
    if (webhookParse.success) {
      paymentEntity = webhookParse.data.payload.payment.entity;
      eventName = webhookParse.data.event;
      accountId = webhookParse.data.account_id || undefined;
    } else {
      // 2. Try parsing as direct Payment Entity
      const entityParse = RazorpayPaymentEntitySchema.safeParse(rawEvent);
      if (entityParse.success) {
        paymentEntity = entityParse.data;
      } else {
        // Bubble up actionable validation error
        throw new Error(
          `Invalid Razorpay payload: ${webhookParse.error.issues.map((i) => i.message).join(", ")}`
        );
      }
    }

    // 3. Extract and resolve identifiers
    const externalPaymentId = paymentEntity.id.trim();

    const companyId = (
      options?.companyId ||
      (paymentEntity.notes?.company_id as string) ||
      (paymentEntity.notes?.companyId as string) ||
      "demo_company_001"
    ).trim();

    const providerId = (
      options?.providerId ||
      "provider_razorpay_test"
    ).trim();

    const customerReference =
      (paymentEntity.notes?.customer_id as string) ||
      (paymentEntity.notes?.customerReference as string) ||
      paymentEntity.email ||
      paymentEntity.contact ||
      null;

    // 4. Monetary conversion: Razorpay amount is in lowest subunit (paise). Divide by 100.
    const amount = Number((paymentEntity.amount / 100).toFixed(2));
    const currency = paymentEntity.currency.toUpperCase();

    // 5. Status normalization
    const status = this.normalizeStatus(paymentEntity.status);

    // 6. Event Type normalization
    const eventType = this.normalizeEventType(eventName, status);

    // 7. Payment Method normalization
    const paymentMethod = this.normalizePaymentMethod(paymentEntity.method);

    // 8. Timestamp conversion: Unix seconds to Date
    const eventTimestamp = new Date(paymentEntity.created_at * 1000);

    // 9. Failure Information extraction
    const failureCode =
      paymentEntity.error_reason || paymentEntity.error_code || null;
    const failureMessage = paymentEntity.error_description || null;
    const failureCategory = this.resolveFailureCategory(
      paymentEntity.error_code,
      paymentEntity.error_reason,
      paymentEntity.error_description
    );

    // 10. Contextual Metadata preservation
    const metadata: Record<string, unknown> = {
      provider: "RAZORPAY",
      orderId: paymentEntity.order_id || null,
      invoiceId: paymentEntity.invoice_id || null,
      bank: paymentEntity.bank || null,
      wallet: paymentEntity.wallet || null,
      vpa: paymentEntity.vpa || null,
      accountId: accountId || null,
      notes: paymentEntity.notes || {},
      acquirerData: paymentEntity.acquirer_data || null,
      razorpayError: {
        code: paymentEntity.error_code || null,
        description: paymentEntity.error_description || null,
        source: paymentEntity.error_source || null,
        step: paymentEntity.error_step || null,
        reason: paymentEntity.error_reason || null,
      },
    };

    if (paymentEntity.card) {
      metadata.card = {
        last4: paymentEntity.card.last4 || null,
        network: paymentEntity.card.network || null,
        type: paymentEntity.card.type || null,
        issuer: paymentEntity.card.issuer || null,
        international: paymentEntity.card.international ?? false,
        emi: paymentEntity.card.emi ?? false,
      };
    }

    const orderReference = paymentEntity.order_id?.trim() || null;


    const merchantTransactionReference = (
      (paymentEntity.notes?.transaction_id as string) ||
      (paymentEntity.notes?.transactionId as string) ||
      (paymentEntity.notes?.business_transaction_id as string) ||
      (paymentEntity.notes?.businessTransactionId as string) ||
      (paymentEntity.notes?.merchant_transaction_id as string) ||
      (paymentEntity.notes?.merchantTransactionId as string) ||
      (paymentEntity.notes?.merchant_order_id as string) ||
      (paymentEntity.notes?.merchantOrderId as string) ||
      (paymentEntity.notes?.receipt as string) ||
      null
    )?.trim() || null;

    // 11. Construct and validate CanonicalPaymentEvent
    return CanonicalPaymentEventSchema.parse({
      externalPaymentId,
      orderReference,
      merchantTransactionReference,
      companyId,
      providerId,
      customerReference,
      amount,
      currency,
      status,
      paymentMethod,
      eventType,
      failureCode,
      failureMessage,
      failureCategory,
      eventTimestamp,
      metadata,
    });

  }

  private normalizeStatus(status: string): PaymentStatus {
    switch (status.toLowerCase()) {
      case "captured":
        return "COMPLETED";
      case "authorized":
        return "AUTHORIZED";
      case "failed":
        return "FAILED";
      case "refunded":
        return "REFUNDED";
      case "created":
        return "PENDING";
      default:
        return "FAILED";
    }
  }

  private normalizeEventType(
    eventName: string | undefined,
    status: PaymentStatus
  ): EventType {
    if (eventName) {
      switch (eventName.toLowerCase()) {
        case "payment.captured":
        case "order.paid":
          return "PAYMENT_COMPLETED";
        case "payment.authorized":
          return "PAYMENT_AUTHORIZED";
        case "payment.failed":
          return "PAYMENT_FAILED";
        case "payment.refunded":
        case "refund.processed":
          return "PAYMENT_REFUNDED";
        case "payment.created":
          return "PAYMENT_CREATED";
      }
    }

    // Fallback based on normalized status
    switch (status) {
      case "COMPLETED":
        return "PAYMENT_COMPLETED";
      case "AUTHORIZED":
        return "PAYMENT_AUTHORIZED";
      case "FAILED":
        return "PAYMENT_FAILED";
      case "REFUNDED":
        return "PAYMENT_REFUNDED";
      default:
        return "PAYMENT_CREATED";
    }
  }

  private normalizePaymentMethod(method: string): PaymentMethod {
    switch (method.toLowerCase()) {
      case "card":
      case "emi":
        return "CARD";
      case "upi":
        return "UPI";
      case "netbanking":
        return "NETBANKING";
      case "wallet":
        return "WALLET";
      case "bank_transfer":
        return "BANK_TRANSFER";
      default:
        return "OTHER";
    }
  }

  private resolveFailureCategory(
    code?: string | null,
    reason?: string | null,
    description?: string | null
  ): FailureCategory {
    const combined = `${code || ""} ${reason || ""} ${description || ""}`.toLowerCase();

    if (
      combined.includes("insufficient_funds") ||
      combined.includes("low_balance") ||
      combined.includes("insufficient balance") ||
      combined.includes("exceeds balance")
    ) {
      return "INSUFFICIENT_FUNDS";
    }

    if (
      combined.includes("auth_failed") ||
      combined.includes("authentication_failed") ||
      combined.includes("otp") ||
      combined.includes("3d secure") ||
      combined.includes("mfa")
    ) {
      return "AUTHENTICATION";
    }

    if (
      combined.includes("gateway_error") ||
      combined.includes("network_error") ||
      combined.includes("timeout") ||
      combined.includes("connection")
    ) {
      return "NETWORK";
    }

    if (
      combined.includes("card_expired") ||
      combined.includes("card_inactive") ||
      combined.includes("invalid_card") ||
      combined.includes("card_declined")
    ) {
      return "CARD";
    }

    if (
      combined.includes("bank_error") ||
      combined.includes("bank_declined") ||
      combined.includes("bank server")
    ) {
      return "BANK";
    }

    if (
      combined.includes("customer_action_required") ||
      combined.includes("user_cancelled") ||
      combined.includes("customer cancelled")
    ) {
      return "CUSTOMER_ACTION_REQUIRED";
    }

    return "UNKNOWN";
  }
}
