/**
 * RecoverAI — Payment Event Routes
 *
 * Phase 3: Payment Event Pipeline
 */

import { Router } from "express";
import { PaymentEventController } from "../controllers/payment-event.controller.js";

export function createPaymentEventRouter(
  controller: PaymentEventController = new PaymentEventController()
): Router {
  const router = Router();

  // Ingest payment events
  router.post("/", controller.handleIngestEvent);

  return router;
}
