# RecoverAI Recovery Decision Matrix

## Decision ownership

RecoverAI separates three different decisions:

1. **Failure Analysis** determines what caused the payment failure and whether the failure is temporary, permanent, or unknown.
2. **Recovery Intelligence** decides whether the failed payment is a recovery candidate: `RECOVER`, `DO_NOT_RECOVER`, or `REVIEW`.
3. **Recovery Recommendation** chooses the operational action. ML may support ambiguous cases, but it cannot override a deterministic safety rule.
4. **Razorpay confirmation** determines whether money was actually recovered. A recovery attempt or payment link is not a successful recovery.

## Safety-first matrix

| Failure category | Classification | Recovery worthiness | Automatic retry? | Why |
|---|---|---:|---:|---|
| INSUFFICIENT_FUNDS | TEMPORARY | RECOVER | Yes | Funds may become available later. |
| INSUFFICIENT_FUNDS | UNKNOWN | REVIEW | No | Temporary vs permanent state is not proven. |
| INSUFFICIENT_FUNDS | PERMANENT | DO_NOT_RECOVER | No | Permanent classification is a hard safety boundary. |
| NETWORK | TEMPORARY | RECOVER | Yes | Transient communication failure may clear. |
| NETWORK | UNKNOWN | REVIEW | No | No reliable evidence that retry is safe. |
| NETWORK | PERMANENT | DO_NOT_RECOVER | No | Permanent classification blocks automated recovery. |
| PROVIDER | TEMPORARY | RECOVER | Yes | Provider outage/error may resolve. |
| PROVIDER | UNKNOWN | REVIEW | No | Cause is not sufficiently understood. |
| PROVIDER | PERMANENT | DO_NOT_RECOVER | No | Permanent classification blocks automated recovery. |
| BANK | TEMPORARY | RECOVER | Yes | Bank/switch availability may recover. |
| BANK | UNKNOWN | REVIEW | No | Issuer outcome is ambiguous. |
| BANK | PERMANENT | DO_NOT_RECOVER | No | Permanent bank decline should not be retried automatically. |
| CARD | PERMANENT | DO_NOT_RECOVER | No | Invalid/expired/lost/stolen card is not a safe retry target. |
| AUTHENTICATION | TEMPORARY | REVIEW | No | Customer must complete authentication. |
| CUSTOMER_ACTION_REQUIRED | TEMPORARY | REVIEW | No | Customer intervention is required first. |
| UNKNOWN | UNKNOWN | REVIEW | No | RecoverAI does not guess when the failure is unclassified. |

## ML boundary

The ML model is a **supporting recovery-probability signal**, not the authority for safety decisions.

For an ambiguous `REVIEW` case:

- ML probability `>= 0.65` may upgrade the recommendation to `RETRY_PAYMENT`.
- ML probability `< 0.65` keeps the recommendation at `REVIEW`.
- If ML is unavailable or returns an invalid response, RecoverAI falls back to deterministic rules.
- ML cannot override `DO_NOT_RECOVER` or customer-action safety rules.

The current ML model is a synthetic development model, so its probability is not a production recovery-rate guarantee.

## Recovery truth

`RETRY_PAYMENT` means RecoverAI decided that attempting recovery is worthwhile. It does **not** mean the payment was recovered.

The lifecycle is:

`FAILED → ANALYZE → ASSESS → RECOMMEND → ATTEMPT → PROVIDER CONFIRMATION → RECOVERED`

Only a verified provider success event such as Razorpay `payment.captured`, correctly correlated to the recovery attempt, can create actual recovered revenue.
