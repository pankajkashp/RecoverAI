"""
RecoverAI — ML Dataset Unit & Integration Tests

Phase 6: ML/Data Intelligence Foundation
"""

import pandas as pd
import pytest
from ml.data.generate_dataset import generate_synthetic_dataset
from ml.data.validate_dataset import validate_dataset
from ml.data.split_dataset import split_data, PROCESSED_DIR


def test_generate_synthetic_dataset():
    df = generate_synthetic_dataset(num_samples=200, seed=123)
    assert len(df) == 200
    assert "payment_id" in df.columns
    assert "recovery_success" in df.columns
    assert set(df["recovery_success"].unique()).issubset({0, 1})
    assert (df["amount"] > 0).all()


def test_validate_valid_dataset():
    df = generate_synthetic_dataset(num_samples=100, seed=42)
    report = validate_dataset(df)
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert report["num_records"] == 100


def test_validate_missing_columns():
    df = pd.DataFrame({
        "payment_id": ["pay_01"],
        "amount": [100.0]
    })
    report = validate_dataset(df)
    assert report["is_valid"] is False
    assert any("Missing required columns" in err for err in report["errors"])


def test_validate_negative_amounts():
    df = generate_synthetic_dataset(num_samples=50, seed=42)
    df.loc[0, "amount"] = -500.0
    report = validate_dataset(df)
    assert report["is_valid"] is False
    assert any("non-positive monetary amounts" in err for err in report["errors"])


def test_validate_duplicate_ids():
    df = generate_synthetic_dataset(num_samples=50, seed=42)
    df.loc[1, "payment_id"] = df.loc[0, "payment_id"]
    report = validate_dataset(df)
    assert report["is_valid"] is False
    assert any("duplicate payment_id" in err for err in report["errors"])


def test_validate_invalid_target():
    df = generate_synthetic_dataset(num_samples=50, seed=42)
    df.loc[0, "recovery_success"] = 5
    report = validate_dataset(df)
    assert report["is_valid"] is False
    assert any("Invalid target values" in err for err in report["errors"])


def test_dataset_split_proportions(tmp_path):
    df_raw = generate_synthetic_dataset(num_samples=1000, seed=42)
    raw_csv = tmp_path / "raw.csv"
    out_dir = tmp_path / "processed"
    df_raw.to_csv(raw_csv, index=False)

    train_df, val_df, test_df = split_data(
        raw_path=str(raw_csv),
        output_dir=str(out_dir),
        seed=42
    )

    assert len(train_df) == 700
    assert len(val_df) == 150
    assert len(test_df) == 150

    # Test set isolation (no ID overlap)
    train_ids = set(train_df["payment_id"])
    val_ids = set(val_df["payment_id"])
    test_ids = set(test_df["payment_id"])

    assert len(train_ids.intersection(val_ids)) == 0
    assert len(train_ids.intersection(test_ids)) == 0
    assert len(val_ids.intersection(test_ids)) == 0
