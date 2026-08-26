/**
 * RecoverAI — Tenant Context & Authorization Middleware
 *
 * Phase 10: Production Readiness, Security & Reliability
 *
 * Enforces multi-tenant data isolation and resolves authenticated tenant scope.
 * Guarantees that Tenant A cannot access, query, or mutate Tenant B records.
 */

import { type Request, type Response, type NextFunction } from "express";
import { AuthUser, UserRole } from "@recoverai/contracts";
import { environment } from "../config/env.js";
import { AuthService } from "../services/auth.service.js";
import { AuditService } from "../services/audit.service.js";

export interface TenantContext {
  companyId: string;
  userId?: string;
  role?: UserRole;
  isDemoSandbox: boolean;
  isAuthenticated: boolean;
}

declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      user?: AuthUser;
    }
  }
  /* eslint-enable @typescript-eslint/no-namespace */
}

export class TenantIsolationError extends Error {
  constructor(message: string = "Cross-tenant access is strictly prohibited") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

const authService = new AuthService();
const auditService = AuditService.getInstance();

export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Webhook Exception: Webhooks use cryptographic provider signatures (X-Razorpay-Signature)
  if (req.path.startsWith("/api/webhooks")) {
    next();
    return;
  }

  // 2. Health & Readiness Exception
  if (req.path === "/health" || req.path === "/ready" || req.path.startsWith("/api/health")) {
    next();
    return;
  }

  // 3. Auth Routes (login) do not require prior authentication
  if (req.path === "/api/auth/login") {
    next();
    return;
  }

  // 4. Extract and Verify Authorization Bearer Header
  const authHeader = req.headers["authorization"];
  let authUser: AuthUser | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token.length > 0) {
      authUser = authService.verifyToken(token);
    }
  }

  // 5. Identify target company from query or body
  const targetCompanyId =
    (typeof req.query.companyId === "string" && req.query.companyId.trim()) ||
    (typeof req.body?.companyId === "string" && req.body.companyId.trim()) ||
    null;

  // 6. Authenticated User Flow & Multi-Tenant Isolation
  if (authUser) {
    req.user = authUser;

    // Strict Multi-Tenant Isolation Check: Reject cross-tenant spoofing attempts
    if (targetCompanyId && targetCompanyId !== authUser.companyId) {
      auditService.log({
        userId: authUser.id,
        companyId: authUser.companyId,
        role: authUser.role,
        action: "TENANT_ISOLATION_VIOLATION_ATTEMPT",
        resource: req.originalUrl || req.path,
        status: "DENIED",
        requestId: req.id,
        metadata: {
          targetCompanyId,
          authenticatedCompanyId: authUser.companyId,
        },
      });

      res.status(403).json({
        success: false,
        error: "Tenant isolation violation: cannot access another company's data",
        requestId: req.id,
      });
      return;
    }

    req.tenant = {
      companyId: authUser.companyId,
      userId: authUser.id,
      role: authUser.role,
      isDemoSandbox: false,
      isAuthenticated: true,
    };
    next();
    return;
  }

  // 7. Production requirement vs Sandbox/Dev fallback
  if (environment.NODE_ENV === "production") {
    // In production, unauthenticated requests to protected APIs are rejected
    if (req.path.startsWith("/api/")) {
      auditService.log({
        action: "UNAUTHENTICATED_ACCESS_BLOCKED",
        resource: req.originalUrl || req.path,
        status: "DENIED",
        requestId: req.id,
      });

      res.status(401).json({
        success: false,
        error: "Authentication required",
        requestId: req.id,
      });
      return;
    }
  }

  // 8. Development / Sandbox fallback context
  req.tenant = {
    companyId: targetCompanyId || "demo_company_001",
    role: "ADMIN",
    isDemoSandbox: true,
    isAuthenticated: false,
  };

  next();
}
