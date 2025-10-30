"""
Feature Engineering for xMins Prediction
Transforms raw appearance data into ML features
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta

def extract_healthy_starts(
    appearances: pd.DataFrame,
    exclude_injury: bool = True,
    exclude_red_card: bool = True,
    recency_window: int = 8,
) -> pd.DataFrame:
    """
    Filter appearances to only healthy starts
    """
    df = appearances.copy()

    # Filter for starts only
    df = df[df["started"] == True]

    # Exclude injury exits
    if exclude_injury:
        df = df[df["injExit"] == False]

    # Exclude red cards
    if exclude_red_card:
        df = df[df["redCard"] == False]

    # Sort by date descending (most recent first)
    df = df.sort_values("date", ascending=False)

    # Limit to recency window
    if recency_window > 0:
        df = df.head(recency_window)

    return df

def calculate_recency_weights(count: int) -> np.ndarray:
    """
    Calculate exponential decay weights for recent appearances
    Most recent gets highest weight
    """
    if count == 0:
        return np.array([])

    # Exponential decay
    alpha = 0.8
    weights = np.array([alpha ** i for i in range(count)])

    # Normalize
    return weights / weights.sum()

def detect_role_lock(
    healthy_starts: pd.DataFrame,
    threshold: int = 3,
    minutes_threshold: int = 85,
) -> bool:
    """
    Detect if player has role lock (consecutive high-minute starts)
    """
    if len(healthy_starts) < threshold:
        return False

    # Check last N starts
    recent = healthy_starts.head(threshold)

    # All must be >= minutes_threshold
    return all(recent["minutes"] >= minutes_threshold)

def calculate_team_position_prior(
    team_appearances: pd.DataFrame,
    position: str,
) -> Dict[str, float]:
    """
    Calculate team/position priors for shrinkage
    """
    if len(team_appearances) == 0:
        # Default priors by position
        defaults = {
            "GK": {"start_prob": 0.9, "avg_minutes": 88},
            "DEF": {"start_prob": 0.7, "avg_minutes": 80},
            "MID": {"start_prob": 0.6, "avg_minutes": 75},
            "FWD": {"start_prob": 0.6, "avg_minutes": 70},
        }
        default = defaults.get(position, defaults["MID"])
        return default

    # Calculate from data
    starters = team_appearances[team_appearances["started"] == True]

    start_prob = len(starters) / len(team_appearances) if len(team_appearances) > 0 else 0.5
    avg_minutes = starters["minutes"].mean() if len(starters) > 0 else 70.0

    return {
        "start_prob": start_prob,
        "avg_minutes": avg_minutes,
    }

def build_features_for_prediction(
    player_appearances: pd.DataFrame,
    player_info: Dict,
    context: Optional[Dict] = None,
    depth_info: Optional[Dict] = None,
    team_appearances: Optional[pd.DataFrame] = None,
    recency_window: int = 8,
) -> Dict[str, any]:
    """
    Build feature vector for a single prediction
    """
    features = {}

    # Get healthy starts
    healthy_starts = extract_healthy_starts(
        player_appearances,
        exclude_injury=True,
        exclude_red_card=True,
        recency_window=recency_window,
    )

    # Basic features
    features["num_healthy_starts"] = len(healthy_starts)
    features["has_data"] = len(healthy_starts) > 0

    if len(healthy_starts) == 0:
        # Use priors
        if team_appearances is not None:
            prior = calculate_team_position_prior(team_appearances, player_info["position"])
            features["prior_start_prob"] = prior["start_prob"]
            features["prior_avg_minutes"] = prior["avg_minutes"]
        else:
            features["prior_start_prob"] = 0.5
            features["prior_avg_minutes"] = 70.0

        features["use_prior"] = True
        return features

    features["use_prior"] = False

    # Recency-weighted minutes
    weights = calculate_recency_weights(len(healthy_starts))
    weighted_minutes = (healthy_starts["minutes"].values * weights).sum()
    features["weighted_avg_minutes"] = weighted_minutes

    # Recent performance
    features["last_3_avg_minutes"] = healthy_starts.head(3)["minutes"].mean()
    features["last_5_avg_minutes"] = healthy_starts.head(5)["minutes"].mean()

    # Variance
    features["minutes_std"] = healthy_starts["minutes"].std()

    # Role lock
    features["role_lock"] = detect_role_lock(healthy_starts, threshold=3, minutes_threshold=85)

    # Start frequency
    all_recent = player_appearances.sort_values("date", ascending=False).head(recency_window)
    features["start_frequency"] = len(healthy_starts) / len(all_recent) if len(all_recent) > 0 else 0

    # Context features
    if context:
        features["congestion_flag"] = context.get("congestionFlag", False)
        features["intl_window_flag"] = context.get("intlWindowFlag", False)
        features["avg_days_rest"] = context.get("avgDaysRestTeam", 7.0)
    else:
        features["congestion_flag"] = False
        features["intl_window_flag"] = False
        features["avg_days_rest"] = 7.0

    # Depth features
    if depth_info:
        features["viable_backups"] = depth_info.get("viableBackupsCount", 2)
    else:
        features["viable_backups"] = 2

    # Player position encoding
    position_map = {"GK": 0, "DEF": 1, "MID": 2, "FWD": 3}
    features["position_encoded"] = position_map.get(player_info["position"], 2)

    return features

def prepare_training_data(
    all_appearances: pd.DataFrame,
    player_info_map: Dict[str, Dict],
    context_map: Dict[int, Dict],
    depth_map: Dict[Tuple[str, int], Dict],
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Prepare training data from historical appearances

    Returns:
        - stage_a_data: DataFrame for start probability model
        - stage_b_data: DataFrame for minutes-given-start model
    """
    stage_a_records = []
    stage_b_records = []

    # Group by player
    for player_id, player_apps in all_appearances.groupby("playerId"):
        player_info = player_info_map.get(player_id, {})

        # Sort by date
        player_apps = player_apps.sort_values("date")

        # For each appearance, build features from history before it
        for idx, row in player_apps.iterrows():
            # Get history before this appearance
            history = player_apps[player_apps["date"] < row["date"]]

            if len(history) < 3:  # Need minimum history
                continue

            # Build features
            context = context_map.get(row["gameweek"], {})
            depth = depth_map.get((player_id, row["gameweek"]), {})

            features = build_features_for_prediction(
                player_appearances=history,
                player_info=player_info,
                context=context,
                depth_info=depth,
                recency_window=8,
            )

            # Skip if using priors (not enough data)
            if features.get("use_prior", False):
                continue

            # Stage A: Predict started (binary classification)
            stage_a_record = {
                **features,
                "started": int(row["started"]),
                "player_id": player_id,
                "gameweek": row["gameweek"],
            }
            stage_a_records.append(stage_a_record)

            # Stage B: Predict minutes given start (regression + survival)
            if row["started"]:
                # Exclude injury/red card from training
                if not row["injExit"] and not row["redCard"]:
                    stage_b_record = {
                        **features,
                        "minutes": row["minutes"],
                        "full_90": int(row["minutes"] >= 90),
                        "player_id": player_id,
                        "gameweek": row["gameweek"],
                    }
                    stage_b_records.append(stage_b_record)

    return pd.DataFrame(stage_a_records), pd.DataFrame(stage_b_records)
