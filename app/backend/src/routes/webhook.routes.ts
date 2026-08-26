/**
 * RecoverAI — Webhook Routes
 *
 * Phase 11: Razorpay Sandbox Integration
 *
 * Exposes webhook endpoints for payment provider callbacks.
 */

import { Router } from "express";
import { RazorpayWebhookController } from "../controllers/razorpay-webhook.controller.js";

export function createWebhookRouter(): Router {
  const router = Router();
  const razorpayController = new RazorpayWebhookController();

  // POST /api/webhooks/razorpay
  router.post("/razorpay", razorpayController.handleWebhook);

  return router;
}
