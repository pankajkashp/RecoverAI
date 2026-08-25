/**
 * RecoverAI — Request Correlation & Structured Logging Middleware
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * Assigns or propagates a correlation ID (X-Request-ID) for every incoming HTTP request.
 * Emits structured telemetry without logging sensitive payment or authentication secrets.
 */

import { randomUUID } from "node:crypto";
import { type Request, type Response, type NextFunction } from "express";

declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
  /* eslint-enable @typescript-eslint/no-namespace */
}

export function requestCorrelationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingId = req.headers["x-request-id"];
  const requestId =
    typeof incomingId === "string" && incomingId.trim().length > 0
      ? incomingId.trim()
      : randomUUID();

  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader("X-Request-ID", requestId);

  // Structured response completion logging
  res.on("finish", () => {
    const durationMs = req.startTime ? Date.now() - req.startTime : 0;
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
    };

    // Use structured stdout formatting (safe from secret leaks)
    if (res.statusCode >= 500) {
      console.error(JSON.stringify({ level: "error", ...logEntry }));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify({ level: "warn", ...logEntry }));
    } else {
      console.log(JSON.stringify({ level: "info", ...logEntry }));
    }
  });

  next();
}
