/**
 * RecoverAI — Role-Based Access Control (RBAC) Middleware
 *
 * Phase 12: Production Authentication, Authorization & Deployment Readiness
 *
 * Enforces role authorization (ADMIN, MEMBER, VIEWER) for sensitive API endpoints.
 */

import { type Request, type Response, type NextFunction } from "express";
import { UserRole } from "@recoverai/contracts";
import { AuditService } from "../services/audit.service.js";

const auditService = AuditService.getInstance();

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.tenant?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      auditService.log({
        userId: req.tenant?.userId,
        companyId: req.tenant?.companyId,
        role: userRole,
        action: "ROLE_AUTHORIZATION_DENIED",
        resource: req.originalUrl || req.path,
        status: "DENIED",
        requestId: req.id,
        metadata: {
          allowedRoles,
          userRole: userRole || null,
        },
      });

      res.status(403).json({
        success: false,
        error: "Forbidden: Insufficient role permissions for this operation",
        requestId: req.id,
      });
      return;
    }

    next();
  };
}
