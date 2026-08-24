"""
RecoverAI — Unified Feature Engineering Pipeline

Phase 6: ML/Data Intelligence Foundation

Provides deterministic, unified feature processing for both training and inference.
Guarantees zero target leakage and identical feature representations across environments.
"""

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.base import BaseEstimator, TransformerMixin

FEATURE_COLUMNS = [
    "provider_type",
    "amount",
    "currency",
    "payment_method",
    "failure_category",
    "failure_classification",
    "event_hour",
    "day_of_week",
]

CATEGORICAL_FEATURES = [
    "provider_type",
    "currency",
    "payment_method",
    "failure_category",
    "failure_classification",
]

NUMERICAL_FEATURES = [
    "amount_log",
    "event_hour",
    "day_of_week",
]


class LogTransformer(BaseEstimator, TransformerMixin):
    """Applies log1p transformation to monetary amounts."""
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        return np.log1p(np.maximum(X_df.values, 0))


class FeatureDataFramePreparer(BaseEstimator, TransformerMixin):
    """
    Extracts and prepares input raw feature columns into structured DataFrame.
    Calculates derived features such as amount_log.
    """
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if isinstance(X, dict):
            df = pd.DataFrame([X])
        elif isinstance(X, list):
            df = pd.DataFrame(X)
        elif isinstance(X, pd.DataFrame):
            df = X.copy()
        else:
            df = pd.DataFrame(X)

        # Ensure default values for optional/derived features
        if "event_hour" not in df.columns:
            df["event_hour"] = 12
        if "day_of_week" not in df.columns:
            df["day_of_week"] = 2
        if "provider_type" not in df.columns:
            df["provider_type"] = "DEMO"
        if "currency" not in df.columns:
            df["currency"] = "INR"
        if "payment_method" not in df.columns:
            df["payment_method"] = "OTHER"
        if "failure_classification" not in df.columns:
            df["failure_classification"] = "UNKNOWN"

        df["amount_log"] = np.log1p(np.maximum(df["amount"].astype(float), 0))
        return df


def build_preprocessor() -> ColumnTransformer:
    """
    Builds the ColumnTransformer preprocessor for numerical and categorical features.
    """
    cat_pipeline = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    num_pipeline = StandardScaler()

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", num_pipeline, NUMERICAL_FEATURES),
            ("cat", cat_pipeline, CATEGORICAL_FEATURES),
        ],
        remainder="drop"
    )

    return preprocessor
