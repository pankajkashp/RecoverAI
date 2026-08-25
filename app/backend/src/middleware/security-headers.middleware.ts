/**
 * RecoverAI — Security Headers Middleware
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * Implements standard HTTP defense-in-depth headers and strips identifying headers.
 */

import { type Request, type Response, type NextFunction } from "express";
import { environment } from "../config/env.js";

export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Strip server fingerprinting
  res.removeHeader("X-Powered-By");

  // Prevent MIME-sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Clickjacking protection
  res.setHeader("X-Frame-Options", "DENY");

  // Referrer leakage prevention
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Cross-site scripting legacy filter disable (modern recommendation)
  res.setHeader("X-XSS-Protection", "0");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';"
  );

  // HSTS in production environments
  if (environment.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}
