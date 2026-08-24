# Provider Adapters

This directory will contain payment provider adapters (e.g. Razorpay, Stripe).

Each adapter maps provider-specific events into the RecoverAI canonical payment event format.

## Architecture

```
External Provider (Razorpay / Stripe / etc.)
      ↓
Provider Adapter
      ↓
Canonical Payment Event
      ↓
RecoverAI Core
```

## Status

Phase 1 — directory boundary established. No provider adapters implemented.
