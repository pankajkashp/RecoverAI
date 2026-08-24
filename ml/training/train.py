"""
RecoverAI — Baseline Model Training Module

Phase 6: ML/Data Intelligence Foundation

Trains the baseline LogisticRegression model for recovery success probability prediction.
Produces versioned model artifact: recovery_success_v1.
"""

import os
import json
import joblib
import pandas as pd
from datetime import datetime, timezone
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

from ml.features.pipeline import (
    FeatureDataFramePreparer,
    build_preprocessor,
    FEATURE_COLUMNS,
)
from ml.data.generate_dataset import generate_synthetic_dataset, RAW_DATA_PATH
from ml.data.split_dataset import split_data, PROCESSED_DIR

MODEL_VERSION = "recovery_success_v1"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_ARTIFACT_PATH = os.path.join(MODELS_DIR, f"{MODEL_VERSION}.joblib")
METADATA_PATH = os.path.join(MODELS_DIR, f"{MODEL_VERSION}_metadata.json")


def train_baseline_model(
    train_path: str = os.path.join(PROCESSED_DIR, "train.csv"),
    model_output_path: str = MODEL_ARTIFACT_PATH,
    metadata_output_path: str = METADATA_PATH,
    random_seed: int = 42,
) -> Pipeline:
    # Check if processed train data exists; if not, generate and split
    if not os.path.exists(train_path):
        print("Processed training data not found. Generating and splitting...")
        if not os.path.exists(RAW_DATA_PATH):
            df_raw = generate_synthetic_dataset(seed=random_seed)
            os.makedirs(os.path.dirname(RAW_DATA_PATH), exist_ok=True)
            df_raw.to_csv(RAW_DATA_PATH, index=False)
        split_data(seed=random_seed)

    train_df = pd.read_csv(train_path)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["recovery_success"]

    # Composite pipeline containing feature preparation, transformation, and classifier
    model_pipeline = Pipeline([
        ("preparer", FeatureDataFramePreparer()),
        ("preprocessor", build_preprocessor()),
        ("classifier", LogisticRegression(
            C=1.0,
            solver="lbfgs",
            max_iter=1000,
            random_state=random_seed
        ))
    ])

    print(f"Training baseline model ({MODEL_VERSION}) on {len(X_train)} samples...")
    model_pipeline.fit(X_train, y_train)

    # Save model artifact
    os.makedirs(os.path.dirname(model_output_path), exist_ok=True)
    joblib.dump(model_pipeline, model_output_path)

    # Save versioned metadata
    metadata = {
        "model_version": MODEL_VERSION,
        "model_type": "LogisticRegression",
        "library": "scikit-learn",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": random_seed,
        "hyperparameters": {
            "C": 1.0,
            "solver": "lbfgs",
            "max_iter": 1000,
            "penalty": "l2",
        },
        "training_data": {
            "source": "synthetic_payment_recovery_dataset.csv",
            "num_training_samples": len(X_train),
            "feature_columns": FEATURE_COLUMNS,
            "target_column": "recovery_success",
            "class_distribution": y_train.value_counts(normalize=True).to_dict(),
        },
        "is_synthetic_development_model": True,
        "notes": "Baseline model trained on synthetic development data. Not calibrated for real-world production performance."
    }

    with open(metadata_output_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Baseline model saved to: {model_output_path}")
    print(f"✅ Model metadata saved to: {metadata_output_path}")

    return model_pipeline


if __name__ == "__main__":
    train_baseline_model()
