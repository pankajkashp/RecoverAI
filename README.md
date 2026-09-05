# RecoverAI

> **Turn failed payments into recoverable revenue.**

RecoverAI is an autonomous, safety-first payment recovery intelligence platform that intercepts transaction failures, classifies their root causes, and executes targeted recovery strategies. By combining deterministic safety guardrails with machine learning probability scoring, RecoverAI prevents unsafe retries on permanent declines while recovering lost revenue from transient gateway drops, bank timeouts, and insufficient funds.

---

## The Problem

Payment failures are among the largest sources of revenue leakage in digital commerce:

- **Direct Revenue Loss:** Billions of dollars in valid transactions are abandoned annually due to transient payment gateway timeouts, network spikes, and temporary issuer declines.
- **The Danger of Blind Retries:** Retrying every failed payment blindly leads to gateway retry penalties, fraud triggers, issuer blocking, and customer dissatisfaction on lost or stolen cards.
- **Passive Reporting Leaves Money on the Table:** Traditional dashboards simply log failed transactions without providing actionable, intelligent recovery workflows.
- **Lack of Decision Transparency:** Engineering and finance teams require explainable, auditable recovery reasoning before triggering automated payment attempts or contacting customers.

---

## The Solution

RecoverAI replaces static error logging with an **active recovery pipeline** governed by a five-stage lifecycle:

$$\text{Detect} \longrightarrow \text{Analyze} \longrightarrow \text{Decide} \longrightarrow \text{Recover} \longrightarrow \text{Verify}$$

1. **Detect:** Real-time ingestion of payment webhooks via cryptographic signature verification.
2. **Analyze:** Standardized failure classification into actionable categories (e.g., `INSUFFICIENT_FUNDS`, `NETWORK`, `CARD`, `BANK`, `AUTHENTICATION`).
3. **Decide:** Deterministic rule evaluation enforcing hard safety boundaries, supported by machine learning scoring for ambiguous failures.
4. **Recover:** Automated creation and dispatch of Razorpay recovery payment links for eligible failures.
5. **Verify:** Webhook-backed confirmation ensuring only authoritative, settled recoveries are counted as recovered revenue.

---

## How It Works

```mermaid
flowchart TD
    A[Customer Checkout] -->|Payment Fails| B[Razorpay Gateway]
    B -->|Webhook: payment.failed| C[Webhook Ingestion & Signature Verification]
    C --> D[Payment Pipeline Service]
    D --> E[Failure Analysis Service]
    E -->|Normalized Category| F[Recovery Intelligence Engine]
    
    F -->|Hard Safety Rule: Permanent/Stolen| G[DO_NOT_RECOVER]
    F -->|Hard Rule: 3DS / OTP Drop| H[CUSTOMER_ACTION_REQUIRED]
    F -->|Deterministic Transient Drop| I[RECOVER: Retry Payment]
    F -->|Ambiguous Failure| J[FastAPI ML Service /predict]
    
    J -->|Recovery Probability >= 65%| I
    J -->|Recovery Probability < 65%| K[REVIEW: Manual Audit]
    
    I --> L[Recovery Execution: Create Razorpay Payment Link]
    L --> M[Customer Completes Recovery Payment]
    M --> N[Razorpay Webhook: payment.captured]
    N --> O[Recovery Confirmation & Outcome Verification]
    O --> P[Live Dashboard Update via SSE]
```

---

## Architecture

RecoverAI is built with a modular, decoupled TypeScript and Python architecture:

| Subsystem | Technology Stack | Responsibility |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, Vanilla CSS | Real-time analytics dashboard, interactive audit ledger, date range filtering, and recovery execution modal. |
| **Backend API** | Node.js (Express v5), TypeScript, Zod | Webhook ingestion, deterministic decision pipeline, business transaction grouping, authentication, and SSE broadcast. |
| **Database Layer** | PostgreSQL (Neon Serverless), Prisma ORM | ACID transactional ledger, idempotency deduplication, and lifecycle status persistence. |
| **ML Service** | Python 3.13, FastAPI, scikit-learn, Uvicorn | High-throughput probability scoring microservice for ambiguous failure recovery estimation. |
| **Payment Gateway** | Razorpay Node SDK / Webhooks | HMAC SHA-256 signature verification, payment ingestion, and recovery payment link generation. |
| **Live Updates** | Server-Sent Events (SSE) | Event-driven, low-latency UI refresh upon webhook ingestion and recovery confirmation. |

