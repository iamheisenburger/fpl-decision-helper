"""
FPL ML Prediction Service
FastAPI application that serves trained ML models for minutes prediction.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
import json
from datetime import datetime


# Paths
MODEL_DIR = Path(__file__).parent / "models"
DATA_DIR = Path(__file__).parent / "data"

# Load models and metadata at startup
# Note: XGBoost doesn't need scalers (tree-based model)
try:
    start_model = joblib.load(MODEL_DIR / "start_model.pkl")
    minutes_model = joblib.load(MODEL_DIR / "minutes_model.pkl")

    with open(MODEL_DIR / "model_metadata.json", 'r') as f:
        metadata = json.load(f)

    print("[OK] Models loaded successfully!")
    print(f"   Model version: {metadata['model_version']}")
    print(f"   Trained at: {metadata['trained_at']}")

except Exception as e:
    print(f"[WARNING] Failed to load models: {e}")
    print("   Please run train_models.py first")
    start_model = None
    minutes_model = None
    metadata = None


# Initialize FastAPI app
app = FastAPI(
    title="FPL Minutes Prediction API",
    description="ML-powered predictions for FPL player minutes (xMins)",
    version="1.0.0",
)

# Enable CORS for Convex requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to Convex domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models for request/response
class Appearance(BaseModel):
    """Historical appearance data for a player"""
    gameweek: int
    season: str
    started: bool
    minutes: int
    injExit: Optional[bool] = False
    redCard: Optional[bool] = False
    date: int  # Unix timestamp
    homeAway: str


class PredictionRequest(BaseModel):
    """Request body for single player prediction"""
    playerId: str
    playerName: str
    position: str = Field(..., description="GK, DEF, MID, or FWD")
    team: str
    price: float
    gameweek: int
    isHome: bool = True
    appearances: List[Appearance] = Field(..., description="Recent appearances (up to 8 games)")


class PredictionResponse(BaseModel):
    """Response for single player prediction"""
    playerId: str
    gameweek: int
    startProb: float = Field(..., description="Probability of starting (0-1)")
    xMinsStart: float = Field(..., description="Expected minutes if starting")
    xMins: float = Field(..., description="Overall expected minutes (startProb × xMinsStart)")
    p90: float = Field(..., description="Probability of playing 90 minutes")
    uncertaintyLo: Optional[float] = None
    uncertaintyHi: Optional[float] = None
    source: str = "model"
    modelVersion: str
    flags: Dict = {}


class BatchPredictionRequest(BaseModel):
    """Request body for batch predictions"""
    players: List[PredictionRequest]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    modelVersion: Optional[str] = None
    modelType: Optional[str] = None
    trainedAt: Optional[str] = None
    uptime: str


# Helper functions
def engineer_features_from_appearances(
    appearances: List[Appearance],
    position: str,
    is_home: bool,
    gameweek: int,
    price: float,
    team: str
) -> Dict[str, float]:
    """
    Engineer features from raw appearance data.
    Matches feature_engineering.py logic with ALL 41 features.
    """
    if not appearances:
        # Return default features for new players
        return get_default_features(position, price)

    # Convert to DataFrame
    df = pd.DataFrame([a.dict() for a in appearances])
    df = df.sort_values('date')  # Sort by date (oldest first)

    # Recent form features (windows: 3, 5, 8)
    features = {}

    for window in [3, 5, 8]:
        recent = df.tail(window)

        features[f'avg_minutes_last_{window}'] = recent['minutes'].mean() if len(recent) > 0 else 0
        features[f'start_rate_last_{window}'] = recent['started'].mean() if len(recent) > 0 else 0
        features[f'consistency_last_{window}'] = recent['minutes'].std() if len(recent) > 1 else 0

        # Trend (linear regression slope)
        if len(recent) >= 2:
            x = np.arange(len(recent))
            y = recent['minutes'].values
            slope = np.polyfit(x, y, 1)[0]
            features[f'trend_last_{window}'] = slope
        else:
            features[f'trend_last_{window}'] = 0

    # Role lock detection (3+ consecutive 85+ starts)
    consecutive_85plus = 0
    for idx in range(len(df) - 1, -1, -1):
        row = df.iloc[idx]
        if row['started'] and row['minutes'] >= 85:
            consecutive_85plus += 1
        else:
            break

    features['consecutive_85plus'] = consecutive_85plus
    features['role_lock'] = 1 if consecutive_85plus >= 3 else 0

    # Lagged target (previous gameweek)
    prev_gw = df.iloc[-1] if len(df) > 0 else None
    features['prev_gw_minutes'] = prev_gw['minutes'] if prev_gw is not None else 0
    features['prev_gw_started'] = 1 if (prev_gw is not None and prev_gw['started']) else 0

    # Position (one-hot)
    features['pos_GK'] = 1 if position == 'GK' else 0
    features['pos_DEF'] = 1 if position == 'DEF' else 0
    features['pos_MID'] = 1 if position == 'MID' else 0
    features['pos_FWD'] = 1 if position == 'FWD' else 0

    # Temporal features
    features['gameweek_norm'] = gameweek / 38
    features['month_norm'] = datetime.now().month / 12

    # Match context
    features['is_home'] = 1 if is_home else 0

    # Attack features (last 5 games) - defaults to 0 since we don't have this data from Convex
    for window in [5]:
        features[f'goals_last_{window}'] = 0  # Would need goals data
        features[f'assists_last_{window}'] = 0  # Would need assists data
        features[f'xG_last_{window}'] = 0  # Would need xG data
        features[f'xA_last_{window}'] = 0  # Would need xA data
        features[f'goal_involvement_last_{window}'] = 0
        features[f'xGI_last_{window}'] = 0

    # Physical load features
    # Days since last game
    if len(df) > 0:
        last_game_date = df.iloc[-1]['date']
        current_timestamp = int(datetime.now().timestamp() * 1000)
        days_since = (current_timestamp - last_game_date) / (1000 * 60 * 60 * 24)
        features['days_since_last_game'] = max(0, days_since)
    else:
        features['days_since_last_game'] = 7  # Default to 1 week

    # Minutes in last 7 days
    if len(df) > 0:
        seven_days_ago = int(datetime.now().timestamp() * 1000) - (7 * 24 * 60 * 60 * 1000)
        recent_mins = df[df['date'] >= seven_days_ago]['minutes'].sum()
        features['minutes_last_7_days'] = recent_mins
    else:
        features['minutes_last_7_days'] = 0

    # Games in last 2 gameweeks
    if len(df) > 0:
        last_2_gw = df.tail(2)
        features['games_last_2_gw'] = len(last_2_gw)
    else:
        features['games_last_2_gw'] = 0

    # Team rotation rate (default 0.20 - would need historical team data)
    features['team_rotation_rate'] = 0.20  # Neutral default

    # Price normalization (range: £4.0 - £15.0)
    features['price_norm'] = (price - 4.0) / (15.0 - 4.0)

    # Quality features (defaults - would need ICT/influence/bonus from FPL API)
    features['ict_last_5'] = 0  # Would need ICT index data
    features['influence_last_5'] = 0  # Would need influence data
    features['bonus_last_5'] = 0  # Would need bonus points data

    # Scoreline features (defaults - would need match scores)
    features['goal_diff'] = 0  # Would need score data
    features['is_blowout'] = 0  # Would need score data

    # Outlier flags
    if prev_gw is not None:
        features['is_red_card'] = 1 if prev_gw.get('redCard', False) else 0
        features['is_early_injury_sub'] = 1 if prev_gw.get('injExit', False) else 0
    else:
        features['is_red_card'] = 0
        features['is_early_injury_sub'] = 0

    return features


def get_default_features(position: str, price: float) -> Dict[str, float]:
    """
    Return default features for new players with no history.
    Includes ALL 41 features with sensible defaults.
    """
    features = {
        # Recent form (all zeros for new players)
        'avg_minutes_last_3': 0, 'start_rate_last_3': 0, 'consistency_last_3': 0, 'trend_last_3': 0,
        'avg_minutes_last_5': 0, 'start_rate_last_5': 0, 'consistency_last_5': 0, 'trend_last_5': 0,
        'avg_minutes_last_8': 0, 'start_rate_last_8': 0, 'consistency_last_8': 0, 'trend_last_8': 0,

        # Role lock
        'consecutive_85plus': 0,
        'role_lock': 0,

        # Lagged target
        'prev_gw_minutes': 0,
        'prev_gw_started': 0,

        # Position
        'pos_GK': 1 if position == 'GK' else 0,
        'pos_DEF': 1 if position == 'DEF' else 0,
        'pos_MID': 1 if position == 'MID' else 0,
        'pos_FWD': 1 if position == 'FWD' else 0,

        # Temporal
        'gameweek_norm': 0,
        'month_norm': datetime.now().month / 12,

        # Match context
        'is_home': 1,

        # Attack features
        'goals_last_5': 0,
        'assists_last_5': 0,
        'xG_last_5': 0,
        'xA_last_5': 0,
        'goal_involvement_last_5': 0,
        'xGI_last_5': 0,

        # Physical load
        'days_since_last_game': 7,
        'minutes_last_7_days': 0,
        'games_last_2_gw': 0,

        # Manager rotation
        'team_rotation_rate': 0.20,

        # Price and quality
        'price_norm': (price - 4.0) / (15.0 - 4.0),
        'ict_last_5': 0,
        'influence_last_5': 0,
        'bonus_last_5': 0,

        # Scoreline
        'goal_diff': 0,
        'is_blowout': 0,

        # Outliers
        'is_red_card': 0,
        'is_early_injury_sub': 0,
    }

    return features


def predict_xmins(features: Dict[str, float]) -> Dict[str, float]:
    """
    Run two-stage ML prediction.

    XGBoost doesn't need feature scaling (tree-based model),
    so scalers are not used.

    Returns:
        Dictionary with startProb, xMinsStart, xMins, p90
    """
    if start_model is None or minutes_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")

    # Get feature order from metadata
    feature_names = metadata['feature_config']['start_features']

    # Create feature vector in correct order
    X = np.array([[features.get(f, 0) for f in feature_names]])

    # Stage 1: Predict start probability (XGBoost doesn't need scaling)
    start_proba = start_model.predict_proba(X)[0, 1]

    # Stage 2: Predict minutes if starting (XGBoost doesn't need scaling)
    minutes_if_started = minutes_model.predict(X)[0]
    minutes_if_started = np.clip(minutes_if_started, 0, 90)

    # Combined: xMins = P(start) × E[minutes | start]
    xmins = start_proba * minutes_if_started

    # Calculate P90 (probability of 90 minutes)
    # Use heuristic: if xMinsStart >= 85, high chance of 90
    if minutes_if_started >= 85:
        p90 = 0.85 * start_proba
    elif minutes_if_started >= 80:
        p90 = 0.60 * start_proba
    elif minutes_if_started >= 70:
        p90 = 0.35 * start_proba
    else:
        p90 = 0.10 * start_proba

    return {
        'startProb': float(start_proba),
        'xMinsStart': float(minutes_if_started),
        'xMins': float(xmins),
        'p90': float(p90),
    }


# API Endpoints
@app.get("/", response_model=Dict)
async def root():
    """Root endpoint with service info"""
    return {
        "service": "FPL Minutes Prediction API",
        "version": "1.0.0",
        "status": "healthy" if start_model is not None else "models_not_loaded",
        "endpoints": {
            "health": "GET /health",
            "predict": "POST /predict",
            "predict_batch": "POST /predict/batch",
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    if start_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")

    return HealthResponse(
        status="healthy",
        modelVersion=metadata.get('model_version'),
        modelType=metadata.get('model_type'),
        trainedAt=metadata.get('trained_at'),
        uptime=str(datetime.now()),
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Predict xMins for a single player.
    """
    try:
        # Engineer features (now with ALL 41 features)
        features = engineer_features_from_appearances(
            request.appearances,
            request.position,
            request.isHome,
            request.gameweek,
            request.price,
            request.team,
        )

        # Run prediction
        prediction = predict_xmins(features)

        # Build response
        return PredictionResponse(
            playerId=request.playerId,
            gameweek=request.gameweek,
            startProb=prediction['startProb'],
            xMinsStart=prediction['xMinsStart'],
            xMins=prediction['xMins'],
            p90=prediction['p90'],
            source="model",
            modelVersion=metadata['model_version'],
            flags={
                'sparse_data': len(request.appearances) < 5,
                'role_lock': features.get('role_lock', 0) == 1,
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/predict/batch", response_model=List[PredictionResponse])
async def predict_batch(request: BatchPredictionRequest):
    """
    Predict xMins for multiple players (batch processing).
    """
    results = []

    for player_req in request.players:
        try:
            pred = await predict(player_req)
            results.append(pred)
        except Exception as e:
            # Log error but continue with other players
            print(f"Failed to predict for {player_req.playerId}: {e}")
            continue

    return results


# Run with: uvicorn app:app --host 0.0.0.0 --port 8000
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
