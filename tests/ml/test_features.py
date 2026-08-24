"""
RecoverAI — Feature Pipeline Tests

Phase 6: ML/Data Intelligence Foundation
"""

import numpy as np
import pandas as pd
import pytest
from ml.features.pipeline import (
    FeatureDataFramePreparer,
    build_preprocessor,
    FEATURE_COLUMNS,
)


def test_feature_preparer_dictionary_input():
    preparer = FeatureDataFramePreparer()
    raw = {
        "amount": 2500.0,
        "currency": "INR",
        "payment_method": "UPI",
        "failure_category": "INSUFFICIENT_FUNDS",
        "failure_classification": "TEMPORARY",
    }
    df = preparer.transform(raw)
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 1
    assert "amount_log" in df.columns
    assert np.isclose(df["amount_log"].iloc[0], np.log1p(2500.0))
    assert df["event_hour"].iloc[0] == 12  # default


def test_feature_preprocessor_transformation():
    preparer = FeatureDataFramePreparer()
    preprocessor = build_preprocessor()

    data = pd.DataFrame([
        {
            "amount": 1000.0,
            "currency": "INR",
            "payment_method": "UPI",
            "failure_category": "INSUFFICIENT_FUNDS",
            "failure_classification": "TEMPORARY",
            "provider_type": "DEMO",
            "event_hour": 14,
            "day_of_week": 3,
        },
        {
            "amount": 5000.0,
            "currency": "USD",
            "payment_method": "CARD",
            "failure_category": "CARD",
            "failure_classification": "PERMANENT",
            "provider_type": "STRIPE",
            "event_hour": 8,
            "day_of_week": 0,
        },
    ])

    prepared = preparer.transform(data)
    transformed = preprocessor.fit_transform(prepared)

    assert isinstance(transformed, np.ndarray)
    assert transformed.shape[0] == 2
    assert transformed.shape[1] > len(FEATURE_COLUMNS)  # One-hot encoded features expand dimensions


def test_no_target_leakage():
    # Verify that target label 'recovery_success' and IDs are not in FEATURE_COLUMNS
    assert "recovery_success" not in FEATURE_COLUMNS
    assert "payment_id" not in FEATURE_COLUMNS
    assert "company_id" not in FEATURE_COLUMNS
