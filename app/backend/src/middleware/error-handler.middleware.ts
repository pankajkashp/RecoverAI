/**
 * RecoverAI — Centralized Error Handler Middleware
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * Catches unhandled errors and ensures production responses never leak
 * database connection strings, stack traces, system paths, or internal secrets.
 */

import { type Request, type Response, type NextFunction } from "express";
import { ZodError } from "zod";
import { TenantIsolationError } from "./tenant-context.middleware.js";

export function errorHandlerMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id;

  // Log internal details securely on server stdout/stderr
  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  );

  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      requestId,
    });
    return;
  }

  // 2. Tenant Isolation Violation
  if (error instanceof TenantIsolationError) {
    res.status(403).json({
      success: false,
      error: error.message,
      requestId,
    });
    return;
  }

  // 3. Known Business Not Found (excluding internal Prisma Transaction errors)
  if (
    error instanceof Error &&
    error.message.toLowerCase().includes("not found") &&
    !error.message.includes("Transaction not found") &&
    !("code" in error && typeof (error as { code: unknown }).code === "string" && (error as { code: string }).code.startsWith("P"))
  ) {
    res.status(404).json({
      success: false,
      error: error.message,
      requestId,
    });
    return;
  }


  // 4. Safe Production Fallback (never leak Prisma/SQL/Env details)
  res.status(500).json({
    success: false,
    error: "Internal server error",
    requestId,
  });
}
