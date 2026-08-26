import cors from "cors";
import express from "express";
import { environment } from "./config/env.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.middleware.js";
import { requestCorrelationMiddleware } from "./middleware/request-correlation.middleware.js";
import { tenantContextMiddleware } from "./middleware/tenant-context.middleware.js";
import { createRateLimiter } from "./middleware/rate-limiter.middleware.js";
import { errorHandlerMiddleware } from "./middleware/error-handler.middleware.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createPaymentEventRouter } from "./routes/payment-event.routes.js";
import { createRecoveryAttemptRouter } from "./routes/recovery-attempt.routes.js";
import { createDashboardRouter } from "./routes/dashboard.routes.js";
import { createWebhookRouter } from "./routes/webhook.routes.js";

export function createApp() {
  const app = express();

  // 1. Security Headers & Server Hardening
  app.use(securityHeadersMiddleware);

  // 2. Request Correlation & Structured Logging
  app.use(requestCorrelationMiddleware);

  // 3. Strict CORS Origin Policy
  app.use(
    cors({
      origin: environment.ALLOWED_ORIGINS,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-Test-Rate-Limit",
      ],
      exposedHeaders: ["X-Request-ID", "Retry-After"],
      credentials: true,
    })
  );

  // 4. Payload Size Limit Protection with Raw Body Capture for Signature Verification
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );

  // 5. Health & Readiness Probes (Unauthenticated, fast liveness)
  app.use("/", createHealthRouter());

  // 6. Tenant Context & Multi-Tenant Isolation
  app.use(tenantContextMiddleware);

  // 7. Rate-Limiting Protection for High-Impact Endpoints
  const mutationRateLimiter = createRateLimiter();

  // 8. API Routes
  app.use(
    "/api/payment-events",
    mutationRateLimiter,
    createPaymentEventRouter()
  );
  app.use(
    "/api/recovery-attempts",
    mutationRateLimiter,
    createRecoveryAttemptRouter()
  );
  app.use("/api/dashboard", createDashboardRouter());
  app.use("/api/webhooks", mutationRateLimiter, createWebhookRouter());

  // 9. Centralized Error Handler (No stack traces or secrets leaked)
  app.use(errorHandlerMiddleware);

  return app;
}