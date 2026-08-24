/**
 * RecoverAI — Payment Event Controller
 *
 * Phase 3: Payment Event Pipeline
 *
 * Express controller for receiving payment events via REST API.
 * Dispatches to provider adapter for normalization, then invokes the
 * core payment pipeline for validation, idempotency, and persistence.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProviderRegistry } from "@recoverai/integrations";
import { ProviderType, ProviderTypeEnum } from "@recoverai/contracts";
import { PaymentPipelineService } from "../services/payment-pipeline.service.js";

export class PaymentEventController {
  constructor(
    private readonly pipelineService: PaymentPipelineService = new PaymentPipelineService(),
    private readonly providerRegistry: ProviderRegistry = ProviderRegistry.getInstance()
  ) {}

  /**
   * POST /api/payment-events
   * Ingests a payment event from a provider adapter or direct demo source.
   */
  handleIngestEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 1. Identify Provider Type (Header or Body, defaulting to DEMO)
      const rawProviderType =
        (req.headers["x-provider-type"] as string) ||
        req.body?.providerType ||
        req.body?.provider_type ||
        "DEMO";

      const providerTypeParsed = ProviderTypeEnum.safeParse(
        String(rawProviderType).toUpperCase()
      );

      const providerType: ProviderType = providerTypeParsed.success
        ? providerTypeParsed.data
        : "DEMO";

      // 2. Resolve Provider Adapter
      const adapter = this.providerRegistry.getAdapter(providerType);

      // 3. Normalize into Canonical Payment Event
      const canonicalEvent = await adapter.normalize(req.body);

      // 4. Process Event in Core Pipeline
      const result = await this.pipelineService.processEvent(canonicalEvent);

      // 5. Return HTTP response
      const statusCode = result.isDuplicate ? 200 : 201;

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

      const customError = error as { code?: string; message?: string };
      if (
        customError.code === "COMPANY_NOT_FOUND" ||
        customError.code === "PROVIDER_NOT_FOUND"
      ) {
        res.status(404).json({
          success: false,
          error: customError.message || "Resource not found",
          code: customError.code,
        });
        return;
      }

      next(error);
    }
  };
}
