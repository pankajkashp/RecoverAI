# RecoverAI — Architecture Overview

## System Architecture

```
Client (Browser)
      ↓
Next.js Frontend
      ↓
Backend REST API (Express / Node.js)
      ↓
Application Services
      ↓
RecoverAI Core
├── Payment Processing (Phase 3+)
├── Failure Analysis (Phase 4+)
├── Recovery Intelligence (Phase 4+)
└── Outcome Tracking (Phase 7+)
      ↓
PostgreSQL (via Prisma)
```

## Provider Integration

```
External Provider (Razorpay / Stripe / etc.)
      ↓
Provider Adapter (integrations/providers/)
      ↓
Canonical Payment Event (packages/contracts/)
      ↓
RecoverAI Core
```

## ML Service

```
RecoverAI Backend
      ↓
ML Service API (FastAPI)
      ↓
Python ML Service (app/ml-service/)
      ↓
Trained Model (ml/models/)
      ↓
Prediction
      ↓
RecoverAI Backend
```

## Package Boundaries

| Package | Responsibility |
|---------|---------------|
| `packages/shared` | Generic reusable utilities (not domain-specific) |
| `packages/contracts` | Domain contracts, canonical payment event types, integration interfaces |
| `packages/config` | Shared configuration constants |

## Key Principles

- Provider-agnostic core: the engine operates on canonical events, not provider-specific objects
- ML behind a service boundary: the core does not depend on Python implementation details
- Shared contracts: integrations and the core communicate through well-defined types
- Phase-by-phase: each phase is completed and validated before the next begins
