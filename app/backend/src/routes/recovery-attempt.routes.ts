/**
 * RecoverAI — Recovery Attempt Routes
 *
 * Phase 8: Recovery Execution & Outcome Tracking
 */

import { Router } from "express";
import { RecoveryAttemptController } from "../controllers/recovery-attempt.controller.js";

export function createRecoveryAttemptRouter(
  controller: RecoveryAttemptController = new RecoveryAttemptController()
): Router {
  const router = Router();

  // Trigger recovery execution for a recommendation
  router.post("/", controller.handleExecuteRecovery);

  return router;
}
