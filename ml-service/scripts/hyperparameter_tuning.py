"""
Hyperparameter Tuning for XGBoost Models
Grid search to find optimal parameters for 85-90% accuracy target
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import xgboost as xgb
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error
from typing import Dict, Tuple
import time

DATA_DIR = Path(__file__).parent.parent / "data"
RESULTS_DIR = Path(__file__).parent.parent / "tuning_results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def load_training_data() -> Tuple[pd.DataFrame, Dict]:
    """Load feature-engineered data and configuration."""
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    df = pd.read_csv(data_path)
    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"[OK] Loaded {len(df):,} training samples", flush=True)
    return df, config


def prepare_splits(df: pd.DataFrame, config: Dict) -> Dict:
    """Prepare train/test splits for both stages."""
    # Stage 1: Start prediction (all appearances)
    X_start = df[config['start_features']]
    y_start = df[config['targets']['start']]

    X_start_train, X_start_test, y_start_train, y_start_test = train_test_split(
        X_start, y_start, test_size=0.2, random_state=42, stratify=y_start
    )

    # Stage 2: Minutes prediction (only started appearances)
    started_df = df[df[config['targets']['start']] == 1]
    X_minutes = started_df[config['start_features']]  # Use same features
    y_minutes = started_df[config['targets']['minutes']]

    X_minutes_train, X_minutes_test, y_minutes_train, y_minutes_test = train_test_split(
        X_minutes, y_minutes, test_size=0.2, random_state=42
    )

    return {
        'start': {
            'X_train': X_start_train,
            'X_test': X_start_test,
            'y_train': y_start_train,
            'y_test': y_start_test,
        },
        'minutes': {
            'X_train': X_minutes_train,
            'X_test': X_minutes_test,
            'y_train': y_minutes_train,
            'y_test': y_minutes_test,
        }
    }


def tune_start_model(splits: Dict) -> Dict:
    """
    Grid search for Stage 1: Start probability prediction.
    """
    print("\n[TUNING] Stage 1: Start Probability Model", flush=True)
    print("   Testing hyperparameter combinations...", flush=True)

    # Calculate scale_pos_weight for class imbalance
    n_negative = (splits['start']['y_train'] == 0).sum()
    n_positive = (splits['start']['y_train'] == 1).sum()
    scale_pos_weight = n_negative / n_positive

    # Define parameter grid
    param_grid = {
        'max_depth': [4, 6, 8],
        'learning_rate': [0.05, 0.1, 0.15],
        'n_estimators': [100, 200, 300],
        'min_child_weight': [1, 3, 5],
        'subsample': [0.8, 1.0],
    }

    # Base model
    base_model = xgb.XGBClassifier(
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        eval_metric='logloss',
    )

    # Grid search with 3-fold CV
    grid_search = GridSearchCV(
        base_model,
        param_grid,
        cv=3,
        scoring='roc_auc',
        n_jobs=-1,
        verbose=1
    )

    start_time = time.time()
    grid_search.fit(splits['start']['X_train'], splits['start']['y_train'])
    elapsed = time.time() - start_time

    # Best model
    best_model = grid_search.best_estimator_
    y_pred = best_model.predict(splits['start']['X_test'])
    test_acc = accuracy_score(splits['start']['y_test'], y_pred)

    print(f"\n  [OK] Grid search complete ({elapsed/60:.1f} minutes)", flush=True)
    print(f"   Best params: {grid_search.best_params_}", flush=True)
    print(f"   Best CV ROC AUC: {grid_search.best_score_:.4f}", flush=True)
    print(f"   Test accuracy: {test_acc:.2%}", flush=True)

    return {
        'best_params': grid_search.best_params_,
        'best_score': float(grid_search.best_score_),
        'test_accuracy': float(test_acc),
        'elapsed_minutes': elapsed / 60,
    }


def tune_minutes_model(splits: Dict) -> Dict:
    """
    Grid search for Stage 2: Minutes prediction.
    """
    print("\n[TUNING] Stage 2: Minutes Prediction Model", flush=True)
    print("   Testing hyperparameter combinations...", flush=True)

    # Define parameter grid
    param_grid = {
        'max_depth': [4, 5, 6],
        'learning_rate': [0.05, 0.1, 0.15],
        'n_estimators': [100, 200, 300],
        'min_child_weight': [1, 3],
        'subsample': [0.8, 1.0],
    }

    # Base model
    base_model = xgb.XGBRegressor(
        random_state=42,
        objective='reg:squarederror',
    )

    # Grid search with 3-fold CV
    grid_search = GridSearchCV(
        base_model,
        param_grid,
        cv=3,
        scoring='neg_mean_absolute_error',
        n_jobs=-1,
        verbose=1
    )

    start_time = time.time()
    grid_search.fit(splits['minutes']['X_train'], splits['minutes']['y_train'])
    elapsed = time.time() - start_time

    # Best model
    best_model = grid_search.best_estimator_
    y_pred = best_model.predict(splits['minutes']['X_test'])
    y_pred_clipped = np.clip(y_pred, 0, 90)
    test_mae = mean_absolute_error(splits['minutes']['y_test'], y_pred_clipped)

    print(f"\n  [OK] Grid search complete ({elapsed/60:.1f} minutes)", flush=True)
    print(f"   Best params: {grid_search.best_params_}", flush=True)
    print(f"   Best CV MAE: {-grid_search.best_score_:.2f} minutes", flush=True)
    print(f"   Test MAE: {test_mae:.2f} minutes", flush=True)

    return {
        'best_params': grid_search.best_params_,
        'best_cv_mae': float(-grid_search.best_score_),
        'test_mae': float(test_mae),
        'elapsed_minutes': elapsed / 60,
    }


def main():
    """
    Main execution: Tune both models and save best hyperparameters.
    """
    print("=" * 60, flush=True)
    print("XGBoost Hyperparameter Tuning", flush=True)
    print("=" * 60, flush=True)
    print("Target: 85-90% accuracy for GW+1 predictions", flush=True)
    print(flush=True)

    # Load data
    df, config = load_training_data()
    splits = prepare_splits(df, config)

    print(f"\n[STATS] Train/Test Splits:", flush=True)
    print(f"   Stage 1: {len(splits['start']['X_train']):,} train, {len(splits['start']['X_test']):,} test", flush=True)
    print(f"   Stage 2: {len(splits['minutes']['X_train']):,} train, {len(splits['minutes']['X_test']):,} test", flush=True)

    # Tune Stage 1
    start_results = tune_start_model(splits)

    # Tune Stage 2
    minutes_results = tune_minutes_model(splits)

    # Save results
    results = {
        'start_model': start_results,
        'minutes_model': minutes_results,
        'tuned_at': pd.Timestamp.now().isoformat(),
    }

    output_path = RESULTS_DIR / "best_hyperparameters.json"
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n[SAVED] Best hyperparameters saved to {output_path}", flush=True)
    print(f"\n[OK] Hyperparameter tuning complete!", flush=True)
    print(f"   Next step: Update train_models.py with best params and retrain", flush=True)


if __name__ == "__main__":
    main()
