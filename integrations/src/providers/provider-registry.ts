/**
 * RecoverAI — Provider Adapter Registry
 *
 * Phase 3: Payment Event Pipeline
 *
 * Allows dynamic registration and retrieval of provider adapters.
 * Ensures the core engine remains strictly provider-agnostic.
 */

import { IProviderAdapter, ProviderType } from "@recoverai/contracts";
import { DemoAdapter } from "../demo/demo-adapter.js";
import { RazorpayProviderAdapter } from "../razorpay/razorpay-adapter.js";

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private adapters: Map<ProviderType, IProviderAdapter> = new Map();

  private constructor() {
    // Automatically register default built-in adapters
    this.register(new DemoAdapter());
    this.register(new RazorpayProviderAdapter());
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a new or custom provider adapter.
   */
  public register(adapter: IProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  /**
   * Look up an adapter by provider type.
   * Throws an error if no adapter is registered for the specified type.
   */
  public getAdapter(type: ProviderType): IProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(
        `No provider adapter registered for provider type: '${type}'. Supported types: ${Array.from(
          this.adapters.keys()
        ).join(", ")}`
      );
    }
    return adapter;
  }

  /**
   * Check whether an adapter is registered for a provider type.
   */
  public hasAdapter(type: ProviderType): boolean {
    return this.adapters.has(type);
  }
}
