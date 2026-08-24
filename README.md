# RecoverAI

RecoverAI is a provider-agnostic payment recovery intelligence platform. It analyzes failed payment events, determines whether a payment is worth attempting to recover, estimates the potentially recoverable amount, recommends a recovery action, and tracks the actual recovery outcome — without coupling the core engine to any specific payment provider.

## Status

**Phase 1 — Project Foundation**

The frontend shell, backend health API, database configuration boundary, theme system, shared packages, and basic testing infrastructure are in place.

Not yet implemented: payment processing, recovery intelligence, failure analysis, ML training/inference, analytics, provider integrations, or the complete database schema.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, TypeScript, Express, REST API |
| Validation | Zod |
| Database | PostgreSQL, Prisma ORM |
| ML/Data | Python, Pandas, NumPy, scikit-learn |
| ML API | FastAPI |
| Testing | Vitest (TS), Pytest (Python) |

## Architecture

```
External Provider / Synthetic Data
      ↓
Provider Adapter (integrations/)
      ↓
Canonical Payment Event (packages/contracts/)
      ↓
RecoverAI Core (app/backend/)
      ↓
ML Service API (app/ml-service/)
      ↓
Dashboard (app/frontend/)
```

See [docs/architecture.md](docs/architecture.md) for the full architecture overview.

## Project Structure

```
recoverai/
├── app/
│   ├── frontend/          Next.js application
│   ├── backend/           Express REST API
│   └── ml-service/        Python ML service (Phase 5+)
├── packages/
│   ├── shared/            Generic reusable utilities
│   ├── contracts/         Domain contracts and integration interfaces
│   └── config/            Shared configuration constants
├── database/
│   ├── prisma/            Prisma schema and configuration
│   ├── migrations/        Database migrations (Phase 2+)
│   └── seed/              Seed/demo data (Phase 2+)
├── integrations/
│   ├── demo/              Demo/sandbox adapter (Phase 3+)
│   └── providers/         Provider adapters (Phase 10+)
├── ml/
│   ├── data/              Training datasets
│   ├── features/          Feature engineering
│   ├── training/          Training pipelines
│   ├── evaluation/        Model evaluation
│   └── models/            Trained model artifacts
├── tests/
│   ├── unit/              Unit tests
│   ├── integration/       Integration tests
│   ├── e2e/               End-to-end tests
│   └── ml/                Python/ML tests
├── docs/                  Documentation
├── REQUIREMENTS.txt       Locked project specification
├── .env.example           Environment variable template
└── .gitignore
```

## Setup

### Prerequisites

- Node.js >= 18
- npm >= 9
- Python >= 3.10 (for ML service in future phases)

### Install Dependencies

```bash
npm install
```

### Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and configure your own values. The database URL is required when Prisma database commands are used (Phase 2+). In Phase 1, the backend starts without a database connection.

> **MANUAL ACTION REQUIRED — Database Setup (Phase 2+)**
>
> When you are ready for Phase 2:
> 1. Create a PostgreSQL database (local or hosted, e.g. Neon, Supabase, Railway).
> 2. Obtain your database connection URL.
> 3. Set `DATABASE_URL` in your `.env` file.
> 4. Run `npx prisma generate` from `database/prisma/`.
>
> The developer controls all external accounts, credentials, and database creation.

## Run

### Frontend (development)

```bash
npm run dev:frontend
```

Runs at [http://localhost:3000](http://localhost:3000).

### Backend (development)

```bash
npm run dev:backend
```

Runs at [http://localhost:4000](http://localhost:4000).

Health check: `GET http://localhost:4000/health` → `{ "status": "ok" }`

## Verification

```bash
npm run typecheck        # TypeScript type checking
npm run lint             # Linting
npm test                 # Run tests
npm run build            # Production build
```

## License

Private project. Not for public distribution.