import { describe, expect, it, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

describe("Phase 3 — Ingestion REST API (POST /api/payment-events)", () => {
  const testExternalId = `pay_api_test_${Date.now()}`;

  afterAll(async () => {
    // Cleanup test records in FK-safe order:
    // recommendation → assessment → failure → event
    await prisma.recoveryRecommendation.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_api_test_" },
        },
      },
    });
    await prisma.recoveryAssessment.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_api_test_" },
        },
      },
    });
    await prisma.paymentFailure.deleteMany({
      where: {
        paymentEvent: {
          externalPaymentId: { startsWith: "pay_api_test_" },
        },
      },
    });
    await prisma.paymentEvent.deleteMany({
      where: {
        externalPaymentId: { startsWith: "pay_api_test_" },
      },
    });
    await prisma.$disconnect();
  });

  it("returns 201 Created for a new valid demo payment event", async () => {
    const payload = {
      external_payment_id: testExternalId,
      company_id: "demo_company_001",
      provider_id: "provider_demo_sandbox",
      customer_reference: "cust_api_test_01",
      amount: 1850.0,
      currency: "INR",
      status: "FAILED",
      payment_method: "CARD",
      event_type: "PAYMENT_FAILED",
      failure_code: "AUTHENTICATION_FAILED",
      failure_message: "3D Secure verification failed",
      failure_category: "AUTHENTICATION",
    };

    const response = await request(app)
      .post("/api/payment-events")
      .set("x-provider-type", "DEMO")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("CREATED");
    expect(response.body.data.isDuplicate).toBe(false);
    expect(response.body.data.externalPaymentId).toBe(testExternalId);
    expect(response.body.data.paymentEventId).toBeDefined();
  });

  it("returns 200 OK with isDuplicate: true for duplicate payment event (idempotency)", async () => {
    const payload = {
      external_payment_id: testExternalId,
      company_id: "demo_company_001",
      provider_id: "provider_demo_sandbox",
      amount: 1850.0,
      currency: "INR",
      status: "FAILED",
    };

    const response = await request(app)
      .post("/api/payment-events")
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("DUPLICATE");
    expect(response.body.data.isDuplicate).toBe(true);
    expect(response.body.data.externalPaymentId).toBe(testExternalId);
  });

  it("returns 400 Bad Request when required fields are missing", async () => {
    const invalidPayload = {
      amount: 500,
      // Missing external_payment_id and company_id
    };

    const response = await request(app)
      .post("/api/payment-events")
      .send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Validation failed");
    expect(response.body.details).toBeDefined();
  });

  it("returns 404 Not Found when company does not exist", async () => {
    const payloadWithInvalidCompany = {
      external_payment_id: `pay_api_test_notfound_${Date.now()}`,
      company_id: "non_existent_company_000000",
      amount: 100.0,
      currency: "INR",
      status: "COMPLETED",
    };

    const response = await request(app)
      .post("/api/payment-events")
      .send(payloadWithInvalidCompany);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe("COMPANY_NOT_FOUND");
  });

  it("confirms GET /health continues to operate as expected", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
