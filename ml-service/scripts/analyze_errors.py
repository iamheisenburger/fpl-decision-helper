"""
Error Analysis: Understand where the 82% model is failing
Identify patterns in the 18% of predictions that are off by >25 minutes
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import joblib
from collections import Counter

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


def load_calibrated_models():
    """Load the best performing calibrated models."""
    start_model = joblib.load(MODEL_DIR / "start_model_calibrated.pkl")
    minutes_model = joblib.load(MODEL_DIR / "minutes_model_calibrated.pkl")
    iso_reg = joblib.load(MODEL_DIR / "isotonic_calibrator.pkl")

    return start_model, minutes_model, iso_reg


def analyze_prediction_errors(df, config, models):
    """
    Analyze where the model makes large errors.
    """
    print("\n" + "=" * 60)
    print("ERROR ANALYSIS: Understanding the 18% miss rate")
    print("=" * 60)

    from sklearn.model_selection import train_test_split

    X_start = df[config['start_features']]
    y_start = df[config['targets']['start']]
    actual_minutes_full = df['minutes'].copy()

    # Same split as training
    X_train, X_test, y_train, y_test, actual_train, actual_test = train_test_split(
        X_start, y_start, actual_minutes_full, test_size=0.2, random_state=42, stratify=y_start
    )

    # Get test indices to retrieve full rows
    test_indices = X_test.index

    # Get predictions
    start_model, minutes_model, iso_reg = models

    start_proba = start_model.predict_proba(X_test)[:, 1]
    minutes_pred_raw = minutes_model.predict(X_test)
    minutes_pred = iso_reg.predict(minutes_pred_raw)
    minutes_pred = np.clip(minutes_pred, 0, 90)

    xmins_predicted = start_proba * minutes_pred
    actual_minutes = actual_test.values

    # Calculate errors
    errors = np.abs(actual_minutes - xmins_predicted)

    # Identify large errors (>25 min)
    large_error_mask = errors > 25
    large_errors = errors[large_error_mask]
    large_error_indices = test_indices[large_error_mask]

    print(f"\n[STATS] Error Distribution:")
    print(f"  Total test samples: {len(errors):,}")
    print(f"  Large errors (>25 min): {len(large_errors):,} ({len(large_errors)/len(errors)*100:.1f}%)")
    print(f"  Mean error (large errors): {large_errors.mean():.1f} minutes")
    print(f"  Max error: {errors.max():.1f} minutes")

    # Analyze characteristics of large errors
    error_df = df.loc[large_error_indices].copy()
    error_df['predicted_xmins'] = xmins_predicted[large_error_mask]
    error_df['actual_minutes'] = actual_minutes[large_error_mask]
    error_df['error'] = large_errors

    print(f"\n[ANALYSIS] Characteristics of Large Errors:")

    # 1. Position breakdown
    print(f"\n  1. Position Distribution:")
    pos_counts = error_df['position'].value_counts()
    total_by_pos = df.loc[test_indices]['position'].value_counts()
    for pos in ['GK', 'DEF', 'MID', 'FWD']:
        if pos in pos_counts:
            error_rate = pos_counts[pos] / total_by_pos[pos] * 100
            print(f"     {pos}: {pos_counts[pos]:,} errors ({error_rate:.1f}% of {pos} predictions)")

    # 2. Team breakdown (top 5 teams with most errors)
    print(f"\n  2. Teams with Most Errors (Top 10):")
    team_counts = error_df['team'].value_counts().head(10)
    for team, count in team_counts.items():
        total_team = len(df.loc[test_indices][df.loc[test_indices]['team'] == team])
        error_rate = count / total_team * 100 if total_team > 0 else 0
        print(f"     {team}: {count} errors ({error_rate:.1f}% of team predictions)")

    # 3. Started vs Bench errors
    print(f"\n  3. Start Status:")
    started_errors = error_df['started'].value_counts()
    total_started = df.loc[test_indices]['started'].value_counts()
    for status in [True, False]:
        if status in started_errors:
            error_rate = started_errors[status] / total_started[status] * 100
            status_str = "Started" if status else "Benched"
            print(f"     {status_str}: {started_errors[status]:,} errors ({error_rate:.1f}% of {status_str.lower()} predictions)")

    # 4. Error types
    print(f"\n  4. Error Types:")

    # Over-predictions (predicted much higher than actual)
    over_pred = error_df[error_df['predicted_xmins'] > error_df['actual_minutes'] + 25]
    # Under-predictions (predicted much lower than actual)
    under_pred = error_df[error_df['actual_minutes'] > error_df['predicted_xmins'] + 25]

    print(f"     Over-predictions (predicted > actual): {len(over_pred):,} ({len(over_pred)/len(error_df)*100:.1f}%)")
    print(f"     Under-predictions (predicted < actual): {len(under_pred):,} ({len(under_pred)/len(error_df)*100:.1f}%)")

    # 5. Specific failure patterns
    print(f"\n  5. Common Failure Patterns:")

    # Pattern 1: Predicted to start, didn't
    pattern1 = error_df[(error_df['predicted_xmins'] > 40) & (error_df['started'] == False)]
    print(f"     A. Predicted start, didn't: {len(pattern1):,} cases")
    if len(pattern1) > 0:
        print(f"        Avg prediction: {pattern1['predicted_xmins'].mean():.1f} min")
        print(f"        Top 3 teams: {', '.join(pattern1['team'].value_counts().head(3).index.tolist())}")

    # Pattern 2: Started but subbed early
    pattern2 = error_df[(error_df['started'] == True) & (error_df['actual_minutes'] < 30)]
    print(f"     B. Started but subbed very early (<30 min): {len(pattern2):,} cases")
    if len(pattern2) > 0:
        print(f"        Avg actual minutes: {pattern2['actual_minutes'].mean():.1f} min")
        print(f"        Avg predicted: {pattern2['predicted_xmins'].mean():.1f} min")

    # Pattern 3: Surprise starters
    pattern3 = error_df[(error_df['actual_minutes'] > 70) & (error_df['predicted_xmins'] < 30)]
    print(f"     C. Surprise starters (actual >70, predicted <30): {len(pattern3):,} cases")
    if len(pattern3) > 0:
        print(f"        Avg actual minutes: {pattern3['actual_minutes'].mean():.1f} min")
        print(f"        Avg prev_gw_started: {pattern3['prev_gw_started'].mean():.2f}")

    # Pattern 4: High squad depth rotation
    pattern4 = error_df[error_df['high_squad_depth'] == 1]
    print(f"     D. High squad depth cases: {len(pattern4):,} cases ({len(pattern4)/len(error_df)*100:.1f}% of errors)")

    # Pattern 5: High rotation managers
    pattern5 = error_df[error_df['high_rotation_manager'] == 1]
    print(f"     E. High rotation managers: {len(pattern5):,} cases ({len(pattern5)/len(error_df)*100:.1f}% of errors)")

    # 6. Feature analysis for large errors
    print(f"\n  6. Feature Characteristics (Large Errors vs All):")

    all_test = df.loc[test_indices]

    numeric_features = ['prev_gw_minutes', 'minutes_last_7_days', 'price_norm',
                       'ict_last_5', 'start_rate_last_3', 'squad_depth_position']

    for feat in numeric_features:
        if feat in error_df.columns:
            error_mean = error_df[feat].mean()
            all_mean = all_test[feat].mean()
            diff = error_mean - all_mean
            print(f"     {feat}: {error_mean:.2f} (all: {all_mean:.2f}, diff: {diff:+.2f})")

    print("\n" + "=" * 60)
    print("KEY INSIGHTS:")
    print("=" * 60)

    # Determine top issues
    insights = []

    if len(pattern1) > len(error_df) * 0.15:
        insights.append(f"1. False start predictions: {len(pattern1)/len(error_df)*100:.0f}% of errors")

    if len(pattern2) > len(error_df) * 0.10:
        insights.append(f"2. Early substitutions: {len(pattern2)/len(error_df)*100:.0f}% of errors")

    if len(pattern3) > len(error_df) * 0.10:
        insights.append(f"3. Surprise starters: {len(pattern3)/len(error_df)*100:.0f}% of errors")

    if len(insights) == 0:
        insights.append("Errors are distributed evenly - no single dominant failure mode")

    for insight in insights:
        print(f"  {insight}")

    print("\n[RECOMMENDATION] Potential improvements:")
    if len(pattern1) > len(error_df) * 0.15:
        print("  - Improve start prediction model (too many false positives)")
    if len(pattern2) > len(error_df) * 0.10:
        print("  - Add tactical substitution features (game state, scoreline)")
    if len(pattern3) > len(error_df) * 0.10:
        print("  - Better capture rotation patterns and surprise selections")

    return error_df


def main():
    """
    Analyze prediction errors from the best model.
    """
    print("[LOAD] Loading data and models...")
    df, config = load_training_data()
    models = load_calibrated_models()

    error_df = analyze_prediction_errors(df, config, models)

    # Save error analysis
    output_path = DATA_DIR / "error_analysis.csv"
    error_df.to_csv(output_path, index=False)
    print(f"\n[SAVE] Error analysis saved to {output_path}")


if __name__ == "__main__":
    main()