---

## Payment & Transaction Model

To avoid inflating business revenue when a customer attempts payment multiple times, RecoverAI establishes a strict relational hierarchy:

$$\text{BusinessTransaction (Order / Cart)} \longrightarrow \text{PaymentEvent (Payment Attempt)} \longrightarrow \text{RecoveryAttempt} \longrightarrow \text{RecoveryOutcome}$$

- **`BusinessTransaction`:** Represents the unique business order or checkout session. Tracks gross financial volume and overall status (`PENDING`, `FAILED`, `SUCCESSFUL`, `RECOVERED`).
- **`PaymentEvent`:** Represents an individual payment attempt from a gateway (e.g. `pay_ABC123`). Multiple failed attempts link to the same business transaction.
- **`RecoveryAttempt`:** Represents an automated or merchant-triggered recovery action (e.g., creating a Razorpay Payment Link).
- **`RecoveryOutcome`:** Stores the authoritative final result (`SUCCESSFUL` or `FAILED`) and records the verified `actualRecoveredAmount`.

---

## Recovery Intelligence

RecoverAI implements a **safety-first hybrid intelligence engine** where deterministic rules enforce absolute boundaries, and machine learning acts as an opportunistic supporting signal.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Incoming Failure Event                 │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │          Deterministic Safety Boundary Rules           │
                  └─────┬─────────────────────┬──────────────────────┬─────┘
                        │                     │                      │
         Permanent Card/Bank Decline   Transient Error        Ambiguous / Unknown
                        │                     │                      │
                        ▼                     ▼                      ▼
                 DO_NOT_RECOVER         RETRY_PAYMENT           Query ML Service
                 (ML Bypassed)          (ML Bypassed)                │
                                                                     ▼
                                                        Recovery Probability >= 65%?
                                                               ├── Yes ──► RETRY_PAYMENT
                                                               └── No  ──► REVIEW
```

### Deterministic Safety Rules (Absolute Priority)

1. **Permanent Decline Guardrail:** Failures classified as `CARD` (lost, stolen, invalid, expired) or `BANK` (account closed/blocked) are immediately mapped to `DO_NOT_RECOVER`. ML is **never** invoked and cannot trigger an unsafe retry.
2. **Customer Action Guardrail:** Failures classified as `AUTHENTICATION` (3D Secure, OTP dropped) or `CUSTOMER_ACTION_REQUIRED` are mapped to `CUSTOMER_ACTION_REQUIRED`. Automated headless retries are blocked.
3. **Transient Failure Recovery:** Failures classified as `INSUFFICIENT_FUNDS`, `NETWORK`, `PROVIDER`, or `TEMPORARY` are deterministically recommended for `RETRY_PAYMENT`. ML cannot veto a known good retry.
4. **Ambiguous Evaluation:** Only unclassified or `UNKNOWN` failures query the machine learning model.

---

## Recovery Methods

RecoverAI supports four distinct recovery strategies based on the intelligence assessment:

| Action | When Applied | Action Executed |
| :--- | :--- | :--- |
| **`RETRY_PAYMENT`** | Transient drops (`INSUFFICIENT_FUNDS`, `NETWORK`, `PROVIDER`) or ML probability $\ge 0.65$. | Generates a live Razorpay Recovery Payment Link with automated attribution tracking. |
| **`CUSTOMER_ACTION_REQUIRED`** | Authentication failures (`OTP`, `3D-Secure`) or customer credential updates. | Flags transaction for customer re-engagement without automated retry fees. |
| **`REVIEW`** | Unrecognized error codes or ML probability $< 0.65$. | Defers recovery pending operational risk and compliance review. |
| **`DO_NOT_RECOVER`** | Permanent card invalidation, stolen cards, or closed accounts. | Permanently blocks recovery to protect gateway reputation and avoid chargeback fees. |

---

## Machine Learning

RecoverAI includes a dedicated Python FastAPI inference microservice utilizing an offline-trained `scikit-learn` pipeline.

### Model Architecture
- **Algorithm:** `LogisticRegression` with $L_2$ penalty (`C=1.0`, `solver="lbfgs"`, `max_iter=1000`)
- **Pipeline:** Custom feature preparer + `ColumnTransformer` (`StandardScaler` for numerical, `OneHotEncoder` for categorical)
- **Artifact:** [ml/models/recovery_success_v1.joblib](file:///Users/pankaj/Desktop/RecoverAi/ml/models/recovery_success_v1.joblib) (4.7 KB)
- **Dataset:** 5,000 synthetic payment recovery records ([synthetic_payment_recovery_dataset.csv](file:///Users/pankaj/Desktop/RecoverAi/ml/data/raw/synthetic_payment_recovery_dataset.csv))

### Exact Feature Set (8 Features)
1. `amount`: Monetary transaction amount (transformed via $\ln(1 + \text{amount})$ and standardized).
2. `currency`: ISO 3-letter currency code (`INR`, `USD`).
3. `payment_method`: Instrument method (`UPI`, `CARD`, `NETBANKING`, `WALLET`, `OTHER`).
4. `failure_category`: Normalized failure category.
5. `failure_classification`: Temporal classification (`TEMPORARY`, `PERMANENT`, `UNKNOWN`).
6. `provider_type`: Gateway identifier (`RAZORPAY`, `STRIPE`, `DEMO`, `OTHER`).
7. `event_hour`: UTC hour of the event ($0$–$23$).
8. `day_of_week`: Day of week ($0$ = Monday, $6$ = Sunday).

---

## ML Evaluation

The model was evaluated using a 70% Train (3,500 samples), 15% Validation (750 samples), and 15% Test (750 samples) stratified split:

| Evaluation Metric | Validation Set (750 samples) | Isolated Test Set (750 samples) |
| :--- | :--- | :--- |
| **Accuracy** | **69.20%** | **71.60%** |
| **Precision** | **69.92%** | **71.43%** |
| **Recall** | **89.62%** | **91.30%** |
| **F1-Score** | **78.55%** | **80.15%** |
| **ROC-AUC** | **69.54%** | **68.59%** |

> [!NOTE]
> **Evaluation Scope:** These metrics reflect performance on a calibrated synthetic development benchmark. Real-world production accuracy on live merchant payment traffic has not yet been established.

---

## Recovery Execution & Verification

RecoverAI strictly separates **estimated forecasts** from **actual verified revenue**:

```
Recovery Recommended
        │
        ▼
