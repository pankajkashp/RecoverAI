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
  RazorpayOrderEntitySchema,
  type RazorpayWebhookPayload,
  type RazorpayPaymentEntity,
  type RazorpayOrderEntity,
} from "./razorpay-schemas.js";

export interface RazorpayAdapterOptions {
  companyId?: string;
  providerId?: string;
  eventName?: string;
  accountId?: string;
}

export class RazorpayProviderAdapter
  implements IProviderAdapter<RazorpayWebhookPayload | unknown>
{
  readonly providerType = "RAZORPAY" as const;

  /**
   * Normalizes a raw Razorpay webhook payload, payment entity, or order entity into CanonicalPaymentEvent.
   */
  normalize(
    rawEvent: unknown,
    options?: RazorpayAdapterOptions
  ): CanonicalPaymentEvent {
    let paymentEntity: RazorpayPaymentEntity;
    let eventName: string | undefined = options?.eventName;
    let accountId: string | undefined = options?.accountId;

    // 1. Try parsing as full Webhook Payload
    const webhookParse = RazorpayWebhookPayloadSchema.safeParse(rawEvent);
    if (webhookParse.success) {
      eventName = webhookParse.data.event;
      accountId = webhookParse.data.account_id || accountId;

      if (webhookParse.data.payload.payment?.entity) {
        paymentEntity = webhookParse.data.payload.payment.entity;
      } else if (webhookParse.data.payload.order?.entity) {
        const order = webhookParse.data.payload.order.entity;
        paymentEntity = {
          id: order.id,
          entity: "payment",
          amount: order.amount_paid ?? order.amount,
          currency: order.currency,
          status: order.status === "paid" ? "captured" : "created",
          order_id: order.id,
          method: "other",
          notes: order.notes || {},
          created_at: order.created_at,
        };
      } else {
        throw new Error("Webhook payload missing payment or order entity");
      }
    } else {
      // 2. Try parsing as direct Payment Entity
      const entityParse = RazorpayPaymentEntitySchema.safeParse(rawEvent);
      if (entityParse.success) {
        paymentEntity = entityParse.data;
      } else {
        // 3. Try parsing as direct Order Entity
        const orderParse = RazorpayOrderEntitySchema.safeParse(rawEvent);
        if (orderParse.success) {
          const order = orderParse.data;
          paymentEntity = {
            id: order.id,
            entity: "payment",
            amount: order.amount_paid ?? order.amount,
            currency: order.currency,
            status: order.status === "paid" ? "captured" : "created",
            order_id: order.id,
            method: "other",
            notes: order.notes || {},
            created_at: order.created_at,
          };
        } else {
          // Bubble up actionable validation error from webhookParse
          throw new Error(
            `Invalid Razorpay payload: ${webhookParse.error.issues.map((i) => i.message).join(", ")}`
          );
        }
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
    const acquirerData = (paymentEntity.acquirer_data && typeof paymentEntity.acquirer_data === "object"
      ? paymentEntity.error?.metadata || paymentEntity.acquirer_data
      : null) as Record<string, unknown> | null;

    const failureCode =
      paymentEntity.error?.reason ||
      paymentEntity.error_reason ||
      paymentEntity.error?.code ||
      paymentEntity.error_code ||
      (acquirerData?.error_code as string) ||
      (acquirerData?.response_code as string) ||
      null;
    const failureMessage =
      paymentEntity.error?.description ||
      paymentEntity.error_description ||
      (acquirerData?.error_description as string) ||
      null;
    const failureSource =
      paymentEntity.error?.source ||
      paymentEntity.error_source ||
      null;
    const failureStep =
      paymentEntity.error?.step ||
      paymentEntity.error_step ||
      null;

    const failureCategory = this.resolveFailureCategory(
      paymentEntity.error?.code || paymentEntity.error_code,
      paymentEntity.error?.reason || paymentEntity.error_reason,
      paymentEntity.error?.description || paymentEntity.error_description,
      failureSource,
      failureStep,
      acquirerData
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
        code: paymentEntity.error?.code || paymentEntity.error_code || null,
        description: paymentEntity.error?.description || paymentEntity.error_description || null,
        source: paymentEntity.error?.source || paymentEntity.error_source || null,
        step: paymentEntity.error?.step || paymentEntity.error_step || null,
        reason: paymentEntity.error?.reason || paymentEntity.error_reason || null,
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

  private normalizePaymentMethod(method?: string | null): PaymentMethod {
    const m = (method || "").toLowerCase().trim();
    if (m === "card" || m === "emi" || m.includes("card")) {
      return "CARD";
    }
    if (m === "upi" || m.includes("upi") || m.includes("gpay") || m.includes("phonepe") || m.includes("paytm")) {
      return "UPI";
    }
    if (m === "netbanking" || m === "net_banking" || m === "nb" || m.includes("banking")) {
      return "NETBANKING";
    }
    if (m === "wallet" || m === "wallets" || m.includes("wallet")) {
      return "WALLET";
    }
    if (m === "bank_transfer" || m === "neft" || m === "rtgs" || m === "imps") {
      return "BANK_TRANSFER";
    }
    return "OTHER";
  }

  private resolveFailureCategory(
    code?: string | null,
    reason?: string | null,
    description?: string | null,
    source?: string | null,
    step?: string | null,
    acquirerData?: Record<string, unknown> | null
  ): FailureCategory {
    const rawCombined = `${code || ""} ${reason || ""} ${description || ""}`.toLowerCase();
    const combined = rawCombined.replace(/[-_]+/g, " ");
    const normalizedSource = (source || "").toLowerCase().trim();
    const normalizedStep = (step || "").toLowerCase().trim();
    const responseCode = acquirerData?.response_code ? String(acquirerData.response_code).trim() : "";

    // 1. INSUFFICIENT_FUNDS (funds/limit shortage, ISO 51)
    if (
      responseCode === "51" ||
      combined.includes("insufficient funds") ||
      combined.includes("low balance") ||
      combined.includes("insufficient balance") ||
      combined.includes("exceeds balance") ||
      combined.includes("not enough funds") ||
      combined.includes("credit limit exceeded") ||
      combined.includes("balance insufficient") ||
      combined.includes("nsf")
    ) {
      return "INSUFFICIENT_FUNDS";
    }

    // 2. AUTHENTICATION (failed OTP, 3D secure, wrong pin, mpin, authentication step)
    if (
      normalizedStep === "payment_authentication" ||
      combined.includes("auth failed") ||
      combined.includes("authentication failed") ||
      combined.includes("otp") ||
      combined.includes("3d secure") ||
      combined.includes("3ds") ||
      combined.includes("mfa") ||
      combined.includes("wrong pin") ||
      combined.includes("incorrect pin") ||
      combined.includes("invalid pin") ||
      combined.includes("mpin") ||
      combined.includes("verification failed")
    ) {
      return "AUTHENTICATION";
    }

    // 3. NETWORK (timeouts, connectivity, gateway socket errors)
    if (
      combined.includes("timeout") ||
      combined.includes("timed out") ||
      combined.includes("network error") ||
      combined.includes("gateway timeout") ||
      combined.includes("connection") ||
      combined.includes("socket") ||
      combined.includes("switch timeout") ||
      combined.includes("psp timeout")
    ) {
      return "NETWORK";
    }

    // 4. CARD (card expired, invalid card number, blocked, card declined, ISO 54)
    if (
      responseCode === "54" ||
      combined.includes("card expired") ||
      combined.includes("expired card") ||
      combined.includes("card inactive") ||
      combined.includes("invalid card") ||
      combined.includes("card declined") ||
      combined.includes("declined by card") ||
      combined.includes("lost card") ||
      combined.includes("stolen card") ||
      combined.includes("invalid cvv") ||
      combined.includes("incorrect cvv") ||
      combined.includes("restricted card") ||
      combined.includes("card type not supported")
    ) {
      return "CARD";
    }

    // 5. CUSTOMER_ACTION_REQUIRED (user cancelled, dropped off, invalid VPA, mandate consent)
    if (
      combined.includes("customer action required") ||
      combined.includes("user cancelled") ||
      combined.includes("customer cancelled") ||
      combined.includes("payment cancelled") ||
      combined.includes("cancelled by user") ||
      combined.includes("user dropped") ||
      combined.includes("invalid vpa") ||
      combined.includes("vpa invalid") ||
      combined.includes("collect request expired") ||
      combined.includes("mandate pending") ||
      combined.includes("consent required")
    ) {
      return "CUSTOMER_ACTION_REQUIRED";
    }

    // 6. BANK (failure source is bank, bank-specific rejection, ISO 05)
    if (
      normalizedSource === "bank" ||
      responseCode === "05" ||
      combined.includes("bank error") ||
      combined.includes("bank declined") ||
      combined.includes("bank server") ||
      combined.includes("bank unavailable") ||
      combined.includes("issuer declined") ||
      combined.includes("declined by issuer") ||
      combined.includes("do not honor") ||
      combined.includes("account blocked") ||
      combined.includes("account frozen") ||
      combined.includes("bank debit failed")
    ) {
      return "BANK";
    }

    // 7. PROVIDER (gateway / processor processing failure, or source is gateway/business)
    if (
      normalizedSource === "gateway" ||
      normalizedSource === "business" ||
      combined.includes("gateway error") ||
      combined.includes("processor error") ||
      combined.includes("internal gateway error") ||
      combined.includes("provider unavailable") ||
      combined.includes("provider outage") ||
      combined.includes("gateway outage") ||
      combined.includes("acquirer down") ||
      combined.includes("route not found") ||
      code?.toUpperCase() === "GATEWAY_ERROR" ||
      code?.toUpperCase() === "SERVER_ERROR"
    ) {
      return "PROVIDER";
    }

    // 8. TEMPORARY (transient conditions)
    if (
      combined.includes("temporary") ||
      combined.includes("transient") ||
      combined.includes("retry later") ||
      combined.includes("try again later") ||
      combined.includes("system busy") ||
      combined.includes("throttled")
    ) {
      return "TEMPORARY";
    }

    return "UNKNOWN";
  }

}
