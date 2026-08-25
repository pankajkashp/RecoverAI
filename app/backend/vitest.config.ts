import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (two levels up from app/backend)
config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    testTimeout: 35000,
    hookTimeout: 35000,
    fileParallelism: false,
    env: {
      // Ensure DATABASE_URL is available inside vitest workers
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
  },
});