Recovery Execution ──► Creates Razorpay Payment Link (plink_...)
        │
        ▼
Customer Pays via Recovery Link
        │
        ▼
Razorpay Webhook: payment.captured (notes: { recoveryAttemptId: "..." })
        │
        ▼
Backend Confirms Match ──► Sets RecoveryOutcome(outcome: "SUCCESSFUL")
        │
        ▼
Authoritative Ledger Entry ──► actualRecoveredAmount recorded
```

- **Estimated Recoverable Amount:** The theoretical amount expected to be recovered from qualified failures.
- **Actual Recovered Amount:** Summed exclusively from confirmed, settled `RecoveryOutcome` records with `outcome = "SUCCESSFUL"`. Unpaid links and recommendations are **never** counted as revenue.

---

## Dashboard

The RecoverAI dashboard provides real-time visibility into the financial conversion funnel:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOTAL PAYMENTS   │  POTENTIALLY RECOVERABLE   │    EXPECTED RECOVERY     │   ACTUALLY RECOVERED     │
│       10          │        ₹25,000.00          │        ₹20,000.00        │       ₹18,000.00         │
│  4 failed (40.0%) │  (Qualified Failure Pool)  │  (ML + Rule Forecast)    │  (72.0% Realized Rate)   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Metrics
- **Total Payments / Failed Payments / Successful Payments:** Canonical event attempt counters.
- **Failure Rate (%):** Percentage of total payment attempts that failed.
- **Total Payment Value:** Unique gross merchandise value derived from `BusinessTransaction`.
- **Potentially Recoverable Amount:** Denominator pool of failed transactions receiving a `RECOVER` assessment.
- **Estimated Recoverable Amount:** Financial forecast across all generated recovery recommendations.
- **Actual Recovered Amount:** Authoritative settled revenue from confirmed recovery webhooks.
- **Recovery Rate (%):** Realized recovery efficiency ($\frac{\text{Actual Recovered}}{\text{Potentially Recoverable}} \times 100$).
- **Lifecycle Distributions:** Categorical failure root-cause breakdown and stage progression chart.
- **Date Range Presets:** Global filtering across `All Time`, `Last 7 Days`, `Last 30 Days`, and `Last 60 Days`.
- **Live SSE Connection:** Real-time push updates without polling.
- **Safe Demo Data Reset:** Environment-guarded sandbox reset with automatic client synchronization.

---

## Reliability & Idempotency

Payment webhook pipelines are subject to network retries and duplicate event deliveries. RecoverAI enforces dual-layer idempotency:

1. **Database Constraint:** Composite unique index on `[provider_id, external_payment_id]`.
2. **Pipeline Lock:** Concurrent duplicate checks returning `200 OK` with `isDuplicate: true` when a duplicate hash is detected.

### Verified Concurrency Test Result
- **Input:** 25 simultaneous concurrent requests with the identical `externalPaymentId`.
- **Output:** Exactly **1** record created (`201 Created`), **24** duplicate responses handled (`200 OK`), and **0** duplicate database records created.

---

## Concurrency & Scalability

An isolated load test was conducted across varying concurrency levels:

| Concurrency Level | Total Requests | Successful (201) | Failed (5xx) | P95 Latency | Throughput | DB / Idempotency Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **10 concurrent** | 10 | **10 (100%)** | 0 | 6.6s | 1.5 req/s | 0 |
| **25 concurrent** | 25 | **25 (100%)** | 0 | 5.3s | 4.3 req/s | 0 |
| **50 concurrent** | 50 | **50 (100%)** | 0 | 7.6s | 6.0 req/s | 0 |
| **100 concurrent**| 100 | **100 (100%)**| 0 | 13.6s | 6.9 req/s | 0 |
| **200 concurrent**| 200 | 101 (50.5%) | 99 (49.5%) | 17.2s | 10.4 req/s | 99 (DB pool timeout) |

- **Pipeline Capacity:** Based on the isolated load test, the end-to-end pipeline demonstrated **100% success at 100 concurrent requests**.
- **ML Service Concurrency:** The FastAPI ML microservice processed **200 concurrent inference requests with 100% success** at **374.7 req/s** (P95 latency: 524ms).
- **Bottleneck Analysis:** At 200 simultaneous ingestion requests, the serverless database connection pool reached its concurrency limit.

---

## Security & Safety Principles

- **Cryptographic Webhook Verification:** Razorpay webhooks are validated using HMAC SHA-256 signatures before entering the pipeline.
- **Stateless JWT Authentication:** Production endpoints use RFC 7519 HMAC SHA-256 tokens with role-based access control (`ADMIN`, `MEMBER`, `VIEWER`).
- **Sliding-Window Rate Limiting:** Ingestion and execution endpoints are protected against brute-force and DoS spikes via IP-based rate limiting.
- **Zero Blind Retries:** Fraudulent, expired, and permanently declined cards are strictly blocked from automated retries.

---

## Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend API** | Node.js, Express v5, TypeScript, Zod, Supertest |
| **Database & ORM** | PostgreSQL (Neon Serverless), Prisma ORM v6 |
| **Machine Learning** | Python 3.13, FastAPI, scikit-learn, NumPy, Pandas, Joblib |
| **Payment Integration**| Razorpay Node SDK, Razorpay Webhooks |
| **Test Suites** | Vitest (TypeScript), Pytest (Python ML) |

---

## Project Structure

```
RecoverAi/
├── app/
│   ├── backend/               # Express API & Payment Pipeline
│   │   ├── src/
│   │   │   ├── controllers/   # Webhook, Dashboard, Auth controllers
│   │   │   ├── services/      # Pipeline, FailureAnalysis, RecoveryIntelligence
│   │   │   └── middleware/    # Auth, RateLimiter, Tenant middleware
│   │   └── tests/             # 22 Vitest test suites (245 tests)
│   ├── frontend/              # Next.js 15 Dashboard
│   │   └── src/
│   │       ├── app/           # App router & global styles
│   │       ├── components/    # KPI cards, Breakdown charts, Detail modal
│   │       └── lib/           # API client & utilities
│   └── ml_service/            # FastAPI ML Inference Server
│       ├── main.py            # /predict & /health endpoints
│       └── schemas.py         # Pydantic request/response contracts
├── database/
│   └── prisma/
│       └── schema.prisma      # Unified PostgreSQL schema
├── ml/                        # ML Training & Evaluation Pipeline
│   ├── data/                  # Dataset generator & splitters
│   ├── evaluation/            # Evaluation scripts & report JSON
│   ├── features/              # ColumnTransformer feature pipeline
│   ├── models/                # Serialized model artifact (.joblib)
│   └── training/              # Baseline training module
├── packages/
│   ├── contracts/             # Shared TypeScript schemas & Zod validators
│   └── shared/                # Common utility functions
└── tests/
    └── ml/                    # 18 Pytest ML unit tests
