import { PrismaClient } from "@prisma/client";

// Singleton Prisma Client instance for the backend service
export const prisma = new PrismaClient();
