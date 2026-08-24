import { describe, expect, it } from "vitest";
import { CanonicalPaymentEventSchema } from "@recoverai/contracts";

describe("Phase 3 — CanonicalPaymentEvent Validation", () => {
  it("validates a complete canonical payment event", () => {
    const validEvent = {
      externalPaymentId: "pay_test_001",
      companyId: "comp_123",
      providerId: "prov_456",
      customerReference: "cust_789",
      amount: 4999.99,
      currency: "INR",
      status: "COMPLETED",
      paymentMethod: "UPI",
      eventType: "PAYMENT_COMPLETED",
      eventTimestamp: new Date(),
      metadata: { key: "value" },
    };

    const parsed = CanonicalPaymentEventSchema.parse(validEvent);
    expect(parsed.externalPaymentId).toBe("pay_test_001");
    expect(parsed.amount).toBe(4999.99);
    expect(parsed.currency).toBe("INR");
  });

  it("coerces string amount to numeric amount", () => {
    const event = {
      externalPaymentId: "pay_test_002",
      companyId: "comp_123",
      providerId: "prov_456",
      amount: "150.00",
      currency: "USD",
      status: "PENDING",
      paymentMethod: "CARD",
      eventType: "PAYMENT_CREATED",
      eventTimestamp: "2026-08-24T10:00:00.000Z",
    };

    const parsed = CanonicalPaymentEventSchema.parse(event);
    expect(parsed.amount).toBe(150);
    expect(parsed.eventTimestamp).toBeInstanceOf(Date);
  });

  it("rejects non-positive amount", () => {
    const event = {
      externalPaymentId: "pay_test_003",
      companyId: "comp_123",
      providerId: "prov_456",
      amount: 0,
      currency: "INR",
      status: "FAILED",
      eventType: "PAYMENT_FAILED",
      eventTimestamp: new Date(),
    };

    expect(() => CanonicalPaymentEventSchema.parse(event)).toThrowError(
      /positive/
    );
  });

  it("rejects invalid status enum value", () => {
    const event = {
      externalPaymentId: "pay_test_004",
      companyId: "comp_123",
      providerId: "prov_456",
      amount: 100,
      currency: "INR",
      status: "INVALID_STATUS_VALUE",
      eventType: "PAYMENT_FAILED",
      eventTimestamp: new Date(),
    };

    expect(() => CanonicalPaymentEventSchema.parse(event)).toThrow();
  });

  it("rejects currency with invalid length", () => {
    const event = {
      externalPaymentId: "pay_test_005",
      companyId: "comp_123",
      providerId: "prov_456",
      amount: 100,
      currency: "RUPEES",
      status: "COMPLETED",
      eventType: "PAYMENT_COMPLETED",
      eventTimestamp: new Date(),
    };

    expect(() => CanonicalPaymentEventSchema.parse(event)).toThrow();
  });
});