```

---

## Local Development

### 1. Prerequisites
- Node.js $\ge 20.0.0$
- Python $\ge 3.11$
- PostgreSQL Database URL (Neon or Local PostgreSQL)

### 2. Installation
```bash
# Install root and workspace Node.js dependencies
npm install

# Set up Python virtual environment for ML service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

### 4. Database Setup
```bash
# Generate Prisma Client
npm run prisma:generate

# Deploy schema migrations
npm run prisma:deploy
```

### 5. Running the Services
```bash
# Terminal 1: Backend API (Port 4000)
npm run dev:backend

# Terminal 2: ML Inference Service (Port 8000)
npm run dev:ml

# Terminal 3: Frontend Dashboard (Port 3000)
npm run dev:frontend
```

---

## Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/recoverai?sslmode=require` |
| `BACKEND_PORT` | Port for Express backend API | `4000` |
| `FRONTEND_URL` | Origin URL for CORS configuration | `http://localhost:3000` |
| `ML_SERVICE_URL` | URL of the Python FastAPI ML microservice | `http://localhost:8000` |
| `AUTH_SECRET` | Secret key for JWT cryptographic signing | `your_jwt_signing_secret` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | `rzp_test_yourKeyId` |
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret | `yourTestKeySecret` |
| `RAZORPAY_WEBHOOK_SECRET`| Razorpay Webhook Secret for signature verification | `yourTestWebhookSecret` |

