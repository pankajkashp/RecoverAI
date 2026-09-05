# Recovery Decision Validation

`RecoveryDecisionValidationService` (`app/backend/src/services/recovery-validation.service.ts`)
proves whether RecoverAI's recovery decisions were correct by comparing each
recommendation to what actually, observably happened — never to a synthetic
assumption, an attempt, or an ML prediction treated as if it were an outcome.

It does not change payment correlation logic, recovery execution, deterministic
recovery rules, contracts, or the ML architecture. It only reads already-persisted
data and classifies it.

## What counts as ground truth

A case is only "resolved" (has real ground truth) when **both** of the following
are true:

1. A `RecoveryOutcome` exists with `outcome === "SUCCESSFUL"`, created **exclusively**
   from a verified provider webhook (Razorpay `payment.captured` / `order.paid` /
   `payment_link.paid`, HMAC-verified) or an explicit test simulation — never from
   initiating a retry.
2. `BusinessTransaction.recoveryAttribution === "RECOVERAI"` — the success is
   actually attributable to RecoverAI's own recovery attempt, not to the customer
   paying independently or an unrelated payment settling the same business
   transaction.

Concretely, this means:

| Signal | Proof of recovery? |
|---|---|
| `RecoveryRecommendation.action === "RETRY_PAYMENT"` | No — a prediction, not an outcome. |
| A retry link / checkout URL was generated or clicked | No. |
| `RecoveryAttempt.status === "ATTEMPTED"` | No — a retry was initiated, nothing confirmed yet. |
| A vendor/customer *says* the payment was received | No — not authoritative. |
| `RecoveryOutcome.outcome === "SUCCESSFUL"` but `recoveryAttribution !== "RECOVERAI"` | No — successful payment, but not RecoverAI's doing. |
| `RecoveryOutcome.outcome === "SUCCESSFUL"` **and** `recoveryAttribution === "RECOVERAI"` | **Yes.** |

This mirrors the "Critical Trust Invariant" already enforced by
`RecoveryExecutionService` (see `recovery-lifecycle-trust.test.ts`): an `ATTEMPTED`
recovery attempt never creates a `RecoveryOutcome` or credits an amount until a
verified provider confirmation arrives. The validation layer does not re-implement
this invariant — it reads its result.

## Observed outcome classes

Every payment that received a recommendation is classified into exactly one of:

- `RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_SUCCESS`
- `RECOMMENDED_RECOVER_PROVIDER_CONFIRMED_FAILURE` (covers provider-confirmed `FAILED`, `CANCELLED`, `EXPIRED` — all definitively "did not recover")
- `RECOMMENDED_RECOVER_ATTEMPTED_UNRESOLVED` (attempted, no confirmation yet, or a `SUCCESSFUL` outcome not attributable to RecoverAI — deliberately **not** counted as success or failure)
- `RECOMMENDED_RECOVER_NOT_ATTEMPTED`
- `RECOMMENDED_DO_NOT_RECOVER`
- `RECOMMENDED_REVIEW`
- `CUSTOMER_ACTION_REQUIRED`
- `ANOMALY_UNEXPECTED_ATTEMPT_FOR_DO_NOT_RECOVER` — a `DO_NOT_RECOVER` recommendation that was nonetheless executed. This should never be non-empty; if it is, it is a safety-rule violation, not a metrics footnote.

## Metrics calculated (and their exact denominators)

All metrics that depend on a ratio report `insufficientData: true` and `value: null`
instead of a fabricated `0%` when their denominator is zero.

