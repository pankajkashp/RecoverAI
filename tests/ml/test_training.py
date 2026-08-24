"""
RecoverAI — ML Model Training Tests

Phase 6: ML/Data Intelligence Foundation
"""

import os
import json
import joblib
import pandas as pd
import pytest
from ml.training.train import train_baseline_model, MODEL_VERSION


def test_train_baseline_model_produces_artifacts(tmp_path):
    model_file = tmp_path / f"{MODEL_VERSION}.joblib"
    meta_file = tmp_path / f"{MODEL_VERSION}_metadata.json"

    # Train on existing processed train set
    model = train_baseline_model(
        model_output_path=str(model_file),
        metadata_output_path=str(meta_file),
        random_seed=42,
    )

    assert os.path.exists(model_file)
    assert os.path.exists(meta_file)

    # Load and check artifact
    loaded_model = joblib.load(model_file)
    assert hasattr(loaded_model, "predict")
    assert hasattr(loaded_model, "predict_proba")

    # Check metadata
    with open(meta_file) as f:
        meta = json.load(f)

    assert meta["model_version"] == MODEL_VERSION
    assert meta["model_type"] == "LogisticRegression"
    assert meta["is_synthetic_development_model"] is True
