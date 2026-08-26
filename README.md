::: {align="center"}

◈ RECOVERAI ◈

Payment Recovery Intelligence Engine

Turn failed payments into recoverable decisions.

A provider-agnostic payment recovery platform that ingests payment
events, understands why payments fail, evaluates recovery potential,
recommends safe actions, and records the complete recovery lifecycle.

<br/>{=html}





:::

◈ What is RecoverAI?

RecoverAI is an intelligent payment recovery system.

When a payment fails, RecoverAI does not simply say "failed".

It asks:

┌──────────────────────────────────────────────────────────────┐
│  PAYMENT FAILED                                              │
│                                                              │
│  Why did it fail?                                           │
│          ↓                                                   │
│  Is recovery worthwhile?                                    │
│          ↓                                                   │
│  What action should be taken?                               │
│          ↓                                                   │
│  Did recovery succeed?                                      │
└──────────────────────────────────────────────────────────────┘

The system combines deterministic recovery rules with an ML
supporting signal, while keeping the final business logic safe and
explainable.

◆ The 3D Architecture

Think of RecoverAI as a layered machine:

                         ╱──────────────────────╲
                        ╱   PAYMENT PROVIDERS    ╲
                       ╱ Razorpay • Demo • ...   ╲
                      ╱──────────────────────────╲
                                   │
                                   ▼
                    ╔══════════════════════════════╗
                    ║      PROVIDER ADAPTERS      ║
                    ║  External → Canonical Event ║
                    ╚══════════════════════════════╝
                              ╱│
                             ╱ │
                            ▼  │
              ╔════════════════════════════════════╗
              ║        RECOVERAI CORE              ║
              ║                                    ║
              ║  Failure Analysis                  ║
              ║          ↓                         ║
              ║  Recovery Intelligence             ║
              ║          ↓                         ║
              ║  Recovery Recommendation           ║
              ║          ↓                         ║
              ║  Recovery Execution                ║
              ╚════════════════════════════════════╝
                         ╱             ╲
                        ╱               ╲
                       ▼                 ▼
              ╔══════════════╗    ╔══════════════╗
              ║ ML SERVICE   ║    ║ PostgreSQL  ║
              ║ Supporting   ║    ║ Persistent  ║
              ║ Signal       ║    ║ State       ║
              ╚══════════════╝    ╚══════════════╝
                       ╲               ╱
                        ╲             ╱
                         ▼           ▼
                    ╔════════════════════╗
                    ║     DASHBOARD      ║
                    ║  Observe • Decide  ║
                    ║  • Audit • Recover ║
                    ╚════════════════════╝

Core principle

Providers change. RecoverAI's intelligence does not.

Razorpay-specific data is normalized at the integration boundary into a
provider-independent CanonicalPaymentEvent.

That means a future provider can follow the same pattern:

Razorpay ──► RazorpayAdapter ──┐
                               │
Stripe   ──► StripeAdapter ────┼──► CanonicalPaymentEvent
                               │            │
Demo     ──► DemoAdapter ──────┘            ▼
                                      RecoverAI Core

◆ The Payment Journey

A payment moves through RecoverAI like this:

                    PAYMENT EVENT
                         │
                         ▼
              ┌─────────────────────┐
              │ Normalize Provider   │
              │ Data → Canonical     │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │ Payment Pipeline    │
              └──────────┬──────────┘
                         ▼
                  Is it FAILED?
                    ╱         ╲
                  NO           YES
                  │             │
                  ▼             ▼
             Store event    Failure Analysis
                  │             │
                  │             ▼
                  │      Recovery Assessment
                  │             │
                  │             ▼
                  │      Recommendation
                  │             │
                  │             ▼
                  │      Recovery Attempt
                  │             │
                  └──────┬──────┘
                         ▼
                  Outcome recorded
                         │
                         ▼
                     Dashboard

Example

₹10,000 payment
      ↓
FAILED
      ↓
INSUFFICIENT_FUNDS
      ↓
RECOVERABLE
      ↓
RETRY / PAYMENT LINK
      ↓
SUCCESS

For permanent or uncertain cases, the system can safely avoid execution:

PERMANENT ──► DO_NOT_RECOVER ──► Execution blocked
REVIEW     ──► REVIEW          ──► Execution blocked

◆ Why the Canonical Event Exists

External providers speak different languages.

Razorpay may send:

amount
created_at
error_reason
error_source
error_step
...

