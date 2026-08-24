"""
RecoverAI — ML Evaluation Tests

Phase 6: ML/Data Intelligence Foundation
"""

import os
import json
import pytest
from ml.evaluation.evaluate import evaluate_model, compute_metrics


def test_compute_metrics():
    y_true = [1, 0, 1, 1, 0, 0, 1, 0]
    y_pred = [1, 0, 1, 0, 0, 1, 1, 0]
    y_prob = [0.9, 0.1, 0.8, 0.4, 0.2, 0.6, 0.85, 0.15]

    metrics = compute_metrics(y_true, y_pred, y_prob)

    assert "accuracy" in metrics
    assert "precision" in metrics
    assert "recall" in metrics
    assert "f1_score" in metrics
    assert "roc_auc" in metrics
    assert "confusion_matrix" in metrics
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert 0.0 <= metrics["roc_auc"] <= 1.0


def test_evaluate_model_generates_report(tmp_path):
    report_file = tmp_path / "report.json"

    report = evaluate_model(report_output_path=str(report_file))

    assert os.path.exists(report_file)
    assert report["is_synthetic_development_evaluation"] is True
    assert "validation_metrics" in report
    assert "test_metrics" in report
    assert "precision_recall_tradeoff_analysis" in report
    assert "limitations" in report
