"""
xMins Prediction Service
FastAPI microservice for predicting expected minutes using ML models
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import os

app = FastAPI(
    title="xMins Prediction Service",
    description="ML-based expected minutes prediction for FPL players",
    version="1.0.0",
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== Request/Response Models =====

class PredictionRequest(BaseModel):
    """Request for predicting xMins"""
    player_id: str
    horizon_weeks: int = 1  # How many weeks ahead to predict
    flags: Optional[Dict[str, bool]] = None  # e.g., {"exclude_injury": True}

class BatchPredictionRequest(BaseModel):
    """Batch prediction for multiple players"""
    players: List[PredictionRequest]

class PredictionResponse(BaseModel):
    """Single prediction output"""
    player_id: str
    gameweek: int
    start_prob: float
    xmins_start: float
    p90: float
    uncertainty_lo: Optional[float] = None
    uncertainty_hi: Optional[float] = None
    audit: Dict[str, any] = {}

class BatchPredictionResponse(BaseModel):
    """Batch prediction output"""
    predictions: List[PredictionResponse]
    model_version: str

class TrainRequest(BaseModel):
    """Request to retrain models"""
    convex_url: str
    force: bool = False  # Force retrain even if recently trained

class TrainResponse(BaseModel):
    """Training result"""
    success: bool
    model_version: str
    metrics: Dict[str, float]
    trained_at: str

class AuditRequest(BaseModel):
    """Request prediction audit trail"""
    player_id: str
    gameweek: int

class AuditResponse(BaseModel):
    """Audit trail for a prediction"""
    player_id: str
    gameweek: int
    model_version: str
    features_used: Dict[str, any]
    exclusions: List[str]
    priors_used: Optional[Dict[str, float]]
    confidence: str  # "high", "medium", "low"

# ===== Health Check =====

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "xMins Prediction",
        "version": "1.0.0",
    }

# ===== Prediction Endpoints =====

@app.post("/predict", response_model=PredictionResponse)
async def predict_single(request: PredictionRequest):
    """
    Predict xMins for a single player
    """
    try:
        # Import here to avoid circular dependencies
        from app.api.predict import predict_xmins

        prediction = await predict_xmins(
            player_id=request.player_id,
            horizon_weeks=request.horizon_weeks,
            flags=request.flags or {},
        )

        return prediction
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/batch", response_model=BatchPredictionResponse)
async def predict_batch(request: BatchPredictionRequest):
    """
    Predict xMins for multiple players in batch
    """
    try:
        from app.api.predict import batch_predict_xmins

        predictions = await batch_predict_xmins(request.players)

        return BatchPredictionResponse(
            predictions=predictions,
            model_version="1.0.0",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== Training Endpoints =====

@app.post("/train", response_model=TrainResponse)
async def train_models(request: TrainRequest):
    """
    Train or retrain the xMins models
    """
    try:
        from app.api.train import train_models as train_fn

        result = await train_fn(
            convex_url=request.convex_url,
            force=request.force,
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== Audit Endpoints =====

@app.get("/audit", response_model=AuditResponse)
async def get_audit_trail(player_id: str, gameweek: int):
    """
    Get audit trail for a prediction
    """
    try:
        from app.api.predict import get_prediction_audit

        audit = await get_prediction_audit(player_id, gameweek)

        return audit
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Audit not found: {str(e)}")

# ===== Model Info =====

@app.get("/models/info")
async def get_model_info():
    """
    Get information about loaded models
    """
    try:
        from app.models.start_probability import get_model_info as get_stage_a_info
        from app.models.minutes_given_start import get_model_info as get_stage_b_info

        return {
            "stage_a": get_stage_a_info(),
            "stage_b": get_stage_b_info(),
        }
    except Exception as e:
        return {
            "error": str(e),
            "models_loaded": False,
        }

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
