/**
 * RecoverAI — Rate Limiter Middleware
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * In-memory sliding window rate limiter for protecting sensitive ingestion
 * and execution endpoints against denial-of-service and brute-force attempts.
 */

import { type Request, type Response, type NextFunction } from "express";
import { environment } from "../config/env.js";

interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
}

interface ClientRecord {
  timestamps: number[];
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs =
    options.windowMs ?? environment.RATE_LIMIT_WINDOW_MS ?? 60000;
  const maxRequests =
    options.maxRequests ?? environment.RATE_LIMIT_MAX_REQUESTS ?? 100;

  const clientMap = new Map<string, ClientRecord>();

  // Periodic cleanup of stale entries every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clientMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        clientMap.delete(key);
      }
    }
  }, 120000);

  // Unref interval so it doesn't keep node process alive in tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting in test environment unless specifically testing rate limiter
    if (environment.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) {
      next();
      return;
    }

    const clientKey =
      (req.headers["x-forwarded-for"] as string) ||
      req.ip ||
      req.socket.remoteAddress ||
      "anonymous";

    const now = Date.now();
    let record = clientMap.get(clientKey);

    if (!record) {
      record = { timestamps: [] };
      clientMap.set(clientKey, record);
    }

    // Filter out timestamps outside current window
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldestTimestamp = record.timestamps[0];
      const retryAfterSeconds = Math.ceil(
        (windowMs - (now - oldestTimestamp)) / 1000
      );

      res.setHeader("Retry-After", Math.max(1, retryAfterSeconds).toString());
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
        retryAfter: Math.max(1, retryAfterSeconds),
        requestId: req.id,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}