RecoverAI should not make every core service understand Razorpay's
payload.

Instead:

Razorpay Payload
      ↓
RazorpayProviderAdapter
      ↓
CanonicalPaymentEvent
      ↓
Provider-independent core

This gives RecoverAI a clean boundary:

┌──────────────────────┐
│ EXTERNAL WORLD       │
│ Razorpay / Stripe... │
└──────────┬───────────┘
           │
           │ Adapter boundary
           ▼
┌──────────────────────┐
│ RECOVERAI DOMAIN     │
│ Canonical Event      │
│ Core Intelligence    │
└──────────────────────┘

Result: adding another provider should primarily require another
adapter and integration tests rather than rewriting the recovery engine.

◆ ML: What It Actually Does

RecoverAI uses ML as a supporting signal, not as an uncontrolled
authority.

Training

Historical / synthetic examples
            ↓
      Feature preparation
            ↓
      Logistic Regression
            ↓
       Trained model

Runtime

NEW PAYMENT
     ↓
Extract model features
     ↓
Trained ML model
     ↓
Continuous recovery score
     ↓
Combine with deterministic intelligence
     ↓
Final RecoverAI decision

Current evidence

The current model achieved:

ROC-AUC = 0.6859

The rule-based baseline performed approximately on par with the Logistic
Regression model on the available synthetic test data.

Important: this does not prove real-world ML superiority. The
current training/evaluation evidence is synthetic, so production
performance must be validated with real recovery outcomes.

This is intentional architecture: ML supports the decision;
deterministic safety logic remains authoritative.

◆ Data: Code vs Database

A simple mental model:

PROJECT FILES
     │
     └── "What should RecoverAI do?"

NEON POSTGRESQL
     │
     └── "What actually happened?"

RecoverAI uses Prisma to communicate with PostgreSQL:

Backend
   ↓
Prisma
   ↓
Neon PostgreSQL

Important domain records include concepts such as:

Company
Provider
PaymentEvent
PaymentFailure
RecoveryAssessment
RecoveryRecommendation
RecoveryAttempt
RecoveryOutcome
User

The exact database schema is defined by the project's Prisma schema.

◆ Dashboard Model

The dashboard is a common UI, but the data is tenant-specific.

                    RECOVERAI DASHBOARD
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
         Company A     Company B     Company C
         Razorpay       Stripe        Razorpay
             │             │             │
             ▼             ▼             ▼
         Own data      Own data      Own data

So:

Same dashboard architecture

Same recovery engine

Different company data

Tenant isolation enforced by the backend

A company can use one provider or multiple providers without changing
the core dashboard concept.

◆ Security Architecture

RecoverAI separates human authentication from provider
authentication.

Human users

Login
  ↓
JWT
  ↓
Tenant / Company
  ↓
Role
  ↓
Allowed action

Roles:

Role       Purpose

ADMIN    Full administrative access
MEMBER   Operational/recovery access
VIEWER   Read-only access

Payment providers

Razorpay does not log into RecoverAI like a human.

It proves webhook authenticity using:

X-Razorpay-Signature
        ↓
HMAC SHA-256 verification
        ↓
Accept / Reject

This separation keeps user security and provider security conceptually
clean.

◆ Razorpay Integration

Phase 11 connected Razorpay Test/Sandbox to the existing RecoverAI core
without rewriting the core intelligence.

Razorpay Test
     │
     ▼
POST /api/webhooks/razorpay
     │
     ▼
Raw body + HMAC verification
     │
     ▼
RazorpayProviderAdapter
     │
     ▼
CanonicalPaymentEvent
     │
     ▼
PaymentPipelineService
     │
     ▼
Failure / Recovery intelligence
     │
     ▼
PostgreSQL
     │
     ▼
Dashboard

Verified during sandbox testing

Webhook reached local backend through ngrok

Raw body was available

Webhook secret was configured

HMAC signature verification returned valid: true

Backend returned HTTP 200

Razorpay payment events appeared in RecoverAI

Failed and authorized payment paths were observed

Dashboard event count updated

◆ Reliability & Safety

RecoverAI includes several production-oriented protections:

✓ Request correlation
✓ Structured logging
✓ Rate limiting
✓ Safe error handling
✓ Tenant isolation
✓ JWT authentication
✓ RBAC
✓ Audit logging
✓ Webhook HMAC verification
✓ Idempotent payment ingestion
✓ Bounded dashboard queries
✓ Health/readiness probes
✓ Provider adapter boundary

