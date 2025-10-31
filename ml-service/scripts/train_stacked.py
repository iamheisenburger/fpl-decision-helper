"""
STACKING ENSEMBLE: Meta-learner to combine XGBoost + LightGBM + CatBoost
Uses a second-level model to learn optimal combination weights
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
from sklearn.ensemble import RandomForestRegressor

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


def train_base_models_with_cv(X_train, y_train, n_folds=5):
    """
    Train base models using cross-validation to generate out-of-fold predictions.
    This prevents overfitting in the meta-learner.
    """
    print("\n[STACK] Training base models with cross-validation...")

    kf = KFold(n_splits=n_folds, shuffle=True, random_state=42)

    # Store out-of-fold predictions
    oof_xgb = np.zeros(len(X_train))
    oof_lgb = np.zeros(len(X_train))
    oof_cat = np.zeros(len(X_train))

    # Store trained models
    xgb_models = []
    lgb_models = []
    cat_models = []

    for fold, (train_idx, val_idx) in enumerate(kf.split(X_train)):
        print(f"  Training fold {fold + 1}/{n_folds}...")

        X_fold_train, X_fold_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
        y_fold_train, y_fold_val = y_train.iloc[train_idx], y_train.iloc[val_idx]

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

    print(f"  [OK] Base models trained with {n_folds}-fold CV")

    return {
        'xgb_models': xgb_models,
        'lgb_models': lgb_models,
        'cat_models': cat_models,
        'oof_predictions': {
            'xgb': oof_xgb,
            'lgb': oof_lgb,
            'cat': oof_cat,
        }
    }


def train_meta_learner(oof_predictions, y_train):
    """
    Train meta-learner on out-of-fold predictions.
    Uses Ridge regression to combine base model predictions.
    """
    print("\n[META] Training meta-learner...")

    # Stack predictions as features
    X_meta = np.column_stack([
        oof_predictions['xgb'],
        oof_predictions['lgb'],
        oof_predictions['cat'],
    ])

    # Try Ridge regression (linear combination with regularization)
    meta_model = Ridge(alpha=1.0)
    meta_model.fit(X_meta, y_train)

    print(f"  [OK] Meta-learner trained")
    print(f"     Learned weights: XGB={meta_model.coef_[0]:.3f}, LGB={meta_model.coef_[1]:.3f}, CAT={meta_model.coef_[2]:.3f}")
    print(f"     Intercept: {meta_model.intercept_:.3f}")

    return meta_model


def predict_with_stacked_ensemble(base_models, meta_model, X_test):
    """
    Generate predictions using stacked ensemble.
    Average predictions from all folds, then apply meta-learner.
    """
    # Get predictions from each base model (average across folds)
    xgb_preds = np.mean([model.predict(X_test) for model in base_models['xgb_models']], axis=0)
    lgb_preds = np.mean([model.predict(X_test) for model in base_models['lgb_models']], axis=0)
    cat_preds = np.mean([model.predict(X_test) for model in base_models['cat_models']], axis=0)

    # Stack predictions
    X_meta = np.column_stack([xgb_preds, lgb_preds, cat_preds])

    # Meta-learner combines predictions
    final_predictions = meta_model.predict(X_meta)

    return final_predictions


def train_stacked_models(splits):
    """
    Train stacked ensemble for both stages.
    """
    print("\n[STACK] Training stacked ensemble...")

    # Stage 1: Start (classification)
    n_neg = (splits['start']['y_train'] == 0).sum()
    n_pos = (splits['start']['y_train'] == 1).sum()

    print("\n  Stage 1: Start Probability")

    # For classification, we'll use the calibrated models from train_calibrated.py
    # and stack them with a meta-classifier

    # Train XGBoost
    xgb_start = xgb.XGBClassifier(
        max_depth=4, learning_rate=0.03, n_estimators=200,
        min_child_weight=3, subsample=0.7, colsample_bytree=0.9,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, eval_metric='logloss'
    )
    xgb_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Train LightGBM
    lgb_start = lgb.LGBMClassifier(
        max_depth=6, learning_rate=0.05, n_estimators=200,
        num_leaves=31, subsample=0.8,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=-1
    )
    lgb_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    # Train CatBoost
    cat_start = cb.CatBoostClassifier(
        depth=6, learning_rate=0.05, iterations=200,
        scale_pos_weight=n_neg / n_pos,
        random_state=42, verbose=False
    )
    cat_start.fit(splits['start']['X_train'], splits['start']['y_train'])

    print("  [OK] Stage 1 models trained")

    # Stage 2: Minutes (regression with stacking)
    print("\n  Stage 2: Minutes Prediction (with stacking)")

    base_models = train_base_models_with_cv(
        splits['minutes']['X_train'],
        splits['minutes']['y_train'],
        n_folds=5
    )

    meta_model = train_meta_learner(
        base_models['oof_predictions'],
        splits['minutes']['y_train']
    )

    return {
        'start_models': {
            'xgb': xgb_start,
            'lgb': lgb_start,
            'cat': cat_start,
        },
        'minutes_base_models': base_models,
        'minutes_meta_model': meta_model,
    }


def evaluate_stacked_ensemble(splits, models):
    """
    Evaluate stacked ensemble with CORRECT combined metric.
    """
    print("\n[EVAL] Evaluating stacked ensemble...")

    X_test = splits['start']['X_test']
    actual_minutes = splits['start']['actual_test'].values

    # Stage 1: Start predictions (simple average of classifiers)
    xgb_start_proba = models['start_models']['xgb'].predict_proba(X_test)[:, 1]
    lgb_start_proba = models['start_models']['lgb'].predict_proba(X_test)[:, 1]
    cat_start_proba = models['start_models']['cat'].predict_proba(X_test)[:, 1]

    start_proba = (xgb_start_proba + lgb_start_proba + cat_start_proba) / 3

    # Stage 2: Minutes predictions (stacked with meta-learner)
    minutes_pred = predict_with_stacked_ensemble(
        models['minutes_base_models'],
        models['minutes_meta_model'],
        X_test
    )
    minutes_pred = np.clip(minutes_pred, 0, 90)

    # Combined xMins
    xmins_predicted = start_proba * minutes_pred

    # Calculate MAE
    mae = mean_absolute_error(actual_minutes, xmins_predicted)

    # Calculate accuracy at thresholds
    thresholds = [15, 20, 25, 30]
    accuracy_metrics = {}

    print(f"\n  [OK] Stacked Ensemble Performance:")
    print(f"     MAE: {mae:.2f} minutes")
    print(f"     Avg predicted xMins: {xmins_predicted.mean():.1f}")
    print(f"     Avg actual minutes: {actual_minutes.mean():.1f}")
    print(f"\n  [ACCURACY] Threshold Performance:")

    for threshold in thresholds:
        within_tolerance = np.abs(actual_minutes - xmins_predicted) <= threshold
        accuracy = within_tolerance.mean()
        accuracy_metrics[f'accuracy_within_{threshold}min'] = accuracy

        if accuracy >= 0.90 and threshold <= 25:
            status = "*** NORTH_STAR HIT ***"
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
    Train stacked ensemble for maximum accuracy push toward 90%.
    """
    print("=" * 60)
    print("STACKED ENSEMBLE: META-LEARNING PUSH TO 90%")
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

    # Train stacked models
    models = train_stacked_models(splits)

    # Evaluate
    accuracy_metrics = evaluate_stacked_ensemble(splits, models)

    # Save models
    print("\n[SAVE] Saving stacked ensemble models...")

    # Save start models
    for name, model in models['start_models'].items():
        joblib.dump(model, MODEL_DIR / f"{name}_start_stacked.pkl")

    # Save minutes base models (all folds)
    for i, model in enumerate(models['minutes_base_models']['xgb_models']):
        joblib.dump(model, MODEL_DIR / f"xgb_minutes_stacked_fold{i}.pkl")
    for i, model in enumerate(models['minutes_base_models']['lgb_models']):
        joblib.dump(model, MODEL_DIR / f"lgb_minutes_stacked_fold{i}.pkl")
    for i, model in enumerate(models['minutes_base_models']['cat_models']):
        joblib.dump(model, MODEL_DIR / f"cat_minutes_stacked_fold{i}.pkl")

    # Save meta-learner
    joblib.dump(models['minutes_meta_model'], MODEL_DIR / "minutes_meta_learner.pkl")

    metadata = {
        'version': 'stacked_v1',
        'ensemble_type': 'stacked_with_meta_learner',
        'meta_learner': 'Ridge',
        'cv_folds': 5,
        'accuracy_metrics': {k: float(v) for k, v in accuracy_metrics.items()},
    }

    with open(MODEL_DIR / "stacked_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"  [OK] Saved stacked ensemble models")

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
    elif acc_25 >= 0.82:
        print(f"\n[PROGRESS] {acc_25:.2%} at +/-25 min")
        print(f"   Gap to 90%: {0.90 - acc_25:.1%}")
        print(f"   Improvement from calibrated: +{acc_25 - 0.8209:.2%}")
        return False
    else:
        print(f"\n[STATUS] {acc_25:.2%} at +/-25 min")
        print(f"   Gap to 90%: {0.90 - acc_25:.1%}")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
