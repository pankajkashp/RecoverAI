# RecoverAI ML Datasets

## Synthetic Development Data Notice
All datasets currently stored in `ml/data/raw/` and `ml/data/processed/` are **100% synthetic development data** generated with controlled probabilistic distributions and Gaussian noise.

They are strictly for:
- Machine learning pipeline development
- Baseline model training and test verification
- Contract and endpoint validation

> ⚠️ **Limitation Notice**: Evaluation metrics computed on these datasets reflect synthetic mathematical relationships and must **NOT** be claimed as real-world recovery accuracy.

## Dataset Schema

| Column | Type | Description | Target Leakage Check |
|---|---|---|---|
| `payment_id` | String | Synthetic unique transaction ID | Identifier only |
| `company_id` | String | Tenant company ID | Constant / context |
| `provider_type` | String | Gateway type (`DEMO`, `RAZORPAY`, `STRIPE`) | Input feature |
| `amount` | Float | Transaction amount in currency unit | Input feature |
| `currency` | String | ISO currency code (`INR`, `USD`) | Input feature |
| `payment_method` | String | Method (`UPI`, `CARD`, `NETBANKING`, `WALLET`) | Input feature |
| `failure_category` | String | Phase 4 normalized failure taxonomy category | Input feature |
| `failure_classification` | String | Classification (`TEMPORARY`, `PERMANENT`, `UNKNOWN`) | Input feature |
| `event_hour` | Int | Transaction hour (0–23) | Input feature |
| `day_of_week` | Int | Transaction day of week (0=Mon, 6=Sun) | Input feature |
| `recovery_success` | Int | Binary target (1 = Recovered, 0 = Not Recovered) | **TARGET LABEL** |
