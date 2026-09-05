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
import {
  DashboardSummaryQuerySchema,
  DashboardPaymentsQuerySchema,
} from "@recoverai/contracts";
import { DashboardService } from "../services/dashboard.service.js";
import { dashboardEventService } from "../services/dashboard-event.service.js";

export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService = new DashboardService()
  ) {}

  /**
   * GET /api/dashboard/summary
   * Returns aggregated dashboard metrics for the company with optional date filtering.
   */
  handleGetSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = DashboardSummaryQuerySchema.parse(req.query);
      const dateRange =
        query.from || query.to
          ? { from: query.from, to: query.to }
          : undefined;

      const summary = await this.dashboardService.getDashboardSummary(
        query.companyId,
        dateRange
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

  /**
   * GET /api/dashboard/events
   * Server-Sent Events (SSE) endpoint providing real-time dashboard events.
   */
  handleEventsStream = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Configure SSE Headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Send initial connection handshake
      res.write(
        `event: connected\ndata: ${JSON.stringify({ status: "connected", connectedAt: new Date().toISOString() })}\n\n`
      );

      // Subscribe to global dashboard events
      const unsubscribe = dashboardEventService.subscribe((event) => {
        res.write(
          `event: dashboard_update\ndata: ${JSON.stringify(event)}\n\n`
        );
      });

      // Keep connection alive with periodic heartbeat (every 20s)
      const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 20000);

      // Cleanup on client disconnect
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error: unknown) {
      next(error);
    }
  };

  /**
   * POST /api/dashboard/reset-demo-data
   * Safely resets transient demo transaction data in development/demo environments.
   * Strictly blocked in production.
   */
  handleResetDemoData = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (process.env.NODE_ENV === "production") {
        res.status(403).json({
          success: false,
          error: "Demo data reset is disabled in production environments.",
        });
        return;
      }

      const result = await this.dashboardService.resetDemoData();

      // Broadcast SSE event to instantly refresh all connected clients
      dashboardEventService.emitDashboardEvent({
        type: "DEMO_RESET",
        timestamp: new Date().toISOString(),
      });

      res.status(200).json({
        success: true,
        message: "Demo transaction data reset successfully.",
        data: result,
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}

