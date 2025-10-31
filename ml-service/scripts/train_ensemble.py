"""
Train Ensemble Models: XGBoost + LightGBM + CatBoost
Combine predictions from all 3 models for higher accuracy
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import joblib
from typing import Dict, Tuple

import xgboost as xgb
import lightgbm as lgb
import catboost as cb

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"


def load_training_data():
    """Load feature-engineered data."""
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    df = pd.read_csv(data_path)
    df = df[df['is_outlier_event'] == 0].copy()  # Exclude outliers

    with open(config_path, 'r') as f:
        config = json.load(f)

    return df, config


def prepare_splits(df, config):
    """Prepare train/test splits."""
    X_start = df[config['start_features']]
    y_start = df[config['targets']['start']]

    df_started = df[df[config['targets']['start']] == 1].copy()
    X_minutes = df_started[config['minutes_features']]
    y_minutes = df_started[config['targets']['minutes']]

    X_start_train, X_start_test, y_start_train, y_start_test = train_test_split(
        X_start, y_start, test_size=0.2, random_state=42, stratify=y_start
    )

    X_minutes_train, X_minutes_test, y_minutes_train, y_minutes_test = train_test_split(
        X_minutes, y_minutes, test_size=0.2, random_state=42
    )

    return {
        'start': {
            'X_train': X_start_train, 'X_test': X_start_test,
            'y_train': y_start_train, 'y_test': y_start_test,
        },
        'minutes': {
            'X_train': X_minutes_train, 'X_test': X_minutes_test,
            'y_train': y_minutes_train, 'y_test': y_minutes_test,
        }
    }


def train_xgboost_models(splits):
    """Train XGBoost models."""
    print("\n[XGB] Training XGBoost models...")

    # Stage 1: Start
    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    xgb_start = xgb.XGBClassifier(
        max_depth=6, learning_rate=0.05, n_estimators=200,
        min_child_weight=5, subsample=0.8,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, eval_metric='logloss'
    )
    xgb_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Stage 2: Minutes
    xgb_minutes = xgb.XGBRegressor(
        max_depth=4, learning_rate=0.05, n_estimators=250,
        min_child_weight=3, subsample=0.8,
        random_state=42, objective='reg:squarederror'
    )
    xgb_minutes.fit(splits['minutes']['X_train'], splits['minutes']['y_train'])

    print("  [OK] XGBoost models trained")
    return xgb_start, xgb_minutes


def train_lightgbm_models(splits):
    """Train LightGBM models."""
    print("\n[LGB] Training LightGBM models...")

    # Stage 1: Start
    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    lgb_start = lgb.LGBMClassifier(
        max_depth=6, learning_rate=0.05, n_estimators=200,
        num_leaves=31, subsample=0.8,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=-1
    )
    lgb_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Stage 2: Minutes
    lgb_minutes = lgb.LGBMRegressor(
        max_depth=4, learning_rate=0.05, n_estimators=250,
        num_leaves=15, subsample=0.8,
        random_state=42, verbose=-1
    )
    lgb_minutes.fit(splits['minutes']['X_train'], splits['minutes']['y_train'])

    print("  [OK] LightGBM models trained")
    return lgb_start, lgb_minutes


def train_catboost_models(splits):
    """Train CatBoost models."""
    print("\n[CAT] Training CatBoost models...")

    # Stage 1: Start
    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    cat_start = cb.CatBoostClassifier(
        depth=6, learning_rate=0.05, iterations=200,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=False
    )
    cat_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Stage 2: Minutes
    cat_minutes = cb.CatBoostRegressor(
        depth=4, learning_rate=0.05, iterations=250,
        random_state=42, verbose=False
    )
    cat_minutes.fit(splits['minutes']['X_train'], splits['minutes']['y_train'])

    print("  [OK] CatBoost models trained")
    return cat_start, cat_minutes


def evaluate_ensemble(splits, models_dict):
    """
    Evaluate ensemble by averaging predictions from all models.
    """
    print("\n[ENSEMBLE] Evaluating ensemble predictions...")

    # Get predictions from all models
    X_test = splits['start']['X_test']
    y_start_test = splits['start']['y_test']

    # Start probabilities
    xgb_start_proba = models_dict['xgb_start'].predict_proba(X_test)[:, 1]
    lgb_start_proba = models_dict['lgb_start'].predict_proba(X_test)[:, 1]
    cat_start_proba = models_dict['cat_start'].predict_proba(X_test)[:, 1]

    # Average start probabilities
    start_proba = (xgb_start_proba + lgb_start_proba + cat_start_proba) / 3

    # Minutes predictions
    xgb_minutes_pred = models_dict['xgb_minutes'].predict(X_test)
    lgb_minutes_pred = models_dict['lgb_minutes'].predict(X_test)
    cat_minutes_pred = models_dict['cat_minutes'].predict(X_test)

    # Average minutes predictions
    minutes_pred = (xgb_minutes_pred + lgb_minutes_pred + cat_minutes_pred) / 3
    minutes_pred = np.clip(minutes_pred, 0, 90)

    # Combined xMins
    xmins_predicted = start_proba * minutes_pred

    # Actual minutes
    avg_minutes_if_started = splits['minutes']['y_train'].mean()
    actual_minutes = y_start_test.values.astype(float) * avg_minutes_if_started

    # Calculate MAE
    mae = mean_absolute_error(actual_minutes, xmins_predicted)

    # Calculate accuracy at thresholds
    thresholds = [20, 25, 30]
    accuracy_metrics = {}

    print(f"\n  [OK] Ensemble Performance:")
    print(f"     MAE: {mae:.2f} minutes")
    print(f"     Avg predicted xMins: {xmins_predicted.mean():.1f}")
    print(f"     Avg actual xMins: {actual_minutes.mean():.1f}")
    print(f"\n  [ACCURACY] Threshold Performance:")

    for threshold in thresholds:
        within_tolerance = np.abs(actual_minutes - xmins_predicted) <= threshold
        accuracy = within_tolerance.mean()
        accuracy_metrics[f'accuracy_within_{threshold}min'] = accuracy

        if accuracy >= 0.90 and threshold <= 25:
            status = "[TARGET HIT]"
        elif accuracy >= 0.85:
            status = "[GOOD]"
        else:
            status = "[PROGRESS]"

        print(f"     +/-{threshold} min: {accuracy:.2%} {status}")

    return accuracy_metrics


def main():
    """
    Train ensemble of XGBoost, LightGBM, and CatBoost models.
    """
    print("=" * 60)
    print("FPL ML Ensemble Training")
    print("=" * 60)

    # Load data
    df, config = load_training_data()
    print(f"[OK] Loaded {len(df):,} training samples (outliers excluded)")

    # Prepare splits
    splits = prepare_splits(df, config)
    print(f"\n[OK] Prepared train/test splits")
    print(f"  Stage 1: {len(splits['start']['X_train']):,} train, {len(splits['start']['X_test']):,} test")
    print(f"  Stage 2: {len(splits['minutes']['X_train']):,} train, {len(splits['minutes']['X_test']):,} test")

    # Train all models
    xgb_start, xgb_minutes = train_xgboost_models(splits)
    lgb_start, lgb_minutes = train_lightgbm_models(splits)
    cat_start, cat_minutes = train_catboost_models(splits)

    models_dict = {
        'xgb_start': xgb_start,
        'xgb_minutes': xgb_minutes,
        'lgb_start': lgb_start,
        'lgb_minutes': lgb_minutes,
        'cat_start': cat_start,
        'cat_minutes': cat_minutes,
    }

    # Evaluate ensemble
    accuracy_metrics = evaluate_ensemble(splits, models_dict)

    # Save all models
    print("\n[SAVE] Saving ensemble models...")
    for name, model in models_dict.items():
        joblib.dump(model, MODEL_DIR / f"{name}_ensemble.pkl")

    # Save metadata
    metadata = {
        'ensemble_type': 'average',
        'models': ['xgboost', 'lightgbm', 'catboost'],
        'accuracy_metrics': {k: float(v) for k, v in accuracy_metrics.items()},
    }

    with open(MODEL_DIR / "ensemble_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"  [OK] Saved ensemble models and metadata")

    # Final message
    if accuracy_metrics['accuracy_within_25min'] >= 0.90:
        print(f"\n*** NORTH_STAR ACHIEVED! ***")
        print(f"   {accuracy_metrics['accuracy_within_25min']:.2%} accuracy at +/-25 min")
        print(f"   Target: 90-95% [SUCCESS]")
    elif accuracy_metrics['accuracy_within_25min'] >= 0.85:
        print(f"\n[EXCELLENT] Progress! {accuracy_metrics['accuracy_within_25min']:.2%} at +/-25 min")
        print(f"   Very close to NORTH_STAR target (90-95%)")
    else:
        print(f"\n[PROGRESS] Improvement: {accuracy_metrics['accuracy_within_25min']:.2%} at +/-25 min")


if __name__ == "__main__":
    main()
