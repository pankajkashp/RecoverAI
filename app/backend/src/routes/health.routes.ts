/**
 * RecoverAI — Health & Readiness Routes
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * Provides liveness (/health) and readiness (/ready) checks for container
 * orchestration, reverse proxies, and uptime monitoring.
 */

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { environment } from "../config/env.js";

export function createHealthRouter(): Router {
  const router = Router();

  /**
   * GET /health
   * Lightweight liveness check: verifies process is up and accepting HTTP traffic.
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  /**
   * GET /ready
   * Readiness check: verifies critical dependencies (PostgreSQL database).
   * Also checks optional ML service health without failing if ML is degraded.
   */
  router.get("/ready", async (_req: Request, res: Response) => {
    let dbStatus = "unknown";
    let isDbHealthy = false;
    let mlStatus = "unknown";

    // 1. Check Database Connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
      isDbHealthy = true;
    } catch (err: unknown) {
      dbStatus = "disconnected";
      console.error("Readiness check: database unreachable", err);
    }

    // 2. Check Optional ML Service (non-blocking, optional dependency)
    try {
      const mlResponse = await fetch(`${environment.ML_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      mlStatus = mlResponse.ok ? "available" : "degraded";
    } catch {
      mlStatus = "unavailable (deterministic fallback active)";
    }

    const isReady = isDbHealthy;
    const statusCode = isReady ? 200 : 503;

    res.status(statusCode).json({
      status: isReady ? "ready" : "not_ready",
      database: dbStatus,
      mlService: mlStatus,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
