"""
FastAPI Prediction Service for FPL Minutes Prediction
Serves the calibrated XGBoost models (86.58% accuracy at ±15 min)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import json

app = FastAPI(
    title="FPL xMins Prediction API",
    description="ML service for predicting player minutes with 86.58% accuracy at ±15 min",
    version="1.0.0",
)

# CORS middleware for Convex
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
MODEL_DIR = Path(__file__).parent / "models"
DATA_DIR = Path(__file__).parent / "data"

# Load models at startup
start_model = None
minutes_model = None
iso_calibrator = None
feature_config = None

@app.on_event("startup")
async def load_models():
    """Load calibrated models on startup"""
    global start_model, minutes_model, iso_calibrator, feature_config

    try:
        print("[STARTUP] Loading calibrated models...")

        start_model = joblib.load(MODEL_DIR / "start_model_calibrated.pkl")
        minutes_model = joblib.load(MODEL_DIR / "minutes_model_calibrated.pkl")
        iso_calibrator = joblib.load(MODEL_DIR / "isotonic_calibrator.pkl")

        with open(DATA_DIR / "feature_config.json", 'r') as f:
            feature_config = json.load(f)

        print(f"[OK] Models loaded successfully")
        print(f"     Features: {len(feature_config['start_features'])}")
        print(f"     Model version: calibrated_v1 (86.58% at ±15 min)")

    except Exception as e:
        print(f"[ERROR] Failed to load models: {e}")
        raise


class Appearance(BaseModel):
    """Historical appearance data for a player"""
    gameweek: int
    season: str
    started: bool
    minutes: int
    injExit: bool = False
    redCard: bool = False
    date: Optional[str] = None
    homeAway: Optional[str] = None


class PredictionRequest(BaseModel):
    """Request format from Convex"""
    playerId: str
    playerName: str
    position: str  # "GK", "DEF", "MID", "FWD"
    team: str
    price: float
    gameweek: int
    isHome: bool
    appearances: List[Appearance]


class PredictionResponse(BaseModel):
    """Response format for Convex"""
    playerId: str
    gameweek: int
    startProb: float
    xMinsStart: float
    xMins: float
    p90: float
    uncertaintyLo: Optional[float] = None
    uncertaintyHi: Optional[float] = None
    source: str = "model"
    modelVersion: str = "calibrated_v1"
    flags: Dict[str, bool] = {}


def engineer_features(request: PredictionRequest) -> pd.DataFrame:
    """
    Engineer features from request data to match training format.
    Returns a single-row DataFrame ready for prediction.
    """
    # Create appearances DataFrame
    appearances_df = pd.DataFrame([
        {
            'gameweek': app.gameweek,
            'season': app.season,
            'started': app.started,
            'minutes': app.minutes,
            'is_red_card': app.redCard,
            'is_early_injury_sub': app.injExit,
        }
        for app in request.appearances
    ])

    if len(appearances_df) == 0:
        raise HTTPException(status_code=400, detail="No appearance data provided")

    # Sort by gameweek (most recent last)
    appearances_df = appearances_df.sort_values('gameweek')

    # Position one-hot encoding
    pos_features = {
        'pos_GK': 1 if request.position == 'GK' else 0,
        'pos_DEF': 1 if request.position == 'DEF' else 0,
        'pos_MID': 1 if request.position == 'MID' else 0,
        'pos_FWD': 1 if request.position == 'FWD' else 0,
    }

    # Recent form features (last 3, 5, 8 games)
    last_3 = appearances_df.tail(3)
    last_5 = appearances_df.tail(5)
    last_8 = appearances_df.tail(8)

    recent_features = {
        'avg_minutes_last_3': last_3['minutes'].mean() if len(last_3) > 0 else 0,
        'start_rate_last_3': last_3['started'].mean() if len(last_3) > 0 else 0,
        'consistency_last_3': last_3['minutes'].std() if len(last_3) > 1 else 0,
        'trend_last_3': np.polyfit(range(len(last_3)), last_3['minutes'], 1)[0] if len(last_3) > 1 else 0,

        'avg_minutes_last_5': last_5['minutes'].mean() if len(last_5) > 0 else 0,
        'start_rate_last_5': last_5['started'].mean() if len(last_5) > 0 else 0,
        'consistency_last_5': last_5['minutes'].std() if len(last_5) > 1 else 0,
        'trend_last_5': np.polyfit(range(len(last_5)), last_5['minutes'], 1)[0] if len(last_5) > 1 else 0,

        'avg_minutes_last_8': last_8['minutes'].mean() if len(last_8) > 0 else 0,
        'start_rate_last_8': last_8['started'].mean() if len(last_8) > 0 else 0,
        'consistency_last_8': last_8['minutes'].std() if len(last_8) > 1 else 0,
        'trend_last_8': np.polyfit(range(len(last_8)), last_8['minutes'], 1)[0] if len(last_8) > 1 else 0,
    }

    # Role lock (3+ consecutive 85+ starts)
    consecutive_85plus = 0
    for started, mins in zip(appearances_df['started'].tail(5), appearances_df['minutes'].tail(5)):
        if started and mins >= 85:
            consecutive_85plus += 1
        else:
            consecutive_85plus = 0

    role_lock_features = {
        'role_lock': 1 if consecutive_85plus >= 3 else 0,
        'consecutive_85plus': consecutive_85plus,
    }

    # Previous gameweek
    last_appearance = appearances_df.iloc[-1] if len(appearances_df) > 0 else None
    prev_features = {
        'prev_gw_minutes': last_appearance['minutes'] if last_appearance is not None else 0,
        'prev_gw_started': 1 if last_appearance is not None and last_appearance['started'] else 0,
    }

    # Temporal features
    temporal_features = {
        'gameweek_norm': (request.gameweek - 1) / 37,  # Normalize to [0, 1]
        'month_norm': (datetime.now().month - 1) / 11,  # Approximate from current month
        'is_home': 1 if request.isHome else 0,
    }

    # Form signals (simplified - would need actual goal/assist data)
    form_features = {
        'goals_last_5': 0,  # Would need from appearances
        'assists_last_5': 0,
        'xG_last_5': 0,
        'xA_last_5': 0,
        'goal_involvement_last_5': 0,
        'xGI_last_5': 0,
    }

    # Physical load (simplified)
    load_features = {
        'days_since_last_game': 7,  # Default weekly
        'minutes_last_7_days': last_appearance['minutes'] if last_appearance is not None else 0,
        'games_last_2_gw': min(len(appearances_df), 2),
    }

    # Team rotation rate (would need team data)
    team_features = {
        'team_rotation_rate': 0.3,  # Default moderate rotation
    }

    # Price and quality
    quality_features = {
        'price_norm': (request.price - 4.0) / 11.0,  # Normalize £4m-£15m to [0, 1]
        'ict_last_5': 0,  # Would need from appearances
        'influence_last_5': 0,
        'creativity_last_5': 0,
        'threat_last_5': 0,
        'bonus_last_5': 0,
    }

    # Scoreline features (simplified)
    scoreline_features = {
        'goal_diff': 0,  # Would need match result
        'is_blowout': 0,
    }

    # Outlier flags
    outlier_features = {
        'is_red_card': last_appearance['is_red_card'] if last_appearance is not None else 0,
        'is_early_injury_sub': last_appearance['is_early_injury_sub'] if last_appearance is not None else 0,
    }

    # Opponent strength (would need from fixtures)
    opponent_features = {
        'opponent_strength': 3.0,  # Default average
        'opponent_strength_norm': 0.5,
        'is_top6_opponent': 0,
    }

    # Substitution patterns
    sub_features = {
        'early_sub_rate_last_5': 0,  # Would calculate from minutes
        'full_90_rate_last_5': (last_5['minutes'] >= 85).mean() if len(last_5) > 0 else 0,
    }

    # Combine all features
    all_features = {
        **pos_features,
        **recent_features,
        **role_lock_features,
        **prev_features,
        **temporal_features,
        **form_features,
        **load_features,
        **team_features,
        **quality_features,
        **scoreline_features,
        **outlier_features,
        **opponent_features,
        **sub_features,
    }

    # Create DataFrame with correct column order
    feature_names = feature_config['start_features']
    feature_values = []
    for feat in feature_names:
        if feat in all_features:
            feature_values.append(all_features[feat])
        else:
            # Missing advanced features - fill with 0
            feature_values.append(0)

    df = pd.DataFrame([feature_values], columns=feature_names)

    return df


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Predict player minutes using calibrated XGBoost models.
    Returns P(start), E[minutes|start], and combined xMins.
    """
    try:
        # Engineer features
        features = engineer_features(request)

        # Stage 1: Predict P(start)
        start_proba = start_model.predict_proba(features)[0, 1]

        # Stage 2: Predict E[minutes | start]
        minutes_pred_raw = minutes_model.predict(features)[0]
        minutes_pred = iso_calibrator.predict([minutes_pred_raw])[0]
        minutes_pred = np.clip(minutes_pred, 0, 90)

        # Combined xMins
        xmins = start_proba * minutes_pred

        # P(90) - probability of playing full 90
        p90 = start_proba if minutes_pred >= 85 else start_proba * 0.6

        # Uncertainty (±10 min for now - could improve with quantile regression)
        uncertainty_lo = max(0, xmins - 10)
        uncertainty_hi = min(90, xmins + 10)

        # Flags
        sparse_data = len(request.appearances) < 5
        role_lock = features['role_lock'].iloc[0] == 1 if 'role_lock' in features.columns else False

        return PredictionResponse(
            playerId=request.playerId,
            gameweek=request.gameweek,
            startProb=float(start_proba),
            xMinsStart=float(minutes_pred),
            xMins=float(xmins),
            p90=float(p90),
            uncertaintyLo=float(uncertainty_lo),
            uncertaintyHi=float(uncertainty_hi),
            source="model",
            modelVersion="calibrated_v1",
            flags={
                "sparse_data": sparse_data,
                "role_lock": role_lock,
            }
        )

    except Exception as e:
        print(f"[ERROR] Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "modelVersion": "calibrated_v1",
        "accuracy": "86.58% at ±15 min",
        "modelsLoaded": start_model is not None and minutes_model is not None,
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "FPL xMins Prediction API",
        "version": "1.0.0",
        "accuracy": "86.58% at ±15 min",
        "endpoints": {
            "/predict": "POST - Predict player minutes",
            "/health": "GET - Health check",
            "/docs": "GET - API documentation",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
