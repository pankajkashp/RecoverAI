import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { environment } from "./config/env.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: environment.FRONTEND_URL }));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  const errorHandler: ErrorRequestHandler = (_error, _request, response, _next) => {
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}