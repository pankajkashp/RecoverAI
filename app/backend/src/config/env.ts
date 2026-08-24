import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  ML_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  AUTH_SECRET: z.string().min(1).optional()
});

export const environment = environmentSchema.parse(process.env);