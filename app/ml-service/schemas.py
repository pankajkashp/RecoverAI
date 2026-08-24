"""
RecoverAI ML Service — Pydantic Schemas

Phase 6: ML/Data Intelligence Foundation

Defines the API contract for ML inference.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class PredictionRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Transaction amount in standard monetary unit")
    currency: str = Field(default="INR", description="ISO 3-letter currency code")
    payment_method: str = Field(default="OTHER", description="Payment method (CARD, UPI, NETBANKING, WALLET, etc.)")
    failure_category: str = Field(..., description="Normalized failure category from Phase 4")
    failure_classification: Optional[str] = Field(default="UNKNOWN", description="TEMPORARY, PERMANENT, or UNKNOWN")
    provider_type: Optional[str] = Field(default="DEMO", description="Provider identifier (DEMO, RAZORPAY, STRIPE)")
    event_hour: Optional[int] = Field(default=12, ge=0, le=23, description="Hour of the event (0-23)")
    day_of_week: Optional[int] = Field(default=2, ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")


class PredictionResponse(BaseModel):
    modelVersion: str = Field(..., description="Active version of the ML model")
    recoveryProbability: float = Field(..., ge=0.0, le=1.0, description="Estimated probability that recovery will succeed")
    prediction: Literal[0, 1] = Field(..., description="Binary recovery prediction (1 = Likely Recoverable, 0 = Unlikely)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the binary prediction")
    isSyntheticDevelopmentModel: bool = Field(default=True, description="Flag indicating model is trained on synthetic development data")


class HealthResponse(BaseModel):
    status: str
    service: str
    modelVersion: str
