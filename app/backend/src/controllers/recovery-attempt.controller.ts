/**
 * RecoverAI — Recovery Attempt Controller
 *
 * Phase 8: Recovery Execution & Outcome Tracking
 *
 * Express controller for triggering synthetic recovery execution.
 * Validates request payload and delegates to RecoveryExecutionService.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  RecoveryExecutionService,
  IneligibleRecoveryError,
  RecommendationNotFoundError,
} from "../services/recovery-execution.service.js";

export class RecoveryAttemptController {
  constructor(
    private readonly executionService: RecoveryExecutionService = new RecoveryExecutionService()
  ) {}

  /**
   * POST /api/recovery-attempts
   * Triggers execution of an eligible recovery recommendation.
   */
  handleExecuteRecovery = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.executionService.executeRecovery(req.body);

      // Return 200 for idempotent duplicate calls, 201 for new executions
      const statusCode = result.isExecuted ? 201 : 200;

      res.status(statusCode).json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      if (error instanceof RecommendationNotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }

      if (error instanceof IneligibleRecoveryError) {
        res.status(422).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }

      next(error);
    }
  };
}
