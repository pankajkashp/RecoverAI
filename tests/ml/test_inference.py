"""
RecoverAI — FastAPI ML Service Inference Tests

Phase 6: ML/Data Intelligence Foundation
"""

import pytest
from starlette.testclient import TestClient
from app.ml_service.main import app
from ml.training.train import MODEL_VERSION

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "recoverai-ml-service"
    assert data["modelVersion"] == MODEL_VERSION


def test_predict_insufficient_funds():
    payload = {
        "amount": 3500.0,
        "currency": "INR",
        "payment_method": "UPI",
        "failure_category": "INSUFFICIENT_FUNDS",
        "failure_classification": "TEMPORARY",
        "provider_type": "DEMO",
        "event_hour": 14,
        "day_of_week": 2,
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["modelVersion"] == MODEL_VERSION
    assert 0.0 <= data["recoveryProbability"] <= 1.0
    assert data["prediction"] in [0, 1]
    assert 0.0 <= data["confidence"] <= 1.0
    assert data["isSyntheticDevelopmentModel"] is True


def test_predict_card_failure():
    payload = {
        "amount": 12000.0,
        "currency": "INR",
        "payment_method": "CARD",
        "failure_category": "CARD",
        "failure_classification": "PERMANENT",
        "provider_type": "DEMO",
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["modelVersion"] == MODEL_VERSION
    assert 0.0 <= data["recoveryProbability"] <= 1.0
    assert data["prediction"] in [0, 1]


def test_predict_validation_error_negative_amount():
    payload = {
        "amount": -50.0,  # Invalid amount
        "failure_category": "INSUFFICIENT_FUNDS",
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 422  # Unprocessable Entity / Validation Error


def test_predict_validation_error_missing_category():
    payload = {
        "amount": 500.0,
        # Missing required failure_category
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 422
