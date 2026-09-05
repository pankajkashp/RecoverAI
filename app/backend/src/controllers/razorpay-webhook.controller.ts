/**
 * RecoverAI — Razorpay Webhook Controller
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Handles incoming Razorpay Test Mode webhooks:
 * 1. Verifies HMAC SHA256 signature using raw request body
 * 2. Normalizes payload via RazorpayProviderAdapter into CanonicalPaymentEvent
 * 3. Dispatches canonical event to existing PaymentPipelineService
 * 4. Ensures multi-tenant company scoping and idempotency
 */

import crypto from "node:crypto";
import { type Request, type Response, type NextFunction } from "express";
import { RazorpayProviderAdapter } from "@recoverai/integrations";
import { PaymentPipelineService } from "../services/payment-pipeline.service.js";
import { RecoveryExecutionService } from "../services/recovery-execution.service.js";
import { environment } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

// Extend Request type for rawBody captured by express.json({ verify: ... })
declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
  /* eslint-enable @typescript-eslint/no-namespace */
}

export class RazorpayWebhookController {
  private readonly adapter = new RazorpayProviderAdapter();
  private readonly pipelineService: PaymentPipelineService;
  private readonly recoveryExecutionService: RecoveryExecutionService;

  constructor(
    pipelineService?: PaymentPipelineService,
    recoveryExecutionService?: RecoveryExecutionService
  ) {
    this.pipelineService = pipelineService || new PaymentPipelineService();
    this.recoveryExecutionService =
      recoveryExecutionService || new RecoveryExecutionService();
  }


  /**
   * Main webhook handler for POST /api/webhooks/razorpay
   */
  public handleWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const signatureHeader = req.headers["x-razorpay-signature"];

      // 1. Determine Webhook Secret (from environment or query/tenant override)
      const webhookSecret =
        (req.query.secret as string) ||
        environment.RAZORPAY_WEBHOOK_SECRET ||
        (environment.NODE_ENV === "test" ? "test_webhook_secret_key" : undefined);
      console.log("WEBHOOK DEBUG", {
        hasSignature: !!signatureHeader,
        hasRawBody: !!req.rawBody,
        secretConfigured: !!webhookSecret,
      });

      if (!webhookSecret) {
        res.status(500).json({
          success: false,
          error: "Razorpay webhook secret is not configured on server",
          requestId: req.id,
        });
        return;
      }

      // 2. Validate Signature Presence
      if (!signatureHeader || typeof signatureHeader !== "string") {
        res.status(400).json({
          success: false,
          error: "Missing X-Razorpay-Signature header",
          requestId: req.id,
        });
        return;
      }

