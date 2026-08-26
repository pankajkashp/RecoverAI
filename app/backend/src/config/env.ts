import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repository root .env
dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});

// Also allow a local app/backend/.env if one exists
dotenv.config();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()) : ["http://localhost:3000"]
    ),
  DATABASE_URL: z.string().min(1).optional(),
  ML_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  AUTH_SECRET: z.string().min(1).optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  // Razorpay Test Mode Configuration (Optional — required only for live sandbox webhooks)
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export const environment = environmentSchema.parse(process.env);