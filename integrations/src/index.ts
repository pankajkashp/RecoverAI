/**
 * @recoverai/integrations
 *
 * Payment provider integration adapters for RecoverAI.
 * Isolates provider SDKs and data formats behind the IProviderAdapter boundary.
 */

export * from "./demo/demo-adapter.js";
export * from "./demo/demo-recovery-adapter.js";
export * from "./razorpay/razorpay-schemas.js";
export * from "./razorpay/razorpay-adapter.js";
export * from "./razorpay/razorpay-recovery-adapter.js";
export * from "./providers/provider-registry.js";
