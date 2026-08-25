/**
 * RecoverAI — Dashboard Controller
 *
 * Phase 9: Dashboard & Read API
 *
 * Express controller for serving company dashboard read queries.
 * Validates request parameters and delegates to DashboardService.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { DashboardPaymentsQuerySchema } from "@recoverai/contracts";
import { DashboardService } from "../services/dashboard.service.js";

const DashboardSummaryQuerySchema = z.object({
  companyId: z.string().trim().optional(),
});

export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService = new DashboardService()
  ) {}

  /**
   * GET /api/dashboard/summary
   * Returns aggregated dashboard metrics for the company.
   */
  handleGetSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = DashboardSummaryQuerySchema.parse(req.query);
      const summary = await this.dashboardService.getDashboardSummary(
        query.companyId
      );

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      next(error);
    }
  };

  /**
   * GET /api/dashboard/payments
   * Returns paginated, sorted, and filtered payment lifecycle records.
   */
  handleGetPayments = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = DashboardPaymentsQuerySchema.parse(req.query);
      const payments = await this.dashboardService.getDashboardPayments(query);

      res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      next(error);
    }
  };
}
