"""
RecoverAI — Model Evaluation Module

Phase 6: ML/Data Intelligence Foundation

Evaluates the baseline LogisticRegression model on isolated validation and test datasets.
Computes:
- Accuracy, Precision, Recall, F1 Score, ROC-AUC
- Confusion Matrix
- Class Distribution
- Comparison against Phase 5 deterministic baseline
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

from ml.features.pipeline import FEATURE_COLUMNS
from ml.data.split_dataset import PROCESSED_DIR
from ml.training.train import MODEL_ARTIFACT_PATH, MODEL_VERSION

EVALUATION_DIR = os.path.dirname(__file__)
REPORT_PATH = os.path.join(EVALUATION_DIR, "evaluation_report.json")


def compute_metrics(y_true, y_pred, y_prob) -> Dict[str, Any]:
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4),
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp),
        },
        "support": {
            "total": len(y_true),
            "positive_cases": int(np.sum(y_true)),
            "negative_cases": int(np.sum(1 - np.array(y_true))),
        }
    }


def evaluate_model(
    model_path: str = MODEL_ARTIFACT_PATH,
    val_path: str = os.path.join(PROCESSED_DIR, "val.csv"),
    test_path: str = os.path.join(PROCESSED_DIR, "test.csv"),
    report_output_path: str = REPORT_PATH,
) -> Dict[str, Any]:
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model artifact not found at {model_path}. Train model first.")

    model = joblib.load(model_path)

    val_df = pd.read_csv(val_path)
    test_df = pd.read_csv(test_path)

    X_val, y_val = val_df[FEATURE_COLUMNS], val_df["recovery_success"]
    X_test, y_test = test_df[FEATURE_COLUMNS], test_df["recovery_success"]

    # Predictions & Probabilities
    val_pred = model.predict(X_val)
    val_prob = model.predict_proba(X_val)[:, 1]

    test_pred = model.predict(X_test)
    test_prob = model.predict_proba(X_test)[:, 1]

    val_metrics = compute_metrics(y_val, val_pred, val_prob)
    test_metrics = compute_metrics(y_test, test_pred, test_prob)

    report = {
        "model_version": MODEL_VERSION,
        "evaluation_dataset": "synthetic_payment_recovery_dataset",
        "is_synthetic_development_evaluation": True,
        "validation_metrics": val_metrics,
        "test_metrics": test_metrics,
        "precision_recall_tradeoff_analysis": {
            "business_impact": "In payment recovery, False Positives trigger automated retries on unrecoverable payments (incurring gateway retry fees or customer friction), whereas False Negatives miss potentially recoverable revenue.",
            "recommendation": "For initial development, balanced F1 / ROC-AUC is prioritized. When migrating to production with real provider retry fees, the decision threshold can be tuned based on unit economics.",
        },
        "baseline_comparison": {
            "deterministic_phase5_rules": "Deterministic rules map INSUFFICIENT_FUNDS/NETWORK/PROVIDER -> RECOVER, CARD -> DO_NOT_RECOVER, and AUTHENTICATION/UNKNOWN -> REVIEW.",
            "ml_baseline_behavior": "Logistic Regression learns smooth continuous probabilities across combinations of amount, hour, category, and payment method without hardcoded thresholding.",
            "status": "Phase 5 rules remain authoritative for production payment pipeline. ML model serves as independent shadow/experimental baseline."
        },
        "limitations": [
            "Trained and evaluated exclusively on synthetic data with modeled distributions.",
            "Does not reflect real-world seasonal shifts, provider latency spikes, or real customer repayment behavior.",
            "Must be re-evaluated on historical production logs prior to any production decision-making."
        ]
    }

    os.makedirs(os.path.dirname(report_output_path), exist_ok=True)
    with open(report_output_path, "w") as f:
        json.dump(report, f, indent=2)

    print("=" * 60)
    print(f"📊 RecoverAI ML Evaluation Report ({MODEL_VERSION})")
    print("=" * 60)
    print(f"Validation Test Set ({val_metrics['support']['total']} samples):")
    print(f"  Accuracy:  {val_metrics['accuracy']:.4f}")
    print(f"  Precision: {val_metrics['precision']:.4f}")
    print(f"  Recall:    {val_metrics['recall']:.4f}")
    print(f"  F1 Score:  {val_metrics['f1_score']:.4f}")
    print(f"  ROC-AUC:   {val_metrics['roc_auc']:.4f}")
    print("-" * 60)
    print(f"Isolated Test Set ({test_metrics['support']['total']} samples):")
    print(f"  Accuracy:  {test_metrics['accuracy']:.4f}")
    print(f"  Precision: {test_metrics['precision']:.4f}")
    print(f"  Recall:    {test_metrics['recall']:.4f}")
    print(f"  F1 Score:  {test_metrics['f1_score']:.4f}")
    print(f"  ROC-AUC:   {test_metrics['roc_auc']:.4f}")
    print("=" * 60)

    return report


if __name__ == "__main__":
    evaluate_model()
