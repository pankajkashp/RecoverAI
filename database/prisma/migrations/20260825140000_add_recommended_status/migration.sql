-- Phase 7: Add RECOMMENDED value to RecommendationStatus enum
-- PostgreSQL requires ALTER TYPE ADD VALUE to be committed before the new value
-- can be used in the same session. We split this into two transactions.

-- Transaction 1: Add enum value (cannot be inside explicit transaction block)
ALTER TYPE "RecommendationStatus" ADD VALUE IF NOT EXISTS 'RECOMMENDED' BEFORE 'PENDING';
