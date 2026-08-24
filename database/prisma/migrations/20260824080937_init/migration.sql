-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('DEMO', 'RAZORPAY', 'STRIPE', 'PAYPAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'UPI', 'NETBANKING', 'WALLET', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PAYMENT_CREATED', 'PAYMENT_AUTHORIZED', 'PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'OTHER');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('AUTHENTICATION', 'INSUFFICIENT_FUNDS', 'NETWORK', 'BANK', 'CARD', 'PROVIDER', 'CUSTOMER_ACTION_REQUIRED', 'TEMPORARY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecoveryWorthiness" AS ENUM ('RECOVER', 'DO_NOT_RECOVER', 'REVIEW');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXECUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RecoveryAttemptStatus" AS ENUM ('NOT_ATTEMPTED', 'RECOMMENDED', 'ATTEMPTED', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "external_payment_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "customer_reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
    "event_type" "EventType" NOT NULL,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_failures" (
    "id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "category" "FailureCategory" NOT NULL DEFAULT 'UNKNOWN',
    "failure_code" TEXT,
    "failure_message" TEXT,
    "failed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_assessments" (
    "id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "worthiness" "RecoveryWorthiness" NOT NULL,
    "estimated_recoverable_amount" DECIMAL(12,2),
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_recommendations" (
    "id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_attempts" (
    "id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "status" "RecoveryAttemptStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
    "attempted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_outcomes" (
    "id" TEXT NOT NULL,
    "recovery_attempt_id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "outcome" "RecoveryAttemptStatus" NOT NULL,
    "actual_recovered_amount" DECIMAL(12,2),
    "outcome_timestamp" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_predictions" (
    "id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "prediction" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "payment_events_company_id_idx" ON "payment_events"("company_id");

-- CreateIndex
CREATE INDEX "payment_events_status_idx" ON "payment_events"("status");

-- CreateIndex
CREATE INDEX "payment_events_provider_id_idx" ON "payment_events"("provider_id");

-- CreateIndex
CREATE INDEX "payment_events_external_payment_id_idx" ON "payment_events"("external_payment_id");

-- CreateIndex
CREATE INDEX "payment_events_event_timestamp_idx" ON "payment_events"("event_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_id_external_payment_id_company_id_key" ON "payment_events"("provider_id", "external_payment_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_failures_payment_event_id_key" ON "payment_failures"("payment_event_id");

-- CreateIndex
CREATE INDEX "payment_failures_category_idx" ON "payment_failures"("category");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_assessments_payment_event_id_key" ON "recovery_assessments"("payment_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_recommendations_payment_event_id_key" ON "recovery_recommendations"("payment_event_id");

-- CreateIndex
CREATE INDEX "recovery_attempts_payment_event_id_idx" ON "recovery_attempts"("payment_event_id");

-- CreateIndex
CREATE INDEX "recovery_attempts_status_idx" ON "recovery_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_outcomes_recovery_attempt_id_key" ON "recovery_outcomes"("recovery_attempt_id");

-- CreateIndex
CREATE INDEX "recovery_outcomes_payment_event_id_idx" ON "recovery_outcomes"("payment_event_id");

-- CreateIndex
CREATE INDEX "recovery_outcomes_outcome_idx" ON "recovery_outcomes"("outcome");

-- CreateIndex
CREATE INDEX "ml_predictions_payment_event_id_idx" ON "ml_predictions"("payment_event_id");

-- CreateIndex
CREATE INDEX "ml_predictions_model_version_idx" ON "ml_predictions"("model_version");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_failures" ADD CONSTRAINT "payment_failures_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_assessments" ADD CONSTRAINT "recovery_assessments_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_recommendations" ADD CONSTRAINT "recovery_recommendations_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_attempts" ADD CONSTRAINT "recovery_attempts_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_outcomes" ADD CONSTRAINT "recovery_outcomes_recovery_attempt_id_fkey" FOREIGN KEY ("recovery_attempt_id") REFERENCES "recovery_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_predictions" ADD CONSTRAINT "ml_predictions_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
