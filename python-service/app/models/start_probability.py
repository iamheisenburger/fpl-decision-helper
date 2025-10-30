"""
Stage A: Start Probability Model
Logistic regression with regularization to predict if player starts
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
from typing import Dict, Optional, Tuple
import pickle
import os

class StartProbabilityModel:
    """
    Predicts probability of a player starting using logistic regression
    """

    def __init__(self):
        self.model = LogisticRegression(
            C=1.0,  # Regularization strength (inverse)
            penalty="l2",
            solver="lbfgs",
            max_iter=1000,
            random_state=42,
        )
        self.scaler = StandardScaler()
        self.feature_names = []
        self.is_trained = False

    def prepare_features(self, data: pd.DataFrame) -> np.ndarray:
        """
        Extract and scale features for model
        """
        # Feature columns (exclude target and identifiers)
        feature_cols = [
            "num_healthy_starts",
            "weighted_avg_minutes",
            "last_3_avg_minutes",
            "last_5_avg_minutes",
            "minutes_std",
            "role_lock",
            "start_frequency",
            "congestion_flag",
            "intl_window_flag",
            "avg_days_rest",
            "viable_backups",
            "position_encoded",
        ]

        # Filter to available columns
        available_features = [col for col in feature_cols if col in data.columns]
        self.feature_names = available_features

        X = data[available_features].fillna(0).values

        return X

    def train(self, training_data: pd.DataFrame) -> Dict[str, any]:
        """
        Train the start probability model

        Returns metrics and model info
        """
        if len(training_data) < 50:
            raise ValueError("Insufficient training data (need at least 50 samples)")

        # Prepare features and target
        X = self.prepare_features(training_data)
        y = training_data["started"].values

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Train model
        self.model.fit(X_scaled, y)
        self.is_trained = True

        # Calculate metrics
        train_score = self.model.score(X_scaled, y)

        # Cross-validation
        cv_scores = cross_val_score(self.model, X_scaled, y, cv=5, scoring="roc_auc")

        metrics = {
            "train_accuracy": float(train_score),
            "cv_auc_mean": float(cv_scores.mean()),
            "cv_auc_std": float(cv_scores.std()),
            "n_samples": len(training_data),
            "n_features": len(self.feature_names),
        }

        return metrics

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        """
        Predict start probability for new data

        Returns: array of probabilities [0.0 - 1.0]
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        X = self.prepare_features(features)
        X_scaled = self.scaler.transform(X)

        # Return probability of class 1 (started)
        probs = self.model.predict_proba(X_scaled)[:, 1]

        return probs

    def predict_single(self, features: Dict[str, any]) -> float:
        """
        Predict start probability for a single player
        """
        # Convert dict to DataFrame
        df = pd.DataFrame([features])
        probs = self.predict(df)
        return float(probs[0])

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance (coefficients for logistic regression)
        """
        if not self.is_trained:
            return {}

        importance = dict(zip(self.feature_names, self.model.coef_[0]))

        # Sort by absolute importance
        importance = {
            k: float(v)
            for k, v in sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True)
        }

        return importance

    def save(self, filepath: str):
        """Save model to disk"""
        model_data = {
            "model": self.model,
            "scaler": self.scaler,
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
        self.scaler = model_data["scaler"]
        self.feature_names = model_data["feature_names"]
        self.is_trained = model_data["is_trained"]

# Global model instance
_global_model = None

def get_model() -> StartProbabilityModel:
    """Get or initialize the global model instance"""
    global _global_model

    if _global_model is None:
        _global_model = StartProbabilityModel()

        # Try to load existing model
        model_path = os.getenv("STAGE_A_MODEL_PATH", "models/start_probability.pkl")
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
        "n_features": len(model.feature_names),
        "feature_names": model.feature_names,
        "feature_importance": model.get_feature_importance() if model.is_trained else {},
    }
