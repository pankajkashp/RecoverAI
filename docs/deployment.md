# RecoverAI — Production Deployment Guide

This document defines the deployment blueprint, architectural topology, environment configurations, and verification procedures for running RecoverAI in staging and production environments.

---

## 1. System Architecture Topology

```text
                                Internet / Client
                                       │
                       ┌───────────────┴───────────────┐
                       │   HTTPS / Reverse Proxy / LB   │
                       │     (Cloudflare / NGINX)      │
                       └───────┬───────────────┬───────┘
                               │               │
                     /api, /health, /ready     / (UI)
                               │               │
                               ▼               ▼
                      ┌────────────────┐ ┌───────────────┐
                      │  Node.js API   │ │   Next.js     │
                      │  (App Backend) │ │ (App Frontend)│
                      └───────┬────────┘ └───────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
   ┌─────────────────┐ ┌───────────────┐ ┌───────────────┐
   │ PostgreSQL (DB) │ │ Python ML Svc │ │ Provider API  │
   │ (Managed Cloud) │ │   (FastAPI)   │ │ (e.g. Razorpay│
   └─────────────────┘ └───────────────┘ └───────────────┘
```

---

## 2. Infrastructure Prerequisites

| Component | Minimum Specification | Recommended Production Sizing |
|---|---|---|
| **PostgreSQL Database** | PostgreSQL 15+, 1 vCPU, 2GB RAM | AWS RDS / Supabase / GCP Cloud SQL (2+ vCPU, 8GB RAM, Multi-AZ) |
| **Backend API Service** | Node.js 20+ LTS, 1 vCPU, 1GB RAM | Containerized (Docker / AWS ECS / Railway / Render) 2+ instances |
| **ML Inference Service** | Python 3.11+, 1 vCPU, 1GB RAM | Containerized (FastAPI / Gunicorn / Uvicorn workers) |
| **Frontend Dashboard** | Node.js 20+ LTS (Next.js SSR/Static) | Vercel / Cloudflare Pages / Containerized Next.js standalone |

---

## 3. Environment Variables Configuration

Create a secure `.env` file (or inject via secrets manager) for the deployment environment. **Never commit secrets to version control.**

### Backend Service (`app/backend`)

| Variable | Required | Description | Example |
|---|:---:|---|---|
| `NODE_ENV` | Yes | Environment mode (`production`, `staging`) | `production` |
| `PORT` | No | API port (defaults to `4000`) | `4000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/recoverai?schema=public&sslmode=require` |
| `AUTH_SECRET` | Yes | 64-byte high-entropy HMAC secret | Generate: `openssl rand -base64 48` |
| `FRONTEND_URL` | Yes | Public origin of the frontend dashboard | `https://dashboard.yourcompany.com` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS allowed origins | `https://dashboard.yourcompany.com` |
| `ML_SERVICE_URL` | Yes | Internal URL of ML microservice | `http://recoverai-ml:8000` |
| `RAZORPAY_KEY_ID` | Conditional | Provider Key ID (Razorpay) | `rzp_live_...` or `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Conditional | Provider Secret Key | `<merchant_secret>` |
| `RAZORPAY_WEBHOOK_SECRET`| Yes | Shared webhook signing secret | `<webhook_secret>` |

### Frontend Dashboard (`app/frontend`)

| Variable | Required | Description | Example |
|---|:---:|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Public URL of the backend API | `https://api.yourcompany.com` |

---

## 4. Step-by-Step Deployment Procedure

### Step 1: Database Provisioning & Migration
1. Provision a PostgreSQL 15+ database.
2. Run database migrations from the repository root:
   ```bash
   npx prisma migrate deploy --schema=database/prisma/schema.prisma
   ```
3. Verify connection and schema integrity:
   ```bash
   npx prisma db pull --schema=database/prisma/schema.prisma
   ```

### Step 2: ML Microservice Deployment
1. Build Python virtual environment or Docker container from `ml/`:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Verify model artifact exists: `ml/models/recovery_success_v1.joblib`.
3. Launch FastAPI server with production Uvicorn workers:
   ```bash
   uvicorn ml.service:app --host 0.0.0.0 --port 8000 --workers 4
   ```

### Step 3: Backend API Deployment
1. Install production dependencies and build TypeScript bundle:
   ```bash
   npm --workspace app/backend run build
   ```
2. Start backend server:
   ```bash
   NODE_ENV=production npm --workspace app/backend run start
   ```
3. Verify health and readiness endpoints:
   - `GET https://api.yourcompany.com/health` $\rightarrow$ `{"status": "ok"}`
   - `GET https://api.yourcompany.com/ready` $\rightarrow$ `{"status": "ready", "database": "connected"}`

### Step 4: Frontend Dashboard Deployment
1. Build Next.js production bundle:
   ```bash
   npm --workspace app/frontend run build
   ```
2. Start Next.js standalone server:
   ```bash
   npm --workspace app/frontend run start
   ```

---

## 5. Webhook Configuration (Razorpay)

1. Open your Razorpay Dashboard $\rightarrow$ **Settings** $\rightarrow$ **Webhooks**.
2. Click **Add New Webhook**.
3. Set **Webhook URL**:
   ```text
   https://api.yourcompany.com/api/webhooks/razorpay?companyId=<YOUR_COMPANY_ID>
   ```
4. Set **Secret**: Enter the exact secret string defined in `RAZORPAY_WEBHOOK_SECRET`.
5. Select Active Events:
   - `payment.failed`
   - `payment.captured`
   - `payment.authorized`
6. Save and send a test webhook to verify end-to-end receipt.

---

## 6. Rollback & Disaster Recovery

### Application Rollback
- Revert the container image tag or deployment commit to the previous stable release.
- All database migrations are designed to be backward-compatible (non-destructive additive columns/tables).

### Database Disaster Recovery
- Ensure automated daily database snapshots with point-in-time recovery (PITR) enabled.
- To restore from backup:
  1. Stop backend API traffic.
  2. Restore RDS/PostgreSQL snapshot to a new instance.
  3. Update `DATABASE_URL` in backend secrets.
  4. Restart backend service and verify `/ready` probe.
