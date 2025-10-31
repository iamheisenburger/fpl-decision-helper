"""
Hyperparameter Tuning for FPL Minutes Prediction Models
Uses GridSearchCV to find optimal parameters for XGBoost models
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import joblib

import xgboost as xgb
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error, make_scorer

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"


def load_training_data():
    """Load feature-engineered data."""
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    df = pd.read_csv(data_path)

    # Exclude outliers
    df = df[df['is_outlier_event'] == 0].copy()

    with open(config_path, 'r') as f:
        config = json.load(f)

    return df, config


def tune_start_model(X_train, y_train):
    """
    Tune Stage 1: Start Probability Model
    """
    print("\n[TUNE] Tuning Stage 1: Start Probability Model...")

    # Parameter grid - focused on key parameters
    param_grid = {
        'max_depth': [4, 6, 8],
        'learning_rate': [0.03, 0.05, 0.1],
        'n_estimators': [100, 200, 300],
        'min_child_weight': [3, 5, 7],
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9],
    }

    # Calculate scale_pos_weight
    n_negative = (y_train == 0).sum()
    n_positive = (y_train == 1).sum()
    scale_pos_weight = n_negative / n_positive

    # Base model
    base_model = xgb.XGBClassifier(
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        eval_metric='logloss',
    )

    # GridSearchCV
    grid_search = GridSearchCV(
        estimator=base_model,
        param_grid=param_grid,
        scoring='roc_auc',
        cv=3,  # 3-fold to save time
        verbose=2,
        n_jobs=-1,
    )

    print(f"  Testing {len(param_grid['max_depth']) * len(param_grid['learning_rate']) * len(param_grid['n_estimators']) * len(param_grid['min_child_weight']) * len(param_grid['subsample']) * len(param_grid['colsample_bytree'])} combinations...")

    grid_search.fit(X_train, y_train)

    print(f"\n  [OK] Best parameters found:")
    for param, value in grid_search.best_params_.items():
        print(f"     {param}: {value}")

    print(f"  [OK] Best CV ROC AUC: {grid_search.best_score_:.4f}")

    return grid_search.best_estimator_, grid_search.best_params_


def tune_minutes_model(X_train, y_train):
    """
    Tune Stage 2: Minutes Prediction Model
    """
    print("\n[TUNE] Tuning Stage 2: Minutes Prediction Model...")

    # Parameter grid
    param_grid = {
        'max_depth': [3, 4, 5],
        'learning_rate': [0.03, 0.05, 0.1],
        'n_estimators': [150, 200, 250],
        'min_child_weight': [1, 3, 5],
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9],
    }

    # Base model
    base_model = xgb.XGBRegressor(
        random_state=42,
        objective='reg:squarederror',
    )

    # Custom scorer (negative MAE for minimization)
    mae_scorer = make_scorer(mean_absolute_error, greater_is_better=False)

    # GridSearchCV
    grid_search = GridSearchCV(
        estimator=base_model,
        param_grid=param_grid,
        scoring=mae_scorer,
        cv=3,
        verbose=2,
        n_jobs=-1,
    )

    print(f"  Testing {len(param_grid['max_depth']) * len(param_grid['learning_rate']) * len(param_grid['n_estimators']) * len(param_grid['min_child_weight']) * len(param_grid['subsample']) * len(param_grid['colsample_bytree'])} combinations...")

    grid_search.fit(X_train, y_train)

    print(f"\n  [OK] Best parameters found:")
    for param, value in grid_search.best_params_.items():
        print(f"     {param}: {value}")

    print(f"  [OK] Best CV MAE: {-grid_search.best_score_:.2f} minutes")

    return grid_search.best_estimator_, grid_search.best_params_


def evaluate_tuned_models(splits, start_model, minutes_model):
    """
    Evaluate the tuned models
    """
    print("\n[EVAL] Evaluating tuned models...")

    # Stage 1
    y_start_pred = start_model.predict(splits['start']['X_test'])
    start_acc = accuracy_score(splits['start']['y_test'], y_start_pred)

    # Stage 2
    y_minutes_pred = minutes_model.predict(splits['minutes']['X_test'])
    y_minutes_pred = np.clip(y_minutes_pred, 0, 90)
    minutes_mae = mean_absolute_error(splits['minutes']['y_test'], y_minutes_pred)

    # Combined
    start_proba = start_model.predict_proba(splits['start']['X_test'])[:, 1]
    all_minutes_pred = minutes_model.predict(splits['start']['X_test'])
    all_minutes_pred = np.clip(all_minutes_pred, 0, 90)
    xmins_predicted = start_proba * all_minutes_pred

    # Actual minutes
    avg_minutes_if_started = splits['minutes']['y_train'].mean()
    actual_minutes = splits['start']['y_test'].values.astype(float) * avg_minutes_if_started

    # Calculate accuracy at thresholds
    thresholds = [20, 25, 30]
    accuracy_metrics = {}

    for threshold in thresholds:
        within_tolerance = np.abs(actual_minutes - xmins_predicted) <= threshold
        accuracy = within_tolerance.mean()
        accuracy_metrics[f'accuracy_within_{threshold}min'] = accuracy

    print(f"\n  [OK] Tuned Model Performance:")
    print(f"     Stage 1 (Start): {start_acc:.2%}")
    print(f"     Stage 2 (Minutes): {minutes_mae:.1f} min MAE")
    print(f"     Combined:")
    for threshold in thresholds:
        acc = accuracy_metrics[f'accuracy_within_{threshold}min']
        status = "[TARGET HIT]" if acc >= 0.90 and threshold <= 25 else "[GOOD]" if acc >= 0.85 else "[PROGRESS]"
        print(f"       ±{threshold} min: {acc:.2%} {status}")

    return accuracy_metrics


def main():
    """
    Main execution: Tune hyperparameters and save best models
    """
    print("=" * 60)
    print("FPL ML Hyperparameter Tuning")
    print("=" * 60)

    # Load data
    df, config = load_training_data()
    print(f"[OK] Loaded {len(df):,} training samples (outliers excluded)")

    # Prepare splits
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

    splits = {
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

    # Tune Stage 1
    start_model, start_params = tune_start_model(X_start_train, y_start_train)

    # Tune Stage 2
    minutes_model, minutes_params = tune_minutes_model(X_minutes_train, y_minutes_train)

    # Evaluate
    accuracy_metrics = evaluate_tuned_models(splits, start_model, minutes_model)

    # Save tuned models
    print("\n[SAVE] Saving tuned models...")
    joblib.dump(start_model, MODEL_DIR / "start_model_tuned.pkl")
    joblib.dump(minutes_model, MODEL_DIR / "minutes_model_tuned.pkl")

    # Save best parameters
    best_params = {
        'start_model': start_params,
        'minutes_model': minutes_params,
        'accuracy_metrics': accuracy_metrics,
    }

    with open(MODEL_DIR / "best_hyperparameters.json", 'w') as f:
        json.dump(best_params, f, indent=2, default=float)

    print(f"  [OK] Saved tuned models and parameters")
    print(f"\n[SUCCESS] Hyperparameter tuning complete!")

    # Check if we hit target
    if accuracy_metrics['accuracy_within_25min'] >= 0.90:
        print(f"\n🌟 NORTH_STAR ACHIEVED! {accuracy_metrics['accuracy_within_25min']:.2%} at ±25 min")
    elif accuracy_metrics['accuracy_within_25min'] >= 0.85:
        print(f"\n🎯 Great progress! {accuracy_metrics['accuracy_within_25min']:.2%} at ±25 min")
        print(f"   Close to target (90-95%)")


if __name__ == "__main__":
    main()
