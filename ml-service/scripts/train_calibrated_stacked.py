"""
ULTIMATE PUSH: Stacked ensemble + Calibration
Combines meta-learning with probability calibration for maximum accuracy
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import joblib

import xgboost as xgb
import lightgbm as lgb
import catboost as cb

from sklearn.model_selection import train_test_split, KFold
from sklearn.metrics import mean_absolute_error
from sklearn.linear_model import Ridge
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


def train_calibrated_stacked_ensemble(splits):
    """
    Train ensemble with BOTH stacking and calibration.
    """
    print("\n[ULTIMATE] Training calibrated stacked ensemble...")

    # Stage 1: Start (calibrated ensemble)
    print("\n  Stage 1: Calibrated Start Predictions")

    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    # Train 3 base classifiers with calibration
    xgb_start = xgb.XGBClassifier(
        max_depth=4, learning_rate=0.03, n_estimators=200,
        min_child_weight=3, subsample=0.7, colsample_bytree=0.9,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, eval_metric='logloss'
    )

    lgb_start = lgb.LGBMClassifier(
        max_depth=6, learning_rate=0.05, n_estimators=200,
        num_leaves=31, subsample=0.8,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=-1
    )

    cat_start = cb.CatBoostClassifier(
        depth=6, learning_rate=0.05, iterations=200,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=False
    )

    # Calibrate each classifier
    print("    Calibrating XGBoost (Platt scaling)...")
    xgb_calibrated = CalibratedClassifierCV(xgb_start, method='sigmoid', cv=3)
    xgb_calibrated.fit(splits['start']['X_train'], splits['start']['y_train'])

    print("    Calibrating LightGBM (Platt scaling)...")
    lgb_calibrated = CalibratedClassifierCV(lgb_start, method='sigmoid', cv=3)
    lgb_calibrated.fit(splits['start']['X_train'], splits['start']['y_train'])

    print("    Calibrating CatBoost (Platt scaling)...")
    cat_calibrated = CalibratedClassifierCV(cat_start, method='sigmoid', cv=3)
    cat_calibrated.fit(splits['start']['X_train'], splits['start']['y_train'])

    print("  [OK] Calibrated start models trained")

    # Stage 2: Minutes (stacked with cross-validation + isotonic calibration)
    print("\n  Stage 2: Stacked + Calibrated Minutes Predictions")

    kf = KFold(n_splits=5, shuffle=True, random_state=42)

    oof_xgb = np.zeros(len(splits['minutes']['X_train']))
    oof_lgb = np.zeros(len(splits['minutes']['X_train']))
    oof_cat = np.zeros(len(splits['minutes']['X_train']))

    xgb_models = []
    lgb_models = []
    cat_models = []

    for fold, (train_idx, val_idx) in enumerate(kf.split(splits['minutes']['X_train'])):
        print(f"    Training fold {fold + 1}/5...")

        X_fold_train = splits['minutes']['X_train'].iloc[train_idx]
        X_fold_val = splits['minutes']['X_train'].iloc[val_idx]
        y_fold_train = splits['minutes']['y_train'].iloc[train_idx]

        # XGBoost
        xgb_model = xgb.XGBRegressor(
            max_depth=4, learning_rate=0.05, n_estimators=200,
            min_child_weight=5, subsample=0.8, colsample_bytree=0.8,
            random_state=42, objective='reg:squarederror'
        )
        xgb_model.fit(X_fold_train, y_fold_train)
        oof_xgb[val_idx] = xgb_model.predict(X_fold_val)
        xgb_models.append(xgb_model)

        # LightGBM
        lgb_model = lgb.LGBMRegressor(
            max_depth=4, learning_rate=0.05, n_estimators=250,
            num_leaves=15, subsample=0.8,
            random_state=42, verbose=-1
        )
        lgb_model.fit(X_fold_train, y_fold_train)
        oof_lgb[val_idx] = lgb_model.predict(X_fold_val)
        lgb_models.append(lgb_model)

        # CatBoost
        cat_model = cb.CatBoostRegressor(
            depth=4, learning_rate=0.05, iterations=250,
            random_state=42, verbose=False
        )
        cat_model.fit(X_fold_train, y_fold_train)
        oof_cat[val_idx] = cat_model.predict(X_fold_val)
        cat_models.append(cat_model)

    # Train meta-learner on OOF predictions
    print("    Training meta-learner...")
    X_meta = np.column_stack([oof_xgb, oof_lgb, oof_cat])
    meta_model = Ridge(alpha=1.0)
    meta_model.fit(X_meta, splits['minutes']['y_train'])

    print(f"    Learned weights: XGB={meta_model.coef_[0]:.3f}, LGB={meta_model.coef_[1]:.3f}, CAT={meta_model.coef_[2]:.3f}")

    # Calibrate meta-learner predictions with isotonic regression
    print("    Calibrating minutes predictions (isotonic)...")
    meta_pred_train = meta_model.predict(X_meta)
    iso_reg = IsotonicRegression(out_of_bounds='clip')
    iso_reg.fit(meta_pred_train, splits['minutes']['y_train'])

    print("  [OK] Stacked + calibrated minutes model trained")

    return {
        'start_models': {
            'xgb': xgb_calibrated,
            'lgb': lgb_calibrated,
            'cat': cat_calibrated,
        },
        'minutes_base_models': {
            'xgb': xgb_models,
            'lgb': lgb_models,
            'cat': cat_models,
        },
        'minutes_meta': meta_model,
        'minutes_calibrator': iso_reg,
    }


def evaluate_ultimate_model(splits, models):
    """
    Evaluate the ultimate model combining all techniques.
    """
    print("\n[EVAL] Evaluating ultimate calibrated stacked ensemble...")

    X_test = splits['start']['X_test']
    actual_minutes = splits['start']['actual_test'].values

    # Stage 1: Calibrated ensemble predictions
    xgb_start_proba = models['start_models']['xgb'].predict_proba(X_test)[:, 1]
    lgb_start_proba = models['start_models']['lgb'].predict_proba(X_test)[:, 1]
    cat_start_proba = models['start_models']['cat'].predict_proba(X_test)[:, 1]

    # Weighted average (based on typical performance: XGB slightly better)
    start_proba = 0.4 * xgb_start_proba + 0.3 * lgb_start_proba + 0.3 * cat_start_proba

    # Stage 2: Stacked + calibrated minutes predictions
    # Average predictions from all folds
    xgb_preds = np.mean([m.predict(X_test) for m in models['minutes_base_models']['xgb']], axis=0)
    lgb_preds = np.mean([m.predict(X_test) for m in models['minutes_base_models']['lgb']], axis=0)
    cat_preds = np.mean([m.predict(X_test) for m in models['minutes_base_models']['cat']], axis=0)

    # Meta-learner combines
    X_meta = np.column_stack([xgb_preds, lgb_preds, cat_preds])
    minutes_pred_raw = models['minutes_meta'].predict(X_meta)

    # Calibrate
    minutes_pred = models['minutes_calibrator'].predict(minutes_pred_raw)
    minutes_pred = np.clip(minutes_pred, 0, 90)

    # Combined xMins
    xmins_predicted = start_proba * minutes_pred

    # Calculate MAE
    mae = mean_absolute_error(actual_minutes, xmins_predicted)

    # Calculate accuracy at thresholds
    thresholds = [15, 20, 25, 30]
    accuracy_metrics = {}

    print(f"\n  [OK] ULTIMATE Model Performance:")
    print(f"     MAE: {mae:.2f} minutes")
    print(f"     Avg predicted xMins: {xmins_predicted.mean():.1f}")
    print(f"     Avg actual minutes: {actual_minutes.mean():.1f}")
    print(f"\n  [ACCURACY] Threshold Performance:")

    for threshold in thresholds:
        within_tolerance = np.abs(actual_minutes - xmins_predicted) <= threshold
        accuracy = within_tolerance.mean()
        accuracy_metrics[f'accuracy_within_{threshold}min'] = accuracy

        if accuracy >= 0.90 and threshold <= 25:
            status = "*** NORTH_STAR ACHIEVED ***"
        elif accuracy >= 0.85:
            status = "[EXCELLENT]"
        elif accuracy >= 0.80:
            status = "[GOOD]"
        else:
            status = "[PROGRESS]"

        print(f"     +/-{threshold} min: {accuracy:.2%} {status}")

    return accuracy_metrics


def main():
    """
    Ultimate accuracy push: Stacking + Calibration combined.
    """
    print("=" * 60)
    print("ULTIMATE PUSH: STACKING + CALIBRATION TO 90%")
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

    # Train ultimate model
    models = train_calibrated_stacked_ensemble(splits)

    # Evaluate
    accuracy_metrics = evaluate_ultimate_model(splits, models)

    # Save models
    print("\n[SAVE] Saving ultimate models...")

    for name, model in models['start_models'].items():
        joblib.dump(model, MODEL_DIR / f"{name}_start_ultimate.pkl")

    for name, model_list in models['minutes_base_models'].items():
        for i, model in enumerate(model_list):
            joblib.dump(model, MODEL_DIR / f"{name}_minutes_ultimate_fold{i}.pkl")

    joblib.dump(models['minutes_meta'], MODEL_DIR / "minutes_meta_ultimate.pkl")
    joblib.dump(models['minutes_calibrator'], MODEL_DIR / "minutes_calibrator_ultimate.pkl")

    metadata = {
        'version': 'ultimate_v1',
        'techniques': ['stacking', 'calibration', 'weighted_ensemble'],
        'accuracy_metrics': {k: float(v) for k, v in accuracy_metrics.items()},
    }

    with open(MODEL_DIR / "ultimate_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"  [OK] Saved ultimate models")

    # Final verdict
    acc_25 = accuracy_metrics['accuracy_within_25min']
    acc_20 = accuracy_metrics['accuracy_within_20min']

    baseline_acc = 0.8209  # From calibrated model

    if acc_20 >= 0.90:
        print(f"\n*** NORTH_STAR ACHIEVED! ***")
        print(f"   {acc_20:.2%} at +/-20 min")
        print(f"   Improvement from baseline: +{acc_20 - 0.7467:.1%}")
        return True
    elif acc_25 >= 0.90:
        print(f"\n*** NORTH_STAR ACHIEVED! ***")
        print(f"   {acc_25:.2%} at +/-25 min")
        print(f"   Improvement from baseline: +{acc_25 - 0.7467:.1%}")
        return True
    elif acc_25 > baseline_acc:
        print(f"\n[IMPROVEMENT] {acc_25:.2%} at +/-25 min")
        print(f"   Gained: +{acc_25 - baseline_acc:.2%} from calibrated model")
        print(f"   Gap to 90%: {0.90 - acc_25:.1%}")
        return False
    else:
        print(f"\n[STATUS] {acc_25:.2%} at +/-25 min")
        print(f"   No improvement over calibrated model ({baseline_acc:.2%})")
        print(f"   Gap to 90%: {0.90 - acc_25:.1%}")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