Idempotency

Webhook providers can retry deliveries.

RecoverAI protects against duplicate payment records using a compound
uniqueness concept based on:

providerId + externalPaymentId + companyId

So the same external payment should not become multiple independent
payment records for the same provider/company context.

◆ Real-World Validation

Phase 13 validated the system as a connected application rather than
testing isolated modules only.

Lifecycle scenarios

Scenario                                 Expected behavior                      Result

Failed → Recoverable → Retry → Success   Recovery succeeds                        ✅
Failed → Recoverable → Retry → Failed    Failed outcome recorded                  ✅
Failed → Permanent                       DO_NOT_RECOVER; execution blocked      ✅
Failed → Review                          REVIEW; execution blocked              ✅
Successful payment                       No failure/recovery records              ✅

Load benchmark

10 concurrent ingestions
0 errors
~698 ms average/request

Dashboard measurements:

Summary query       ~3.3 s
Payment list query  ~3.8 s

These are validation measurements, not guarantees of
production-scale performance.

◆ Security Validation

Phase 12/13 verified:

Authentication                 ✅
JWT HMAC signing               ✅
Cross-tenant isolation         ✅
RBAC                           ✅
VIEWER recovery restriction   ✅
Audit logging                  ✅
Webhook signature security    ✅
Secret exclusion from Git      ✅
Sandbox / production separation ✅

A Company A user attempting to access Company B data is rejected with:

403 Forbidden

◆ Project Structure

The important mental model:

RecoverAI/
│
├── app/
│   ├── backend/             # API + business orchestration
│   └── frontend/            # Dashboard / UI
│
├── integrations/            # Provider adapters
│
├── ml/                      # ML training / model logic
│
├── prisma/                  # Database schema / Prisma layer
│
├── docs/                    # Deployment + operations documentation
│
├── .env                     # Local secrets/configuration
├── .env.example             # Safe configuration template
└── package.json             # Project/workspace commands

The exact repository may contain additional files and folders; the key
architectural boundaries are the important part.

◆ Development Philosophy

RecoverAI was built around a few deliberate principles:

01 --- Keep the core provider-agnostic

Don't make business logic depend on Razorpay.

02 --- Normalize at the boundary

External provider formats are converted into one canonical contract.

03 --- Safety before automation

A recommendation is not automatically an execution.

04 --- ML supports; rules protect

ML provides a signal. Deterministic safety logic remains authoritative.

05 --- Multi-tenant by design

Company data must remain isolated.

06 --- Test the lifecycle, not only functions

The system must work from payment event → decision → recovery → outcome.

07 --- Be honest about evidence

Synthetic ML results are not production proof.

◆ Phase Roadmap

Phase 10  ──► Production Security & Reliability       ✅
Phase 11  ──► Razorpay Sandbox Integration            ✅
Phase 12  ──► Authentication & Authorization          ✅
Phase 13  ──► Real-World Validation & Preparation     ✅

Current project state

Production-prepared, not production-proven.

The system has passed its current automated and sandbox validation, but
real production performance---especially ML superiority, long-term
recovery outcomes, and larger-scale traffic---still requires real-world
evidence.

◆ Validation Snapshot

::: {align="center"}
Validation                                Result

TypeScript tests                    143 / 143 PASS
Python ML tests                      18 / 18 PASS
TypeScript typecheck                   0 errors
ESLint                            0 errors / warnings
Production build                         PASS
Lifecycle scenarios                   5 / 5 PASS
Concurrent ingestion               10 / 10, 0 errors
Tenant isolation                         PASS
RBAC                                     PASS
Webhook signature verification           PASS
Razorpay sandbox ingestion               PASS
:::

◆ What RecoverAI Ultimately Does

             ┌──────────────────────────────┐
             │       PAYMENT FAILURE        │
             └──────────────┬───────────────┘
                            ▼
                  ┌──────────────────┐
                  │ Understand WHY   │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Is it recoverable│
                  │     / risky?     │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Choose the safest│
                  │     action       │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Execute / Block  │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Measure outcome  │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Learn from real  │
                  │ recovery results │
                  └──────────────────┘

RecoverAI is not just a payment dashboard.

It is a provider-agnostic recovery decision engine wrapped in a
secure, observable, multi-tenant platform.

::: {align="center"}

◈ RECOVERAI ◈

Detect → Understand → Decide → Recover → Learn

Built to recover revenue without compromising safety.
:::