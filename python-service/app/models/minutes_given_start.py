"""
Stage B: Minutes-Given-Start Model
Survival analysis using Cox proportional hazards or Weibull AFT
Predicts minutes played and P90 for starters
"""

import pandas as pd
import numpy as np
from lifelines import CoxPHFitter, WeibullAFTFitter
from lifelines.utils import concordance_index
from typing import Dict, Optional, Tuple
import pickle
import os

class MinutesGivenStartModel:
    """
    Predicts minutes played (and P90) for players who start
    Uses survival analysis to model substitution hazard
    """

    def __init__(self, model_type: str = "weibull"):
        """
        Args:
            model_type: "cox" or "weibull"
        """
        self.model_type = model_type

        if model_type == "cox":
            self.model = CoxPHFitter(penalizer=0.1)
        elif model_type == "weibull":
            self.model = WeibullAFTFitter(penalizer=0.1)
        else:
            raise ValueError(f"Unknown model_type: {model_type}")

        self.feature_names = []
        self.is_trained = False

    def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare features for survival analysis
        """
        feature_cols = [
            "num_healthy_starts",
            "weighted_avg_minutes",
            "last_3_avg_minutes",
            "last_5_avg_minutes",
            "minutes_std",
            "role_lock",
            "congestion_flag",
            "intl_window_flag",
            "avg_days_rest",
            "viable_backups",
            "position_encoded",
        ]

        # Filter to available columns
        available_features = [col for col in feature_cols if col in data.columns]
        self.feature_names = available_features

        df = data[available_features + ["minutes"]].copy()

        # Fill NaN
        df = df.fillna(0)

        # Create event indicator (1 = subbed off, 0 = censored/played full time)
        df["event"] = (df["minutes"] < 90).astype(int)

        # For survival analysis, we model time-to-substitution
        # Cap minutes at 90+ (censored)
        df["duration"] = df["minutes"].clip(upper=95)

        return df

    def train(self, training_data: pd.DataFrame) -> Dict[str, any]:
        """
        Train the minutes-given-start model

        Returns metrics and model info
        """
        if len(training_data) < 50:
            raise ValueError("Insufficient training data (need at least 50 samples)")

        # Prepare data
        df = self.prepare_features(training_data)

        # Train model
        self.model.fit(
            df,
            duration_col="duration",
            event_col="event",
        )

        self.is_trained = True

        # Calculate metrics
        metrics = {
            "concordance_index": float(self.model.concordance_index_),
            "log_likelihood": float(self.model.log_likelihood_),
            "n_samples": len(training_data),
            "n_features": len(self.feature_names),
        }

        return metrics

    def predict_minutes(self, features: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict expected minutes and P90

        Returns:
            - expected_minutes: array of expected minutes
            - p90: array of P(minutes >= 90)
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        df = features[self.feature_names].copy().fillna(0)

        # Predict survival function for each player
        if self.model_type == "cox":
            # Cox model: use median survival time
            median_times = self.model.predict_median(df).values
            expected_minutes = np.clip(median_times, 0, 95)
        else:
            # Weibull AFT: use expected value
            expected_minutes = self.model.predict_expectation(df).values
            expected_minutes = np.clip(expected_minutes, 0, 95)

        # Calculate P90: probability of surviving past 90 minutes
        p90_values = []

        for idx in range(len(df)):
            row = df.iloc[idx:idx+1]

            # Get survival probability at t=90
            surv_func = self.model.predict_survival_function(row)

            # Find survival probability at minute 90
            if 90 in surv_func.index:
                p90 = surv_func.loc[90].values[0]
            else:
                # Interpolate
                surv_func = surv_func.sort_index()
                if 90 < surv_func.index.min():
                    p90 = 1.0
                elif 90 > surv_func.index.max():
                    p90 = surv_func.iloc[-1].values[0]
                else:
                    # Linear interpolation
                    lower_idx = surv_func.index[surv_func.index <= 90][-1]
                    upper_idx = surv_func.index[surv_func.index > 90][0]
                    lower_val = surv_func.loc[lower_idx].values[0]
                    upper_val = surv_func.loc[upper_idx].values[0]

                    # Interpolate
                    weight = (90 - lower_idx) / (upper_idx - lower_idx)
                    p90 = lower_val + weight * (upper_val - lower_val)

            p90_values.append(p90)

        return expected_minutes, np.array(p90_values)

    def predict_single(self, features: Dict[str, any]) -> Tuple[float, float]:
        """
        Predict minutes and P90 for a single player

        Returns:
            - expected_minutes: float
            - p90: float
        """
        df = pd.DataFrame([features])
        expected_minutes, p90 = self.predict_minutes(df)

        return float(expected_minutes[0]), float(p90[0])

    def save(self, filepath: str):
        """Save model to disk"""
        model_data = {
            "model": self.model,
            "model_type": self.model_type,
            "feature_names": self.feature_names,
            "is_trained": self.is_trained,
        }

        with open(filepath, "wb") as f:
            pickle.dump(model_data, f)

    def load(self, filepath: str):
        """Load model from disk"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Model file not found: {filepath}")

        with open(filepath, "rb") as f:
            model_data = pickle.load(f)

        self.model = model_data["model"]
        self.model_type = model_data["model_type"]
        self.feature_names = model_data["feature_names"]
        self.is_trained = model_data["is_trained"]

# Global model instance
_global_model = None

def get_model() -> MinutesGivenStartModel:
    """Get or initialize the global model instance"""
    global _global_model

    if _global_model is None:
        _global_model = MinutesGivenStartModel(model_type="weibull")

        # Try to load existing model
        model_path = os.getenv("STAGE_B_MODEL_PATH", "models/minutes_given_start.pkl")
        if os.path.exists(model_path):
            try:
                _global_model.load(model_path)
            except Exception as e:
                print(f"Failed to load model: {e}")

    return _global_model

def get_model_info() -> Dict[str, any]:
    """Get information about the current model"""
    model = get_model()

    return {
        "is_trained": model.is_trained,
        "model_type": model.model_type,
        "n_features": len(model.feature_names),
        "feature_names": model.feature_names,
        "concordance_index": model.model.concordance_index_ if model.is_trained else None,
    }
