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

  constructor(pipelineService?: PaymentPipelineService) {
    this.pipelineService = pipelineService || new PaymentPipelineService();
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

      // 4. Resolve Tenant Company Context
      const companyId = (
        (req.query.companyId as string) ||
        (req.body?.payload?.payment?.entity?.notes?.company_id as string) ||
        (req.body?.payload?.payment?.entity?.notes?.companyId as string) ||
        req.tenant?.companyId ||
        "demo_company_001"
      ).trim();

      // Ensure Company exists in DB
      let company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        // In sandbox / test mode, auto-create company if not present
        company = await prisma.company.create({
          data: {
            id: companyId,
            name: `Company ${companyId}`,
          },
        });
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

      // 6. Normalize Razorpay Webhook Payload to CanonicalPaymentEvent
      const canonicalEvent = this.adapter.normalize(req.body, {
        companyId: company.id,
        providerId: provider.id,
      });

      // 7. Dispatch through Existing Core Payment Pipeline
      const result = await this.pipelineService.processEvent(canonicalEvent);

      // 8. Return Safe Standardized Response
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
