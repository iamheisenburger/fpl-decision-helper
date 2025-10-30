"""
Prediction API
Orchestrates Stage A and Stage B models to generate xMins predictions
"""

import pandas as pd
from typing import Dict, List, Optional
from app.models.start_probability import get_model as get_stage_a_model
from app.models.minutes_given_start import get_model as get_stage_b_model
from app.models.features import build_features_for_prediction

# TODO: Add Convex client to fetch data
# For now, we'll use placeholder data

async def predict_xmins(
    player_id: str,
    horizon_weeks: int = 1,
    flags: Dict[str, bool] = {},
) -> Dict:
    """
    Predict xMins for a single player

    Pipeline:
    1. Fetch player appearances from Convex
    2. Build features
    3. Stage A: Predict start probability
    4. Stage B: Predict minutes given start (+ P90)
    5. Combine: xMins = startProb * xMinsStart
    """
    stage_a = get_stage_a_model()
    stage_b = get_stage_b_model()

    # Check if models are trained
    if not stage_a.is_trained or not stage_b.is_trained:
        raise RuntimeError("Models not trained. Please train models first via /train endpoint")

    # TODO: Fetch real data from Convex
    # For now, return placeholder

    # Mock features for demonstration
    mock_features = {
        "num_healthy_starts": 6,
        "weighted_avg_minutes": 82.5,
        "last_3_avg_minutes": 85.0,
        "last_5_avg_minutes": 83.0,
        "minutes_std": 5.2,
        "role_lock": True,
        "start_frequency": 0.9,
        "congestion_flag": False,
        "intl_window_flag": False,
        "avg_days_rest": 7.0,
        "viable_backups": 1,
        "position_encoded": 2,  # MID
    }

    # Stage A: Predict start probability
    start_prob = stage_a.predict_single(mock_features)

    # Stage B: Predict minutes given start + P90
    xmins_start, p90 = stage_b.predict_single(mock_features)

    # Calculate effective xMins
    effective_xmins = start_prob * xmins_start

    # Build audit trail
    audit = {
        "features_used": list(mock_features.keys()),
        "stage_a_confidence": "high" if mock_features["num_healthy_starts"] >= 5 else "low",
        "stage_b_confidence": "high" if mock_features["num_healthy_starts"] >= 5 else "low",
        "flags": {
            "role_lock": mock_features["role_lock"],
            "sparse_data": mock_features["num_healthy_starts"] < 5,
        },
    }

    return {
        "player_id": player_id,
        "gameweek": 0,  # TODO: Get actual gameweek
        "start_prob": round(start_prob, 3),
        "xmins_start": round(xmins_start, 1),
        "p90": round(p90, 3),
        "effective_xmins": round(effective_xmins, 1),
        "uncertainty_lo": round(effective_xmins - 10, 1),
        "uncertainty_hi": round(effective_xmins + 10, 1),
        "audit": audit,
    }

async def batch_predict_xmins(
    requests: List[Dict],
) -> List[Dict]:
    """
    Batch prediction for multiple players
    """
    predictions = []

    for req in requests:
        try:
            pred = await predict_xmins(
                player_id=req.player_id,
                horizon_weeks=req.horizon_weeks,
                flags=req.flags or {},
            )
            predictions.append(pred)
        except Exception as e:
            # Log error but continue with other predictions
            print(f"Failed to predict for player {req.player_id}: {e}")
            continue

    return predictions

async def get_prediction_audit(
    player_id: str,
    gameweek: int,
) -> Dict:
    """
    Get detailed audit trail for a prediction
    """
    # TODO: Fetch from database/cache

    return {
        "player_id": player_id,
        "gameweek": gameweek,
        "model_version": "1.0.0",
        "features_used": {
            "num_healthy_starts": 6,
            "weighted_avg_minutes": 82.5,
            "role_lock": True,
        },
        "exclusions": [],
        "priors_used": None,
        "confidence": "high",
    }