| Metric | Numerator | Denominator | Excludes |
|---|---|---|---|
| Recovery decision precision | `..._CONFIRMED_SUCCESS` | `..._CONFIRMED_SUCCESS` + `..._CONFIRMED_FAILURE` | Unresolved/pending attempts (not yet known) |
| Recovery success rate | Attempts confirmed `SUCCESSFUL` | Attempts that reached any terminal confirmed state | Pending/`UNKNOWN` outcomes |
| False recovery recommendation rate | `..._CONFIRMED_FAILURE` | Same as precision | Same as precision |
| Actual recovered amount | — | Sum of `actualRecoveredAmount` where outcome is `SUCCESSFUL` **and** attribution is `RECOVERAI` | Estimates, pending attempts, non-RecoverAI successes |
| Estimated vs. actual | — | Cases with both a stored estimate and a resolved outcome | Pending cases (no actual value exists yet) |
| Review rate | `RECOMMENDED_REVIEW` | All cases that received *any* recommendation | Payments with no recommendation (e.g. never failed) |
| ML-assisted vs. deterministic precision | Same shape as decision precision | Split by `mlUsed`, computed **separately per group, never combined** | See gap below |

## What cannot yet be calculated, and why

**ML-assisted vs. deterministic decision performance cannot be computed from
persisted data today.**

`RecoveryRecommendationService.recommend()` computes `mlUsed`, `mlProbability`,
and `ruleSource` in memory (see `packages/contracts` `RecoveryRecommendationResult`),
but `PaymentPipelineService` only persists `action`, `status`, `reason`, and
`confidence` to the `RecoveryRecommendation` table — `mlUsed`/`mlProbability`/
`ruleSource` are discarded before they reach the database. Separately, the
`MlPrediction` table exists in `schema.prisma` but no service ever writes to it.

As a result, `RecoveryDecisionValidationService.loadCasesForCompany()` always
returns `mlUsed: null` for every case sourced from the database, and the report's
`mlAssisted.mlTrackingAvailable` is `false` for real data — both
`mlAssisted.deterministic` and `mlAssisted.mlAssisted` correctly report
`insufficientData: true` rather than a guessed split.

The splitting logic itself is implemented and unit-tested (`buildRecoveryValidationReport`
in `recovery-validation.test.ts`) against hand-built cases with known `mlUsed`
values, so the metric is ready to activate the moment ML usage is persisted —
closing that gap (e.g. adding nullable `mlUsed`/`mlProbability`/`ruleSource`
columns to `RecoveryRecommendation`) is a schema decision intentionally left out
of this change, since it was not required to build the validation layer itself.

**Every other metric above is only as good as the volume of resolved cases in the
underlying data.** With few provider-confirmed outcomes, `recoveryDecisionPrecision`
etc. will legitimately report `insufficientData: true` — that is correct behavior,
not a bug.

## Why ML accuracy alone would be insufficient

Even once `mlUsed` is tracked, an aggregate "recommendation accuracy" number that
mixes deterministic and ML-assisted decisions would be misleading for three
reasons this service deliberately avoids:

1. **Different authority.** Deterministic rules are safety boundaries (`DO_NOT_RECOVER`
   can never be overridden); ML is only a supporting signal for already-ambiguous
   `REVIEW` cases. Blending them hides whether the *safety rules* are correct
   behind whatever the *ML signal* happens to be doing.
2. **Different, much smaller sample.** ML only ever influences the subset of cases
   that were already ambiguous enough to reach `REVIEW`. A combined number is
   dominated by the (much larger, much easier) deterministic population and would
   not tell you anything reliable about ML quality specifically.
3. **The current model is synthetic.** `isSyntheticDevelopmentModel` on every ML
   response marks it as trained on synthetic development data, not production
   outcomes. Reporting its "accuracy" as if it were validated against real recovered
   revenue — especially blended with deterministic decisions — would overstate
   confidence the system does not have. This is why `mlAssisted` is reported as its
   own, separate, explicitly-labeled metric rather than folded into
   `recoveryDecisionPrecision`.

## Using it

```ts
const service = new RecoveryDecisionValidationService();
const report = await service.generateValidationReport(companyId);
```

`report` is a plain object (`RecoveryValidationReport`) — safe to log, persist, or
render. Every rate field carries its own `numerator`, `denominator`,
`insufficientData`, and a human-readable `note` explaining exactly what it does
and does not include, so a report can never be read as claiming more than the
underlying data supports.
