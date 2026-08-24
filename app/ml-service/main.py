"""
RecoverAI ML Service — FastAPI Application

Phase 6: ML/Data Intelligence Foundation

Provides isolated, RESTful inference endpoint for recovery success prediction.
"""

import os
import joblib
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status

try:
    from .schemas import PredictionRequest, PredictionResponse, HealthResponse
except ImportError:
    from schemas import PredictionRequest, PredictionResponse, HealthResponse

from ml.training.train import MODEL_ARTIFACT_PATH, MODEL_VERSION, train_baseline_model

model_pipeline = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model_pipeline
    if not os.path.exists(MODEL_ARTIFACT_PATH):
        print(f"Model artifact not found at {MODEL_ARTIFACT_PATH}. Training baseline...")
        train_baseline_model()

    model_pipeline = joblib.load(MODEL_ARTIFACT_PATH)
    print(f"✅ Loaded ML Model ({MODEL_VERSION}) into memory.")
    yield


app = FastAPI(
    title="RecoverAI ML Service",
    description="Machine Learning service for recovery probability prediction",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health():
    return {
        "status": "ok",
        "service": "recoverai-ml-service",
        "modelVersion": MODEL_VERSION,
    }


@app.post("/predict", response_model=PredictionResponse, status_code=status.HTTP_200_OK)
def predict(request: PredictionRequest):
    global model_pipeline
    if model_pipeline is None:
        if os.path.exists(MODEL_ARTIFACT_PATH):
            model_pipeline = joblib.load(MODEL_ARTIFACT_PATH)
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Model artifact is not loaded or available.",
            )

    try:
        # Prepare input dictionary for feature pipeline
        input_data = {
            "amount": request.amount,
            "currency": request.currency,
            "payment_method": request.payment_method,
            "failure_category": request.failure_category,
            "failure_classification": request.failure_classification,
            "provider_type": request.provider_type,
            "event_hour": request.event_hour,
            "day_of_week": request.day_of_week,
        }

        input_df = pd.DataFrame([input_data])

        # Predict probability & binary decision
        prob = float(model_pipeline.predict_proba(input_df)[0][1])
        prediction = 1 if prob >= 0.5 else 0
        confidence = float(prob if prediction == 1 else (1.0 - prob))

        return {
            "modelVersion": MODEL_VERSION,
            "recoveryProbability": round(prob, 4),
            "prediction": prediction,
            "confidence": round(confidence, 4),
            "isSyntheticDevelopmentModel": True,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Inference failed: {str(e)}",
        )
