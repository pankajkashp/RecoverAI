"""
RecoverAI — Dataset Splitter

Phase 6: ML/Data Intelligence Foundation

Splits raw dataset into:
- 70% Training set
- 15% Validation set
- 15% Test set

Uses fixed random seed (42) and target stratification for reproducibility.
"""

import os
import pandas as pd
from sklearn.model_selection import train_test_split
from ml.data.validate_dataset import validate_dataset

RANDOM_SEED = 42
BASE_DIR = os.path.dirname(__file__)
RAW_PATH = os.path.join(BASE_DIR, "raw", "synthetic_payment_recovery_dataset.csv")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed")


def split_data(
    raw_path: str = RAW_PATH,
    output_dir: str = PROCESSED_DIR,
    seed: int = RANDOM_SEED,
):
    df = pd.read_csv(raw_path)
    val_report = validate_dataset(df)
    if not val_report["is_valid"]:
        raise ValueError(f"Dataset validation failed before split: {val_report['errors']}")

    # 70% train, 30% temp
    train_df, temp_df = train_test_split(
        df,
        test_size=0.30,
        random_state=seed,
        stratify=df["recovery_success"]
    )

    # Split 30% temp into 15% val and 15% test (50/50 split of temp)
    val_df, test_df = train_test_split(
        temp_df,
        test_size=0.50,
        random_state=seed,
        stratify=temp_df["recovery_success"]
    )

    os.makedirs(output_dir, exist_ok=True)
    train_path = os.path.join(output_dir, "train.csv")
    val_path = os.path.join(output_dir, "val.csv")
    test_path = os.path.join(output_dir, "test.csv")

    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)

    print(f"✅ Split completed successfully:")
    print(f"  - Train: {len(train_df)} rows ({len(train_df)/len(df):.1%}) -> {train_path}")
    print(f"  - Val:   {len(val_df)} rows ({len(val_df)/len(df):.1%}) -> {val_path}")
    print(f"  - Test:  {len(test_df)} rows ({len(test_df)/len(df):.1%}) -> {test_path}")

    return train_df, val_df, test_df


if __name__ == "__main__":
    split_data()
