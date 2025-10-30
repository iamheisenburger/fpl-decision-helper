"""
Training API
Fetches data from Convex and trains both Stage A and Stage B models
"""

import pandas as pd
from datetime import datetime
from typing import Dict
from app.models.start_probability import get_model as get_stage_a_model
from app.models.minutes_given_start import get_model as get_stage_b_model
from app.models.features import prepare_training_data
import os

async def train_models(
    convex_url: str,
    force: bool = False,
) -> Dict:
    """
    Train or retrain the xMins models

    Steps:
    1. Fetch all appearances from Convex
    2. Prepare training data (feature engineering)
    3. Train Stage A (start probability)
    4. Train Stage B (minutes given start)
    5. Save models to disk
    6. Return metrics

    Args:
        convex_url: URL to Convex deployment
        force: Force retrain even if recently trained

    Returns:
        Training results and metrics
    """
    # TODO: Check if recently trained (unless force=True)

    # Fetch data from Convex
    print("Fetching training data from Convex...")

    # TODO: Implement actual Convex fetching
    # For now, use mock data
    mock_appearances = pd.DataFrame({
        "playerId": ["player1"] * 10,
        "gameweek": list(range(1, 11)),
        "season": ["2024-25"] * 10,
        "started": [True, True, True, False, True, True, True, True, False, True],
        "minutes": [90, 85, 88, 0, 90, 87, 90, 90, 15, 90],
        "injExit": [False] * 10,
        "redCard": [False] * 10,
        "date": list(range(10)),
    })

    player_info_map = {
        "player1": {"position": "MID", "team": "Arsenal"},
    }

    context_map = {gw: {"congestionFlag": False, "intlWindowFlag": False} for gw in range(1, 11)}
    depth_map = {}

    print("Preparing training data...")

    # Prepare training data
    stage_a_data, stage_b_data = prepare_training_data(
        all_appearances=mock_appearances,
        player_info_map=player_info_map,
        context_map=context_map,
        depth_map=depth_map,
    )

    if len(stage_a_data) < 50 or len(stage_b_data) < 50:
        raise ValueError(
            f"Insufficient training data: "
            f"Stage A={len(stage_a_data)}, Stage B={len(stage_b_data)}. "
            f"Need at least 50 samples each."
        )

    print(f"Training Stage A with {len(stage_a_data)} samples...")

    # Train Stage A
    stage_a = get_stage_a_model()
    stage_a_metrics = stage_a.train(stage_a_data)

    print(f"Training Stage B with {len(stage_b_data)} samples...")

    # Train Stage B
    stage_b = get_stage_b_model()
    stage_b_metrics = stage_b.train(stage_b_data)

    # Save models
    models_dir = "models"
    os.makedirs(models_dir, exist_ok=True)

    stage_a_path = os.path.join(models_dir, "start_probability.pkl")
    stage_b_path = os.path.join(models_dir, "minutes_given_start.pkl")

    print("Saving models...")

    stage_a.save(stage_a_path)
    stage_b.save(stage_b_path)

    # Return results
    trained_at = datetime.utcnow().isoformat()

    return {
        "success": True,
        "model_version": "1.0.0",
        "metrics": {
            "stage_a": stage_a_metrics,
            "stage_b": stage_b_metrics,
        },
        "trained_at": trained_at,
        "data_summary": {
            "stage_a_samples": len(stage_a_data),
            "stage_b_samples": len(stage_b_data),
        },
    }

async def evaluate_models() -> Dict:
    """
    Evaluate model performance on holdout set
    """
    # TODO: Implement evaluation on holdout data

    return {
        "stage_a_accuracy": 0.85,
        "stage_b_concordance": 0.78,
        "rmse_minutes": 8.5,
    }
