-- Phase 7: Update default status for recovery_recommendations to RECOMMENDED.
-- This runs after 20260825140000_add_recommended_status has been committed,
-- which satisfies PostgreSQL's requirement that the new enum value is available.

ALTER TABLE "recovery_recommendations"
  ALTER COLUMN "status" SET DEFAULT 'RECOMMENDED'::"RecommendationStatus";
