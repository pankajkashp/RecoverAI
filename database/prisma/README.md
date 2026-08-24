# RecoverAI Database (Prisma)

Phase 2 — Data Layer Foundation.

## Structure

- `schema.prisma`: Core database models, enums, indexes, foreign keys, and idempotency constraints.
- `migrations/`: Prisma migration SQL history.
- `../seed/seed.ts`: Deterministic synthetic/demo dataset seeder.

## Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Apply pending migrations (development)
npm run prisma:migrate

# Apply migrations (production / CI)
npm run prisma:deploy

# Seed synthetic demo dataset
npm run prisma:seed
```