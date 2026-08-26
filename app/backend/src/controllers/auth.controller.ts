/**
 * RecoverAI — Authentication Controller
 *
 * Phase 12: Production Authentication, Authorization & Deployment Readiness
 *
 * Handles login and authenticated user profile retrieval.
 */

import { type Request, type Response, type NextFunction } from "express";
import { LoginRequestSchema } from "@recoverai/contracts";
import { AuthService } from "../services/auth.service.js";
import { AuditService } from "../services/audit.service.js";

export class AuthController {
  constructor(
    private readonly authService: AuthService = new AuthService(),
    private readonly auditService: AuditService = AuditService.getInstance()
  ) {}

  /**
   * POST /api/auth/login
   * Authenticates user credentials and issues a signed JWT token.
   */
  public handleLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = LoginRequestSchema.parse(req.body);
      const result = await this.authService.login(parsed.email, parsed.password);

      this.auditService.log({
        userId: result.user.id,
        companyId: result.user.companyId,
        role: result.user.role,
        action: "USER_LOGIN_SUCCESS",
        status: "SUCCESS",
        requestId: req.id,
      });

      res.status(200).json({
        success: true,
        token: result.token,
        user: result.user,
        expiresIn: result.expiresIn,
        requestId: req.id,
      });
    } catch (err: unknown) {
      this.auditService.log({
        action: "USER_LOGIN_FAILED",
        status: "FAILED",
        requestId: req.id,
        metadata: {
          email: typeof req.body?.email === "string" ? req.body.email : undefined,
        },
      });
      next(err);
    }
  };

  /**
   * GET /api/auth/me
   * Returns current authenticated user and tenant scope.
   */
  public handleGetMe = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthenticated",
        requestId: req.id,
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: req.user,
      tenant: req.tenant,
      requestId: req.id,
    });
  };
}
