"""
RecoverAI — Synthetic Dataset Generator

Phase 6: ML/Data Intelligence Foundation

IMPORTANT:
This script generates 100% SYNTHETIC development data for machine learning pipeline
development, testing, and baseline model training. It does NOT represent real-world
production data or real customer performance.
"""

import os
import numpy as np
import pandas as pd

RANDOM_SEED = 42
NUM_SAMPLES = 5000
RAW_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "raw", "synthetic_payment_recovery_dataset.csv"
)


def generate_synthetic_dataset(num_samples: int = NUM_SAMPLES, seed: int = RANDOM_SEED) -> pd.DataFrame:
    np.random.seed(seed)

    # Provider distribution
    providers = np.random.choice(
        ["DEMO", "RAZORPAY", "STRIPE"],
        size=num_samples,
        p=[0.5, 0.3, 0.2]
    )

    # Payment method distribution
    methods = np.random.choice(
        ["UPI", "CARD", "NETBANKING", "WALLET"],
        size=num_samples,
        p=[0.45, 0.35, 0.15, 0.05]
    )

    # Failure category distribution
    categories = np.random.choice(
        [
            "INSUFFICIENT_FUNDS",
            "AUTHENTICATION",
            "NETWORK",
            "CARD",
            "BANK",
            "PROVIDER",
            "CUSTOMER_ACTION_REQUIRED",
            "TEMPORARY",
            "UNKNOWN",
        ],
        size=num_samples,
        p=[0.30, 0.20, 0.15, 0.12, 0.08, 0.05, 0.04, 0.03, 0.03]
    )

    # Derive failure classification based on category with occasional noise
    classifications = []
    for cat in categories:
        if cat in ["INSUFFICIENT_FUNDS", "AUTHENTICATION", "NETWORK", "PROVIDER", "CUSTOMER_ACTION_REQUIRED", "TEMPORARY"]:
            classifications.append("TEMPORARY")
        elif cat == "CARD":
            classifications.append("PERMANENT")
        elif cat == "BANK":
            classifications.append(np.random.choice(["TEMPORARY", "PERMANENT", "UNKNOWN"], p=[0.6, 0.3, 0.1]))
        else:
            classifications.append("UNKNOWN")

    # Payment amount (log-normal distribution between 100 and 50000)
    amounts = np.round(np.exp(np.random.normal(7.5, 1.0, num_samples)), 2)
    amounts = np.clip(amounts, 100.0, 75000.0)

    # Currencies
    currencies = np.random.choice(["INR", "USD"], size=num_samples, p=[0.9, 0.1])

    # Time characteristics
    event_hours = np.random.randint(0, 24, size=num_samples)
    days_of_week = np.random.randint(0, 7, size=num_samples)

    # Probabilistic latent recovery outcome generation with realistic noise
    # (NOT a copy of Phase 5 rules: reflects probabilistic tendencies with natural stochasticity)
    logits = np.zeros(num_samples)

    for i in range(num_samples):
        cat = categories[i]
        method = methods[i]
        amount = amounts[i]
        hour = event_hours[i]

        # Category base tendency
        if cat == "NETWORK":
            base = 1.4
        elif cat == "INSUFFICIENT_FUNDS":
            base = 1.1
        elif cat == "TEMPORARY":
            base = 1.2
        elif cat == "PROVIDER":
            base = 0.9
        elif cat == "AUTHENTICATION":
            base = 0.2
        elif cat == "CUSTOMER_ACTION_REQUIRED":
            base = 0.1
        elif cat == "BANK":
            base = 0.0
        elif cat == "CARD":
            base = -1.8
        else:  # UNKNOWN
            base = -0.5

        # Payment method modifier
        method_mod = 0.3 if method == "UPI" else (0.1 if method == "CARD" else -0.1)

        # Amount effect: larger amounts slightly lower spontaneous retry rate
        amount_mod = -0.2 * (np.log1p(amount) - 7.5)

        # Business hours effect
        time_mod = 0.2 if (9 <= hour <= 21) else -0.2

        # Latent logit with Gaussian noise
        noise = np.random.normal(0, 0.6)
        logits[i] = base + method_mod + amount_mod + time_mod + noise

    # Convert logits to recovery success probability via sigmoid
    probabilities = 1.0 / (1.0 + np.exp(-logits))
    recovery_success = (np.random.rand(num_samples) < probabilities).astype(int)

    df = pd.DataFrame({
        "payment_id": [f"pay_synth_{i+1:05d}" for i in range(num_samples)],
        "company_id": "demo_company_001",
        "provider_type": providers,
        "amount": amounts,
        "currency": currencies,
        "payment_method": methods,
        "failure_category": categories,
        "failure_classification": classifications,
        "event_hour": event_hours,
        "day_of_week": days_of_week,
        "recovery_success": recovery_success,
    })

    return df


def main():
    os.makedirs(os.path.dirname(RAW_DATA_PATH), exist_ok=True)
    df = generate_synthetic_dataset()
    df.to_csv(RAW_DATA_PATH, index=False)
    print(f"✅ Generated synthetic dataset with {len(df)} records at {RAW_DATA_PATH}")
    print(f"Class distribution:\n{df['recovery_success'].value_counts(normalize=True)}")


if __name__ == "__main__":
    main()
