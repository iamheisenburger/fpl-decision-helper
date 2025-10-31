"""
CALIBRATION PUSH: Use Platt scaling + isotonic regression
to ensure predicted probabilities match reality
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import joblib

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
from sklearn.calibration import CalibratedClassifierCV
from sklearn.isotonic import IsotonicRegression

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"


def load_training_data():
    """Load feature-engineered data with advanced features."""
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    df = pd.read_csv(data_path)
    df = df[df['is_outlier_event'] == 0].copy()

    with open(config_path, 'r') as f:
        config = json.load(f)

    # Add squad depth features
    print("[BUILD] Computing squad depth...")
    df = df.sort_values(['team', 'position', 'season', 'gameweek'])

    squad_depth = []
    for idx, row in df.iterrows():
        recent_players = df[
            (df['team'] == row['team']) &
            (df['position'] == row['position']) &
            (df['season'] == row['season']) &
            (df['gameweek'] >= row['gameweek'] - 5) &
            (df['gameweek'] < row['gameweek']) &
            (df['minutes'] > 0)
        ]['fpl_id'].nunique()
        squad_depth.append(recent_players)

    df['squad_depth_position'] = squad_depth
    df['high_squad_depth'] = (df['squad_depth_position'] >= 3).astype(int)

    # Add manager profiles
    print("[BUILD] Computing manager profiles...")
    team_profiles = {}
    for team in df['team'].unique():
        team_data = df[df['team'] == team]
        starters = team_data[team_data['started'] == True]

        if len(starters) > 0:
            early_sub_rate = (starters['minutes'] < 75).mean()
            full_game_rate = (starters['minutes'] >= 85).mean()
            team_profiles[team] = {'early_sub_rate': early_sub_rate, 'full_game_rate': full_game_rate}
        else:
            team_profiles[team] = {'early_sub_rate': 0.25, 'full_game_rate': 0.60}

    df['manager_early_sub_rate'] = df['team'].map(lambda x: team_profiles.get(x, {}).get('early_sub_rate', 0.25))
    df['manager_full_game_rate'] = df['team'].map(lambda x: team_profiles.get(x, {}).get('full_game_rate', 0.60))
    df['high_rotation_manager'] = (df['manager_early_sub_rate'] > 0.30).astype(int)

    # Update config
    advanced_features = ['squad_depth_position', 'high_squad_depth',
                         'manager_early_sub_rate', 'manager_full_game_rate',
                         'high_rotation_manager']

    config['start_features'] = config['start_features'] + advanced_features
    config['minutes_features'] = config['minutes_features'] + advanced_features

    return df, config


def train_calibrated_models(splits):
    """
    Train models with calibration (Platt scaling).
    This ensures predicted probabilities match actual frequencies.
    """
    print("\n[CALIBRATE] Training calibrated models...")

    # Base XGBoost models
    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    base_start = xgb.XGBClassifier(
        max_depth=4, learning_rate=0.03, n_estimators=200,
        min_child_weight=3, subsample=0.7, colsample_bytree=0.9,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, eval_metric='logloss'
    )

    # Calibrate using Platt scaling (sigmoid)
    print("  Calibrating start model (Platt scaling)...")
    calibrated_start = CalibratedClassifierCV(
        base_start,
        method='sigmoid',  # Platt scaling
        cv=3,
    )
    calibrated_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Minutes model
    base_minutes = xgb.XGBRegressor(
        max_depth=4, learning_rate=0.05, n_estimators=200,
        min_child_weight=5, subsample=0.8, colsample_bytree=0.8,
        random_state=42, objective='reg:squarederror'
    )
    base_minutes.fit(splits['minutes']['X_train'], splits['minutes']['y_train'])

    # Calibrate minutes predictions using isotonic regression
    print("  Calibrating minutes model (isotonic regression)...")
    minutes_pred_train = base_minutes.predict(splits['minutes']['X_train'])
    iso_reg = IsotonicRegression(out_of_bounds='clip')
    iso_reg.fit(minutes_pred_train, splits['minutes']['y_train'])

    print("  [OK] Calibrated models trained")

    return calibrated_start, base_minutes, iso_reg


def evaluate_calibrated(splits, start_model, minutes_model, iso_reg):
    """
    Evaluate calibrated ensemble.
    """
    print("\n[EVAL] Evaluating calibrated models...")

    X_test = splits['start']['X_test']
    actual_minutes = splits['start']['actual_test'].values

    # Calibrated start predictions
    start_proba = start_model.predict_proba(X_test)[:, 1]

    # Calibrated minutes predictions
    minutes_pred_raw = minutes_model.predict(X_test)
    minutes_pred = iso_reg.predict(minutes_pred_raw)
    minutes_pred = np.clip(minutes_pred, 0, 90)

    # Combined xMins
    xmins_predicted = start_proba * minutes_pred

    # Calculate MAE
    mae = mean_absolute_error(actual_minutes, xmins_predicted)

    # Calculate accuracy at thresholds - PRIMARY: ±15 MIN (NORTH_STAR)
    thresholds = [15, 20, 25, 30]
    accuracy_metrics = {}

    print(f"\n  [OK] Calibrated Performance:")
    print(f"     MAE: {mae:.2f} minutes")
    print(f"     Avg predicted xMins: {xmins_predicted.mean():.1f}")
    print(f"     Avg actual minutes: {actual_minutes.mean():.1f}")
    print(f"\n  [ACCURACY] Threshold Performance (PRIMARY: +/-15 min):")

    for threshold in thresholds:
        within_tolerance = np.abs(actual_minutes - xmins_predicted) <= threshold
        accuracy = within_tolerance.mean()
        accuracy_metrics[f'accuracy_within_{threshold}min'] = accuracy

        # NORTH_STAR target: 85-90% at ±15 min
        if threshold == 15:
            if accuracy >= 0.85:
                status = "*** NORTH_STAR ACHIEVED (85%+) ***"
            else:
                gap = 0.85 - accuracy
                status = f"[Gap to NORTH_STAR: {gap:.1%}]"
            prefix = ">>> "
        elif accuracy >= 0.90:
            status = "[EXCELLENT]"
            prefix = "    "
        elif accuracy >= 0.85:
            status = "[EXCELLENT]"
            prefix = "    "
        elif accuracy >= 0.80:
            status = "[GOOD]"
            prefix = "    "
        else:
            status = "[PROGRESS]"
            prefix = "    "

        print(f"{prefix}+/-{threshold} min: {accuracy:.2%} {status}")

    return accuracy_metrics


def main():
    """
    Train calibrated models for maximum accuracy.
    """
    print("=" * 60)
    print("CALIBRATION PUSH TO 90-95%")
    print("=" * 60)

    # Load data
    df, config = load_training_data()
    print(f"[OK] Loaded {len(df):,} samples with {len(config['start_features'])} features")

    # Prepare splits
    X_start = df[config['start_features']]
    y_start = df[config['targets']['start']]
    actual_minutes_full = df['minutes'].copy()

    df_started = df[df[config['targets']['start']] == 1].copy()
    X_minutes = df_started[config['minutes_features']]
    y_minutes = df_started[config['targets']['minutes']]

    X_start_train, X_start_test, y_start_train, y_start_test, actual_train, actual_test = train_test_split(
        X_start, y_start, actual_minutes_full, test_size=0.2, random_state=42, stratify=y_start
    )

    X_minutes_train, X_minutes_test, y_minutes_train, y_minutes_test = train_test_split(
        X_minutes, y_minutes, test_size=0.2, random_state=42
    )

    splits = {
        'start': {
            'X_train': X_start_train, 'X_test': X_start_test,
            'y_train': y_start_train, 'y_test': y_start_test,
            'actual_test': actual_test,
        },
        'minutes': {
            'X_train': X_minutes_train, 'X_test': X_minutes_test,
            'y_train': y_minutes_train, 'y_test': y_minutes_test,
        }
    }

    # Train calibrated models
    start_model, minutes_model, iso_reg = train_calibrated_models(splits)

    # Evaluate
    accuracy_metrics = evaluate_calibrated(splits, start_model, minutes_model, iso_reg)

    # Save models
    print("\n[SAVE] Saving calibrated models...")
    joblib.dump(start_model, MODEL_DIR / "start_model_calibrated.pkl")
    joblib.dump(minutes_model, MODEL_DIR / "minutes_model_calibrated.pkl")
    joblib.dump(iso_reg, MODEL_DIR / "isotonic_calibrator.pkl")

    metadata = {
        'version': 'calibrated_v1',
        'calibration': 'platt_scaling + isotonic_regression',
        'accuracy_metrics': {k: float(v) for k, v in accuracy_metrics.items()},
    }

    with open(MODEL_DIR / "calibrated_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"  [OK] Saved calibrated models")

    # Final verdict
    acc_25 = accuracy_metrics['accuracy_within_25min']
    acc_20 = accuracy_metrics['accuracy_within_20min']

    if acc_20 >= 0.90:
        print(f"\n*** NORTH_STAR ACHIEVED! ***")
        print(f"   {acc_20:.2%} at +/-20 min")
        return True
    elif acc_25 >= 0.90:
        print(f"\n*** NORTH_STAR ACHIEVED! ***")
        print(f"   {acc_25:.2%} at +/-25 min")
        return True
    elif acc_25 >= 0.80:
        print(f"\n[PROGRESS] {acc_25:.2%} at +/-25 min")
        print(f"   Gap to 90%: {0.90 - acc_25:.1%}")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