---

## Testing

RecoverAI enforces comprehensive automated test suites across all layers:

```bash
# Run backend TypeScript test suite (245 tests)
npm run test --workspace app/backend

# Run frontend test suite (18 tests)
npm run test --workspace app/frontend

# Run Python ML test suite (18 tests)
npm run test:ml

# Run workspace TypeScript typecheck
npm run typecheck

# Run ESLint across all packages
npm run lint
```

### Verified Test Results
- **Backend Test Suite:** 22 test files, **245 / 245 passed** (100%)
- **Frontend Test Suite:** 1 test file, **18 / 18 passed** (100%)
- **Python ML Test Suite:** 5 test files, **18 / 18 passed** (100%)
- **TypeScript Typecheck:** **0 errors** across all packages
- **ESLint:** **0 warnings / 0 errors**

---

## Demo Flow

To observe the end-to-end payment failure recovery flow:

1. **Trigger a Payment Failure:** Ingest a payment failure event with reason `INSUFFICIENT_FUNDS` via Razorpay Test Mode or `POST /api/payment-events`.
2. **Automated Root-Cause Classification:** RecoverAI classifies the failure into `INSUFFICIENT_FUNDS` with a `TEMPORARY` temporal flag.
3. **Recovery Decisioning:** Recovery Intelligence assesses the transaction as `RECOVER` with 85% confidence and recommends `RETRY_PAYMENT`.
4. **Execute Recovery:** Click **"Execute Recovery Attempt"** in the dashboard modal to create a live Razorpay Payment Link.
5. **Customer Settles Payment:** Complete the payment link in Razorpay sandbox.
6. **Confirmation & Verification:** Razorpay dispatches `payment.captured` webhook $\rightarrow$ RecoverAI verifies the signature $\rightarrow$ records `RecoveryOutcome(outcome: "SUCCESSFUL")`.
7. **Realized Revenue:** The dashboard instantly reflects the updated **Actual Recovered Amount** and **Recovery Rate %** via Server-Sent Events.

---

## Limitations & Future Improvements

- **Synthetic ML Benchmark:** The current ML model (`recovery_success_v1`) was trained and evaluated on a synthetic development dataset. Production ML weights must be calibrated against live merchant transaction histories.
- **Database Connection Sizing:** High-concurrency spikes (>100 concurrent requests) encounter serverless connection pool limits under interactive transactions.
- **Asynchronous Worker Queue:** An asynchronous event queue (e.g. BullMQ / Redis) can be introduced to acknowledge webhooks within 20ms and offload downstream ML scoring and link generation to background workers.

---

## Why RecoverAI

> **"RecoverAI does not simply report failed payments. It determines whether a failed payment can be safely recovered, chooses the appropriate recovery path, executes it, and verifies the recovered revenue."**

**Don't just report failed payments. Recover the revenue behind them.**