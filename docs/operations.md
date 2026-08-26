# RecoverAI — Day-2 Operations & Incident Troubleshooting Guide

This handbook covers operational monitoring, health probes, failure recovery runbooks, structured logging, audit trails, and the ML dataset specification for future model fine-tuning.

---

## 1. Observability & Monitoring

### 1.1 Probes & Health Checks

| Endpoint | Method | Purpose | Healthy Response | Action on Failure |
|---|:---:|---|---|---|
| `/health` | `GET` | Liveness check (process running) | `HTTP 200` `{"status":"ok"}` | Restart container / instance |
| `/ready` | `GET` | Readiness check (DB & ML reachable) | `HTTP 200` `{"status":"ready","database":"connected"}` | Check DB connectivity & ML service |
| `http://ml:8000/health` | `GET` | ML service liveness | `HTTP 200` `{"status":"healthy","model_loaded":true}` | Restart ML service container |

### 1.2 Key Metrics & Alerting Thresholds

- **Ingestion Error Rate**: Alert if `POST /api/payment-events` 5xx error rate > 0.5% over 5m.
- **Webhook Rejection Rate**: Alert if `POST /api/webhooks/razorpay` 400 signature failures > 5 per minute (indicates secret mismatch or tampering).
- **Ingestion Latency**: Alert if p95 response time > 1500ms.
- **Tenant Isolation Denials**: Alert immediately if `TENANT_ISOLATION_VIOLATION_ATTEMPT` audit log fires (potential unauthorized cross-tenant probing).

---

## 2. Incident Troubleshooting & Failure Runbooks

### Runbook 1: PostgreSQL Database Unavailable
- **Symptom**: `/ready` returns `HTTP 503` with `"database": "disconnected"`.
- **System Behavior**: Backend rejects writes with `500/503` safe errors. Multi-step operations (`PaymentEvent` + `PaymentFailure` + `RecoveryAssessment`) roll back atomically via Prisma `$transaction`.
- **Mitigation**:
  1. Check database CPU/memory utilization and active connection pool.
  2. Verify network security groups/firewall rules.
  3. Restart database instance or fail over to Multi-AZ standby if necessary.

### Runbook 2: ML Microservice Unavailable or Timed Out
- **Symptom**: Backend logs warning `ML service unavailable or timed out; falling back to deterministic heuristic`.
- **System Behavior**: **Zero Downtime.** The core pipeline automatically activates rule-based heuristic fallback (`RECOVER` for retriable categories, `DO_NOT_RECOVER` for permanent, `REVIEW` for unknown). No payment event is lost or dropped.
- **Mitigation**:
  1. Inspect ML service container logs: `docker logs recoverai-ml`.
  2. Verify ML host memory/CPU.
  3. Restart ML microservice: `systemctl restart recoverai-ml`.

### Runbook 3: Razorpay Webhook Signature Mismatch
- **Symptom**: Webhook controller returns `HTTP 400` with `Invalid webhook signature`.
- **System Behavior**: The request is safely rejected before pipeline processing. No unverified event enters the database.
- **Mitigation**:
  1. Confirm `RAZORPAY_WEBHOOK_SECRET` in `.env` exactly matches the secret in Razorpay Dashboard.
  2. Ensure reverse proxy passes the exact raw body unmodified (avoid JSON body re-serialization before HMAC calculation).

---

## 3. Structured Logging & Security Audit Trails

All application logs and security events are emitted as single-line JSON with distributed `requestId` correlation:

### Example Security Audit Log
```json
{
  "type": "AUDIT_EVENT",
  "timestamp": "2026-08-26T15:28:42.211Z",
  "userId": "user_admin_a",
  "companyId": "company_001",
  "role": "ADMIN",
  "action": "TENANT_ISOLATION_VIOLATION_ATTEMPT",
  "resource": "/api/dashboard/summary?companyId=company_002",
  "status": "DENIED",
  "requestId": "d8b0f4eb-70e4-49c2-bba6-79d5eb21e4c9",
  "metadata": {
    "targetCompanyId": "company_002",
    "authenticatedCompanyId": "company_001"
  }
}
```

---

## 4. Future Real Historical Dataset Specification for ML Retraining

> [!IMPORTANT]
> The current `recovery_success_v1` model was trained on a synthetic development dataset. For production ML model deployment, train on real merchant historical recovery datasets conforming to the schema below.

### Required Dataset Fields

| Column Name | Data Type | Description | Example |
|---|---|---|---|
| `payment_id` | String | Unique payment identifier | `pay_rzp_019283` |
| `company_id` | String | Merchant tenant identifier | `comp_corp_001` |
| `provider` | Enum | Integration provider (`RAZORPAY`, `STRIPE`, etc.) | `RAZORPAY` |
| `amount` | Float | Payment value normalized to major units | `2499.00` |
| `currency` | String | ISO 4217 Currency Code | `INR` |
| `payment_method` | Enum | Method (`CARD`, `UPI`, `NETBANKING`, `WALLET`) | `UPI` |
| `failure_category` | Enum | Normalized failure reason category | `INSUFFICIENT_FUNDS` |
| `failure_nature` | Enum | `TEMPORARY`, `PERMANENT`, `UNKNOWN` | `TEMPORARY` |
| `hour_of_day` | Integer | UTC transaction hour (0–23) | `14` |
| `day_of_week` | Integer | Transaction day (0=Monday, 6=Sunday) | `2` |
| `recommended_action`| Enum | Action prescribed by RecoverAI | `RETRY_PAYMENT` |
| `recovery_attempted`| Boolean | Whether recovery action was executed | `true` |
| `actual_recovered` | Integer (0/1) | Target Label: 1 = Successfully Recovered, 0 = Failed | `1` |
| `actual_recovered_amount` | Float | Amount collected upon recovery | `2499.00` |
| `recovered_at` | Timestamp | Timestamp of recovery completion | `2026-08-26T14:30:00Z` |

---

## 5. Backup & Recovery Policy

- **RPO (Recovery Point Objective)**: $\le 1$ hour.
- **RTO (Recovery Time Objective)**: $\le 30$ minutes.
- **Automated Daily Backups**: Managed snapshots retained for 30 days.
- **Transaction Logs (WAL)**: Retained for 7 days to enable Point-In-Time Recovery.