      // 3. Verify HMAC SHA256 Signature using raw body buffer
      const rawPayload =
        req.rawBody || Buffer.from(JSON.stringify(req.body), "utf-8");

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawPayload)
        .digest("hex");

      const signatureBuffer = Buffer.from(signatureHeader.trim());
      const expectedBuffer = Buffer.from(expectedSignature.trim());

      const isValidSignature =
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
      console.log("SIGNATURE DEBUG", {
        receivedLength: signatureHeader.length,
        expectedLength: expectedSignature.length,
        valid: isValidSignature,
      });

      if (!isValidSignature) {
        res.status(400).json({
          success: false,
          error: "Invalid Razorpay webhook signature",
          requestId: req.id,
        });
        return;
      }

      // 4. Extract and Sanitize Entities & Notes
      const paymentEntity = req.body?.payload?.payment?.entity;
      const orderEntity = req.body?.payload?.order?.entity;
      const paymentLinkEntity = req.body?.payload?.payment_link?.entity;
      const eventName = req.body?.event as string;

      function sanitizeNotes(val: unknown): Record<string, unknown> {
        if (!val) return {};
        if (Array.isArray(val)) return {};
        if (typeof val === "object") return val as Record<string, unknown>;
        return {};
      }

      const paymentNotes = sanitizeNotes(paymentEntity?.notes);
      const orderNotes = sanitizeNotes(orderEntity?.notes);
      const linkNotes = sanitizeNotes(paymentLinkEntity?.notes);
      const notes = { ...linkNotes, ...orderNotes, ...paymentNotes };

      // Ensure entity notes are sanitized if empty array was received
      if (paymentEntity && (Array.isArray(paymentEntity.notes) || !paymentEntity.notes)) {
        paymentEntity.notes = notes;
      }
      if (orderEntity && (Array.isArray(orderEntity.notes) || !orderEntity.notes)) {
        orderEntity.notes = orderNotes;
      }

      // 5. Resolve or Register Razorpay Provider in DB
      let provider = await prisma.provider.findFirst({
        where: { type: "RAZORPAY" },
      });
      if (!provider) {
        provider = await prisma.provider.create({
          data: {
            id: "provider_razorpay_test",
            name: "Razorpay Test / Sandbox",
            type: "RAZORPAY",
            isActive: true,
          },
        });
      }

      // 6. Check for Recovery Confirmation (e.g. payment.captured or payment_link.paid for a recovery attempt)
      const confirmedAmount = paymentEntity
        ? Number((paymentEntity.amount / 100).toFixed(2))
        : orderEntity
        ? Number(((orderEntity.amount_paid ?? orderEntity.amount) / 100).toFixed(2))
        : paymentLinkEntity
        ? Number(((paymentLinkEntity.amount_paid ?? paymentLinkEntity.amount ?? 0) / 100).toFixed(2))
        : 0;

      const providerPaymentId =
        paymentEntity?.id || orderEntity?.id || paymentLinkEntity?.id || "unknown";

      const paymentLinkId =
        paymentLinkEntity?.id ||
        (paymentEntity?.invoice_id?.startsWith("plink_") ? paymentEntity.invoice_id : undefined);

      const currency =
        paymentEntity?.currency ||
        orderEntity?.currency ||
        paymentLinkEntity?.currency ||
        "INR";

      const providerReference =
        paymentLinkId ||
        (paymentEntity?.invoice_id?.startsWith("plink_") ? paymentEntity.invoice_id : undefined) ||
        undefined;

      const orderId =
        paymentEntity?.order_id ||
        orderEntity?.id ||
        paymentLinkEntity?.order_id ||
        undefined;

      console.log("[Razorpay Webhook Accepted]", {
        event: eventName,
        providerPaymentId,
        paymentLinkId,
        orderId,
        confirmedAmount,
        currency,
      });

      const recoveryResult = await this.recoveryExecutionService.confirmRecoveryFromProvider({
        providerPaymentId,
        confirmedAmount,
        currency,
        event: eventName,
        recoveryAttemptId: (notes.recoveryAttemptId as string) || undefined,
        paymentEventId: (notes.paymentEventId as string) || undefined,
        originalExternalPaymentId:
          (notes.originalExternalPaymentId as string) ||
          (notes.originalPaymentId as string) ||
          undefined,
        providerReference,
        invoiceId: paymentEntity?.invoice_id || undefined,
        orderId,
        paymentLinkId,
        notes: `Razorpay webhook: ${eventName} (${providerPaymentId})`,
      });

      if (recoveryResult.isRecovery) {
        console.log("[Razorpay Webhook Recovery Matched & Confirmed]", {
          recoveryAttemptId: recoveryResult.attemptId,
          recoveryOutcomeId: recoveryResult.outcomeId,
          outcomeStatus: recoveryResult.status,
          actualRecoveredAmount: recoveryResult.actualRecoveredAmount,
          message: recoveryResult.message,
        });

        res.status(200).json({
          success: true,
          isRecoveryConfirmation: true,
          recoveryAttemptId: recoveryResult.attemptId,
          recoveryOutcomeId: recoveryResult.outcomeId,
          outcomeStatus: recoveryResult.status,
          actualRecoveredAmount: recoveryResult.actualRecoveredAmount,
          message: recoveryResult.message,
          requestId: req.id,
        });
        return;
      }

      // 7. Normalize Razorpay Webhook Payload to CanonicalPaymentEvent for non-recovery ingestion
      let entityToNormalize: unknown = paymentEntity;
      if (!entityToNormalize && orderEntity) {
        entityToNormalize = {
          id: orderEntity.id,
          entity: "payment",
          amount: orderEntity.amount_paid ?? orderEntity.amount,
          currency: orderEntity.currency || "INR",
          status: "captured",
          order_id: orderEntity.id,
          method: "other",
          notes,
          created_at: orderEntity.created_at || Math.floor(Date.now() / 1000),
        };
      } else if (!entityToNormalize && paymentLinkEntity) {
        entityToNormalize = {
          id: paymentLinkEntity.id,
          entity: "payment",
          amount: paymentLinkEntity.amount_paid ?? paymentLinkEntity.amount ?? 0,
          currency: paymentLinkEntity.currency || "INR",
          status: paymentLinkEntity.status === "paid" ? "captured" : "created",
          order_id: paymentLinkEntity.order_id || null,
          invoice_id: paymentLinkEntity.id,
          method: "other",
          notes,
          created_at: paymentLinkEntity.created_at || Math.floor(Date.now() / 1000),
        };
      }

      const canonicalEvent = this.adapter.normalize(entityToNormalize || req.body, {
        providerId: provider.id,
        eventName,
        accountId: req.body?.account_id,
      });

      console.log("[Razorpay Webhook Normal Payment Processed]", {
        externalPaymentId: canonicalEvent.externalPaymentId,
        status: canonicalEvent.status,
      });

      // 8. Dispatch through Existing Core Payment Pipeline
      const result = await this.pipelineService.processEvent(canonicalEvent);

      // 9. Return Safe Standardized Response
      res.status(200).json({
        success: true,
        eventId: result.paymentEventId,
        externalPaymentId: result.externalPaymentId,
        status: result.paymentStatus,
        isDuplicate: result.isDuplicate,
        requestId: req.id,
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}

