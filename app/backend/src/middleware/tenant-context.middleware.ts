/**
 * RecoverAI — Authentication & Context Middleware
 *
 * Resolves authenticated user profile and roles for API security.
 */

import { type Request, type Response, type NextFunction } from "express";
import { AuthUser, UserRole } from "@recoverai/contracts";
import { environment } from "../config/env.js";
import { AuthService } from "../services/auth.service.js";
import { AuditService } from "../services/audit.service.js";

export interface TenantContext {
  companyId?: string;
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
  constructor(message: string = "Unauthorized access") {
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

  // 5. Authenticated User Flow
  if (authUser) {
    req.user = authUser;
    req.tenant = {
      userId: authUser.id,
      role: authUser.role,
      isDemoSandbox: false,
      isAuthenticated: true,
    };
    next();
    return;
  }

  // 6. Production requirement vs Sandbox/Dev fallback
  if (environment.NODE_ENV === "production") {
    // In production, unauthenticated requests to protected mutating APIs are rejected
    if (req.path.startsWith("/api/recovery-attempts")) {
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

  // 7. Development / Sandbox fallback context
  req.tenant = {
    role: "ADMIN",
    isDemoSandbox: true,
    isAuthenticated: false,
  };

  next();
}

