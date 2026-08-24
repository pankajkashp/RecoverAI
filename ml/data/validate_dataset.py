"""
RecoverAI — Dataset Validation Module

Phase 6: ML/Data Intelligence Foundation

Validates raw and processed recovery datasets for:
- Required schema columns
- Data types
- Null / missing values
- Duplicate records
- Valid enum and category sets
- Positive monetary amounts
- Valid binary target labels
"""

import pandas as pd
from typing import Dict, Any, List

REQUIRED_COLUMNS = [
    "payment_id",
    "company_id",
    "provider_type",
    "amount",
    "currency",
    "payment_method",
    "failure_category",
    "failure_classification",
    "event_hour",
    "day_of_week",
    "recovery_success",
]

VALID_PROVIDERS = {"DEMO", "RAZORPAY", "STRIPE", "PAYPAL", "OTHER"}
VALID_METHODS = {"CARD", "UPI", "NETBANKING", "WALLET", "BANK_TRANSFER", "OTHER"}
VALID_CATEGORIES = {
    "AUTHENTICATION",
    "INSUFFICIENT_FUNDS",
    "NETWORK",
    "BANK",
    "CARD",
    "PROVIDER",
    "CUSTOMER_ACTION_REQUIRED",
    "TEMPORARY",
    "UNKNOWN",
}
VALID_CLASSIFICATIONS = {"TEMPORARY", "PERMANENT", "UNKNOWN"}
VALID_CURRENCIES = {"INR", "USD", "EUR", "GBP"}


def validate_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    errors: List[str] = []

    # 1. Check Required Columns
    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        errors.append(f"Missing required columns: {sorted(list(missing_cols))}")

    if errors:
        return {"is_valid": False, "num_records": len(df), "errors": errors}

    # 2. Check Missing / Null Values
    null_counts = df[REQUIRED_COLUMNS].isnull().sum()
    cols_with_nulls = null_counts[null_counts > 0]
    if not cols_with_nulls.empty:
        errors.append(f"Columns with null values: {cols_with_nulls.to_dict()}")

    # 3. Check Duplicate IDs
    duplicate_ids = df["payment_id"].duplicated().sum()
    if duplicate_ids > 0:
        errors.append(f"Found {duplicate_ids} duplicate payment_id entries")

    # 4. Check Amount Validity
    if (df["amount"] <= 0).any():
        errors.append("Found non-positive monetary amounts")

    # 5. Check Category Enums
    invalid_providers = set(df["provider_type"].unique()) - VALID_PROVIDERS
    if invalid_providers:
        errors.append(f"Invalid provider types found: {invalid_providers}")

    invalid_methods = set(df["payment_method"].unique()) - VALID_METHODS
    if invalid_methods:
        errors.append(f"Invalid payment methods found: {invalid_methods}")

    invalid_cats = set(df["failure_category"].unique()) - VALID_CATEGORIES
    if invalid_cats:
        errors.append(f"Invalid failure categories found: {invalid_cats}")

    invalid_class = set(df["failure_classification"].unique()) - VALID_CLASSIFICATIONS
    if invalid_class:
        errors.append(f"Invalid failure classifications found: {invalid_class}")

    # 6. Check Time Boundaries
    if ((df["event_hour"] < 0) | (df["event_hour"] > 23)).any():
        errors.append("Found event_hour values outside [0, 23]")

    if ((df["day_of_week"] < 0) | (df["day_of_week"] > 6)).any():
        errors.append("Found day_of_week values outside [0, 6]")

    # 7. Check Binary Target
    invalid_targets = set(df["recovery_success"].unique()) - {0, 1}
    if invalid_targets:
        errors.append(f"Invalid target values (must be 0 or 1): {invalid_targets}")

    is_valid = len(errors) == 0
    return {
        "is_valid": is_valid,
        "num_records": len(df),
        "errors": errors,
        "class_distribution": df["recovery_success"].value_counts().to_dict() if "recovery_success" in df.columns else {},
    }
