/**
 * RecoverAI — Authentication Routes
 *
 * Phase 12: Production Authentication, Authorization & Deployment Readiness
 */

import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { createRateLimiter } from "../middleware/rate-limiter.middleware.js";

export function createAuthRouter(): Router {
  const router = Router();
  const controller = new AuthController();
  const authRateLimiter = createRateLimiter();

  // POST /api/auth/login
  router.post("/login", authRateLimiter, controller.handleLogin);

  // GET /api/auth/me
  router.get("/me", controller.handleGetMe);

  return router;
}
