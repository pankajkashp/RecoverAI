import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { environment } from "./config/env.js";
import { createPaymentEventRouter } from "./routes/payment-event.routes.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: environment.FRONTEND_URL }));
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  // Phase 3: Payment Event Ingestion Pipeline API
  app.use("/api/payment-events", createPaymentEventRouter());

  // Centralized Error Handler (safe production responses, no credential leaks)
  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next
  ) => {
    console.error("Internal Server Error:", error);
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}