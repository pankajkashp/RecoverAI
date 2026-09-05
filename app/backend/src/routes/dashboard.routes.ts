/**
 * RecoverAI — Dashboard Routes
 *
 * Phase 9: Dashboard & Read API
 */

import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";

export function createDashboardRouter(
  controller: DashboardController = new DashboardController()
): Router {
  const router = Router();

  router.get("/summary", controller.handleGetSummary);
  router.get("/payments", controller.handleGetPayments);
  router.get("/events", controller.handleEventsStream);
  router.post("/reset-demo-data", controller.handleResetDemoData);

  return router;
}

