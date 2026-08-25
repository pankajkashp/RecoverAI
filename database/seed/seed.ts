/**
 * RecoverAI — Synthetic / Demo Database Seed
 *
 * Phase 2: Data Layer Foundation
 *
 * IMPORTANT:
 * All records created in this script are 100% SYNTHETIC / DEMO DATA.
 * No real customer details, card numbers, or credentials are used.
 *
 * This dataset provides test fixtures covering:
 * - Successful payments
 * - Failed payments across multiple failure categories
 * - Different payment methods & amounts
 * - Recovery assessments (predicted worthiness & amounts)
 * - Recovery recommendations
 * - Recovery attempts in various states
 * - Recovery outcomes (successful & failed)
 * - ML prediction records
 */

import dotenv from "dotenv";
import {
  PrismaClient,
  UserRole,
  ProviderType,
  PaymentStatus,
  PaymentMethod,
  EventType,
  FailureCategory,
  RecoveryWorthiness,
  RecommendationStatus,
  RecoveryAttemptStatus,
  Prisma,
} from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting RecoverAI database seed (SYNTHETIC / DEMO DATA)...");

  // 1. Clean existing demo seed data in reverse dependency order
  await prisma.recoveryOutcome.deleteMany({});
  await prisma.recoveryAttempt.deleteMany({});
  await prisma.recoveryRecommendation.deleteMany({});
  await prisma.recoveryAssessment.deleteMany({});
  await prisma.mlPrediction.deleteMany({});
  await prisma.paymentFailure.deleteMany({});
  await prisma.paymentEvent.deleteMany({});
  await prisma.provider.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});

  // 2. Create Demo Company
  const company = await prisma.company.create({
    data: {
      id: "demo_company_001",
      name: "Acme Retail Technologies (Demo)",
    },
  });
  console.log(`✓ Created demo company: ${company.name} (${company.id})`);

  // 3. Create Demo Users
  const adminUser = await prisma.user.create({
    data: {
      id: "demo_user_admin",
      companyId: company.id,
      name: "Demo Admin User",
      email: "admin@demo.recoverai.internal",
      role: UserRole.ADMIN,
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      id: "demo_user_finance",
      companyId: company.id,
      name: "Demo Finance Analyst",
      email: "finance@demo.recoverai.internal",
      role: UserRole.MEMBER,
    },
  });
  console.log(`✓ Created demo users: ${adminUser.email}, ${memberUser.email}`);

  // 4. Create Providers
  const demoProvider = await prisma.provider.create({
    data: {
      id: "provider_demo_sandbox",
      type: ProviderType.DEMO,
      name: "RecoverAI Synthetic Sandbox",
      isActive: true,
      config: { environment: "sandbox", mode: "synthetic" },
    },
  });

  const futureRazorpayProvider = await prisma.provider.create({
    data: {
      id: "provider_razorpay_placeholder",
      type: ProviderType.RAZORPAY,
      name: "Razorpay (Future Provider Boundary)",
      isActive: false,
    },
  });
  console.log(`✓ Created providers: ${demoProvider.name}, ${futureRazorpayProvider.name}`);

  // 5. Create Payment Events & Associated Records (Deterministic Synthetic Data)

  // --- Scenario 1: Successful Payment (No recovery needed) ---
  const payment1 = await prisma.paymentEvent.create({
    data: {
      id: "evt_demo_success_001",
      externalPaymentId: "pay_synth_001_success",
      companyId: company.id,
      providerId: demoProvider.id,
      customerReference: "cust_demo_101",
      amount: new Prisma.Decimal("4500.00"),
      currency: "INR",
      status: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.UPI,
      eventType: EventType.PAYMENT_COMPLETED,
      eventTimestamp: new Date("2026-08-24T06:30:00Z"),
      metadata: { source: "web_checkout", demo: true },
    },
  });
  console.log(`✓ Created scenario 1: Successful payment ${payment1.externalPaymentId}`);

  // --- Scenario 2: Failed Payment - INSUFFICIENT_FUNDS -> Recoverable -> Attempted & SUCCESSFUL ---
  const payment2 = await prisma.paymentEvent.create({
    data: {
      id: "evt_demo_failed_002",
      externalPaymentId: "pay_synth_002_insufficient",
      companyId: company.id,
      providerId: demoProvider.id,
      customerReference: "cust_demo_102",
      amount: new Prisma.Decimal("12500.00"),
      currency: "INR",
      status: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.CARD,
      eventType: EventType.PAYMENT_FAILED,
      failureCode: "INSUFFICIENT_BALANCE",
      failureMessage: "Transaction declined due to insufficient funds in account",
      eventTimestamp: new Date("2026-08-24T07:00:00Z"),
      metadata: { issuerBank: "HDFC_DEMO", cardType: "DEBIT" },
    },
  });

  await prisma.paymentFailure.create({
    data: {
      paymentEventId: payment2.id,
      category: FailureCategory.INSUFFICIENT_FUNDS,
      failureCode: "INSUFFICIENT_BALANCE",
      failureMessage: "Transaction declined due to insufficient funds in account",
      failedAt: new Date("2026-08-24T07:00:00Z"),
    },
  });

  await prisma.recoveryAssessment.create({
    data: {
      paymentEventId: payment2.id,
      worthiness: RecoveryWorthiness.RECOVER,
      estimatedRecoverableAmount: new Prisma.Decimal("12500.00"),
      confidence: 0.88,
      reasoning: "Synthetic heuristic: retry upon salary cycle or alternative payment link",
      assessedAt: new Date("2026-08-24T07:01:00Z"),
    },
  });

  await prisma.recoveryRecommendation.create({
    data: {
      paymentEventId: payment2.id,
      action: "SEND_SMART_PAYMENT_LINK",
      status: RecommendationStatus.EXECUTED,
      reason: "Customer has active engagement; send automated SMS/Email payment link with UPI option",
      confidence: 0.9,
    },
  });

  const attempt2 = await prisma.recoveryAttempt.create({
    data: {
      id: "att_demo_002",
      paymentEventId: payment2.id,
      status: RecoveryAttemptStatus.SUCCESSFUL,
      attemptedAt: new Date("2026-08-24T07:15:00Z"),
      completedAt: new Date("2026-08-24T07:22:00Z"),
    },
  });

  await prisma.recoveryOutcome.create({
    data: {
      recoveryAttemptId: attempt2.id,
      paymentEventId: payment2.id,
      outcome: RecoveryAttemptStatus.SUCCESSFUL,
      actualRecoveredAmount: new Prisma.Decimal("12500.00"),
      outcomeTimestamp: new Date("2026-08-24T07:22:00Z"),
      notes: "Demo outcome: customer completed payment via UPI recovery link",
    },
  });

  await prisma.mlPrediction.create({
    data: {
      paymentEventId: payment2.id,
      modelVersion: "v0.1.0-synthetic-baseline",
      prediction: {
        recovery_probability: 0.88,
        recommended_channel: "UPI_LINK",
        expected_recovery_amount: 12500.0,
      },
      confidence: 0.88,
    },
  });
  console.log(`✓ Created scenario 2: Recovered failure ${payment2.externalPaymentId}`);

  // --- Scenario 3: Failed Payment - AUTHENTICATION Failure -> Review -> Attempted & FAILED ---
  const payment3 = await prisma.paymentEvent.create({
    data: {
      id: "evt_demo_failed_003",
      externalPaymentId: "pay_synth_003_auth_timeout",
      companyId: company.id,
      providerId: demoProvider.id,
      customerReference: "cust_demo_103",
      amount: new Prisma.Decimal("7800.00"),
      currency: "INR",
      status: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.NETBANKING,
      eventType: EventType.PAYMENT_FAILED,
      failureCode: "OTP_EXPIRED",
      failureMessage: "User authentication timed out during OTP step",
      eventTimestamp: new Date("2026-08-24T07:30:00Z"),
      metadata: { bank: "SBI_DEMO" },
    },
  });

  await prisma.paymentFailure.create({
    data: {
      paymentEventId: payment3.id,
      category: FailureCategory.AUTHENTICATION,
      failureCode: "OTP_EXPIRED",
      failureMessage: "User authentication timed out during OTP step",
      failedAt: new Date("2026-08-24T07:30:00Z"),
    },
  });

  await prisma.recoveryAssessment.create({
    data: {
      paymentEventId: payment3.id,
      worthiness: RecoveryWorthiness.REVIEW,
      estimatedRecoverableAmount: new Prisma.Decimal("7800.00"),
      confidence: 0.65,
      reasoning: "Authentication drop-off; customer may re-attempt voluntarily or need reminder",
      assessedAt: new Date("2026-08-24T07:31:00Z"),
    },
  });

  await prisma.recoveryRecommendation.create({
    data: {
      paymentEventId: payment3.id,
      action: "TRIGGER_CHECKOUT_REENGAGEMENT",
      status: RecommendationStatus.EXECUTED,
      reason: "Send WhatsApp checkout reminder",
      confidence: 0.7,
    },
  });

  const attempt3 = await prisma.recoveryAttempt.create({
    data: {
      id: "att_demo_003",
      paymentEventId: payment3.id,
      status: RecoveryAttemptStatus.FAILED,
      attemptedAt: new Date("2026-08-24T07:35:00Z"),
      completedAt: new Date("2026-08-24T07:50:00Z"),
    },
  });

  await prisma.recoveryOutcome.create({
    data: {
      recoveryAttemptId: attempt3.id,
      paymentEventId: payment3.id,
      outcome: RecoveryAttemptStatus.FAILED,
      actualRecoveredAmount: new Prisma.Decimal("0.00"),
      outcomeTimestamp: new Date("2026-08-24T07:50:00Z"),
      notes: "Demo outcome: customer did not respond to reminder link before expiry",
    },
  });
  console.log(`✓ Created scenario 3: Failed recovery outcome ${payment3.externalPaymentId}`);

  // --- Scenario 4: Failed Payment - TEMPORARY / NETWORK Failure -> Worthiness: RECOVER -> State: RECOMMENDED ---
  const payment4 = await prisma.paymentEvent.create({
    data: {
      id: "evt_demo_failed_004",
      externalPaymentId: "pay_synth_004_network_glitch",
      companyId: company.id,
      providerId: demoProvider.id,
      customerReference: "cust_demo_104",
      amount: new Prisma.Decimal("2499.00"),
      currency: "INR",
      status: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.UPI,
      eventType: EventType.PAYMENT_FAILED,
      failureCode: "PSP_TIMEOUT",
      failureMessage: "Bank switch response timed out",
      eventTimestamp: new Date("2026-08-24T08:00:00Z"),
      metadata: { psp: "DEMO_UPI_SWITCH" },
    },
  });

  await prisma.paymentFailure.create({
    data: {
      paymentEventId: payment4.id,
      category: FailureCategory.NETWORK,
      failureCode: "PSP_TIMEOUT",
      failureMessage: "Bank switch response timed out",
      failedAt: new Date("2026-08-24T08:00:00Z"),
    },
  });

  await prisma.recoveryAssessment.create({
    data: {
      paymentEventId: payment4.id,
      worthiness: RecoveryWorthiness.RECOVER,
      estimatedRecoverableAmount: new Prisma.Decimal("2499.00"),
      confidence: 0.94,
      reasoning: "Transient network timeout has high recovery probability upon retry",
      assessedAt: new Date("2026-08-24T08:01:00Z"),
    },
  });

  await prisma.recoveryRecommendation.create({
    data: {
      paymentEventId: payment4.id,
      action: "AUTO_RETRY_TRANSIENT",
      status: RecommendationStatus.PENDING,
      reason: "Automated retry recommended with 5-minute backoff",
      confidence: 0.95,
    },
  });

  await prisma.recoveryAttempt.create({
    data: {
      id: "att_demo_004",
      paymentEventId: payment4.id,
      status: RecoveryAttemptStatus.RECOMMENDED,
    },
  });
  console.log(`✓ Created scenario 4: Pending recommendation ${payment4.externalPaymentId}`);

  // --- Scenario 5: Failed Payment - FRAUD/DO_NOT_RECOVER ---
  const payment5 = await prisma.paymentEvent.create({
    data: {
      id: "evt_demo_failed_005",
      externalPaymentId: "pay_synth_005_lost_card",
      companyId: company.id,
      providerId: demoProvider.id,
      customerReference: "cust_demo_105",
      amount: new Prisma.Decimal("55000.00"),
      currency: "INR",
      status: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.CARD,
      eventType: EventType.PAYMENT_FAILED,
      failureCode: "PICKUP_CARD",
      failureMessage: "Card reported lost or stolen by issuing authority",
      eventTimestamp: new Date("2026-08-24T08:10:00Z"),
    },
  });

  await prisma.paymentFailure.create({
    data: {
      paymentEventId: payment5.id,
      category: FailureCategory.CARD,
      failureCode: "PICKUP_CARD",
      failureMessage: "Card reported lost or stolen by issuing authority",
      failedAt: new Date("2026-08-24T08:10:00Z"),
    },
  });

  await prisma.recoveryAssessment.create({
    data: {
      paymentEventId: payment5.id,
      worthiness: RecoveryWorthiness.DO_NOT_RECOVER,
      estimatedRecoverableAmount: new Prisma.Decimal("0.00"),
      confidence: 0.99,
      reasoning: "Card is invalidated; auto-recovery attempts prohibited to avoid chargebacks",
      assessedAt: new Date("2026-08-24T08:11:00Z"),
    },
  });
  console.log(`✓ Created scenario 5: Do-not-recover payment ${payment5.externalPaymentId}`);

  console.log("✅ Synthetic seed complete. All demo data initialized successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
