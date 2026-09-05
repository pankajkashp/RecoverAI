import { describe, expect, it } from "vitest";
import { DemoAdapter, ProviderRegistry } from "@recoverai/integrations";

describe("Phase 3 — DemoAdapter & ProviderRegistry", () => {
  const adapter = new DemoAdapter();

  it("normalizes a valid snake_case demo payment event", () => {
    const rawDemoEvent = {
      external_payment_id: "pay_synth_test_001",
      company_id: "demo_company_001",
      provider_id: "provider_demo_sandbox",
      customer_reference: "cust_demo_999",
      amount: 2500.5,
      currency: "INR",
      status: "FAILED",
      payment_method: "CARD",
      event_type: "PAYMENT_FAILED",
      failure_code: "INSUFFICIENT_FUNDS",
      failure_message: "Balance insufficient",
      timestamp: "2026-08-24T12:00:00Z",
      metadata: { orderId: "ord_123" },
    };

    const canonical = adapter.normalize(rawDemoEvent);

    expect(canonical.externalPaymentId).toBe("pay_synth_test_001");
    expect(canonical.companyId).toBe("demo_company_001");
    expect(canonical.providerId).toBe("provider_demo_sandbox");
    expect(canonical.amount).toBe(2500.5);
    expect(canonical.currency).toBe("INR");
    expect(canonical.status).toBe("FAILED");
    expect(canonical.paymentMethod).toBe("CARD");
    expect(canonical.eventType).toBe("PAYMENT_FAILED");
    expect(canonical.failureCode).toBe("INSUFFICIENT_FUNDS");
    expect(canonical.failureMessage).toBe("Balance insufficient");
    expect(canonical.metadata?.is_demo_synthetic).toBe(true);
    expect(canonical.eventTimestamp).toBeInstanceOf(Date);
  });

  it("normalizes a camelCase demo payment event with default fallback values", () => {
    const rawDemoEvent = {
      externalPaymentId: "pay_synth_test_002",
      companyId: "demo_company_001",
      amount: 1000,
      currency: "inr",
      status: "COMPLETED",
    };

    const canonical = adapter.normalize(rawDemoEvent);

    expect(canonical.externalPaymentId).toBe("pay_synth_test_002");
    expect(canonical.companyId).toBe("demo_company_001");
    expect(canonical.providerId).toBe("provider_demo_sandbox");
    expect(canonical.currency).toBe("INR");
    expect(canonical.status).toBe("COMPLETED");
    expect(canonical.paymentMethod).toBe("OTHER");
    expect(canonical.eventType).toBe("PAYMENT_COMPLETED");
  });

  it("throws a validation error when external payment ID is missing", () => {
    expect(() =>
      adapter.normalize({
        company_id: "demo_company_001",
        amount: 500,
      })
    ).toThrow();
  });

  it("allows normalizing when company ID is omitted in single-business mode", () => {
    const normalized = adapter.normalize({
      external_payment_id: "pay_123",
      amount: 500,
    });
    expect(normalized.externalPaymentId).toBe("pay_123");
    expect(normalized.amount).toBe(500);
  });

  it("throws a validation error when amount is non-positive", () => {
    expect(() =>
      adapter.normalize({
        external_payment_id: "pay_123",
        company_id: "demo_company_001",
        amount: -50,
      })
    ).toThrow();
  });

  it("resolves the demo adapter via ProviderRegistry", () => {
    const registry = ProviderRegistry.getInstance();
    const resolvedAdapter = registry.getAdapter("DEMO");
    expect(resolvedAdapter).toBeDefined();
    expect(resolvedAdapter.providerType).toBe("DEMO");
  });

  it("throws an error when resolving an unregistered provider type", () => {
    const registry = ProviderRegistry.getInstance();
    expect(() => registry.getAdapter("OTHER")).toThrowError(
      /No provider adapter registered/
    );
  });
});
