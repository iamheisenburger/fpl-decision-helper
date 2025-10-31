"""
Feature Engineering for FPL Minutes Prediction
Transforms raw appearance data into ML-ready features
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List
import json


DATA_DIR = Path(__file__).parent.parent / "data"


def load_raw_data() -> pd.DataFrame:
    """
    Load raw training data from ingestion step.
    """
    raw_path = DATA_DIR / "training_data_raw.csv"

    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw data not found at {raw_path}. "
            "Please run ingest_historical_data.py first."
        )

    df = pd.read_csv(raw_path)
    print(f"[OK] Loaded {len(df)} appearances from {raw_path}")
    return df


def create_recency_weights(n_games: int = 8) -> np.ndarray:
    """
    Create exponential decay weights for recent form features.
    Matches the heuristic engine's recency weights.

    Args:
        n_games: Number of recent games to weight

    Returns:
        Array of weights (most recent = highest weight)
    """
    # Exponential decay: 30%, 20%, 15%, 12%, 9%, 6%, 4%, 4%
    weights = np.array([0.30, 0.20, 0.15, 0.12, 0.09, 0.06, 0.04, 0.04])
    return weights[:n_games] / weights[:n_games].sum()


def add_recent_form_features(df: pd.DataFrame, windows: List[int] = [3, 5, 8]) -> pd.DataFrame:
    """
    Add rolling window features for recent form.

    For each window size, calculate:
    - avg_minutes_last_N: Average minutes in last N games
    - start_rate_last_N: Percentage of starts in last N games
    - consistency_last_N: Standard deviation of minutes (lower = more consistent)
    - trend_last_N: Linear trend in minutes (positive = increasing)

    Args:
        df: DataFrame with player appearances
        windows: List of window sizes to compute

    Returns:
        DataFrame with added features
    """
    print("\n[BUILD] Engineering recent form features...")

    # Sort by player and gameweek
    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    for window in windows:
        print(f"  Computing {window}-game rolling features...")

        # Rolling averages
        df[f'avg_minutes_last_{window}'] = (
            df.groupby('fpl_id')['minutes']
            .transform(lambda x: x.rolling(window, min_periods=1).mean().shift(1))
        )

        df[f'start_rate_last_{window}'] = (
            df.groupby('fpl_id')['started']
            .transform(lambda x: x.rolling(window, min_periods=1).mean().shift(1))
        )

        df[f'consistency_last_{window}'] = (
            df.groupby('fpl_id')['minutes']
            .transform(lambda x: x.rolling(window, min_periods=1).std().shift(1))
        )

        # Linear trend (positive = increasing, negative = decreasing)
        def compute_trend(series):
            if len(series) < 2:
                return 0
            x = np.arange(len(series))
            y = series.values
            # Simple linear regression slope
            slope = np.polyfit(x, y, 1)[0] if len(series) >= 2 else 0
            return slope

        df[f'trend_last_{window}'] = (
            df.groupby('fpl_id')['minutes']
            .transform(lambda x: x.rolling(window, min_periods=2).apply(compute_trend).shift(1))
        )

    # Fill NaN with 0 (for players' first games)
    form_cols = [col for col in df.columns if any(f'last_{w}' in col for w in windows)]
    df[form_cols] = df[form_cols].fillna(0)

    print(f"  [OK] Added {len(form_cols)} recent form features")
    return df


def add_role_lock_feature(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect role lock (3+ consecutive 85+ minute starts).
    Matches heuristic engine logic.
    """
    print("\n[BUILD] Engineering role lock feature...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Identify 85+ minute starts
    df['is_85plus_start'] = (df['started']) & (df['minutes'] >= 85)

    # Count consecutive 85+ starts
    def count_consecutive(series):
        consecutive = []
        count = 0
        for val in series:
            if val:
                count += 1
            else:
                count = 0
            consecutive.append(count)
        return consecutive

    df['consecutive_85plus'] = (
        df.groupby('fpl_id')['is_85plus_start']
        .transform(lambda x: count_consecutive(x))
    )

    # Shift to avoid lookahead bias (use previous gameweek's count)
    df['consecutive_85plus'] = df.groupby('fpl_id')['consecutive_85plus'].shift(1).fillna(0)

    # Role lock indicator (3+ consecutive)
    df['role_lock'] = (df['consecutive_85plus'] >= 3).astype(int)

    print(f"  [OK] Role lock detected for {df['role_lock'].sum()} appearances")
    return df


def add_position_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    One-hot encode position (GK, DEF, MID, FWD).
    """
    print("\n[BUILD] Engineering position features...")

    position_dummies = pd.get_dummies(df['position'], prefix='pos')
    df = pd.concat([df, position_dummies], axis=1)

    print(f"  [OK] Added position one-hot encoding: {list(position_dummies.columns)}")
    return df


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add temporal features (gameweek number, month).
    Captures seasonality (e.g., rotation in congested periods).
    """
    print("\n[BUILD] Engineering temporal features...")

    # Gameweek number (normalized to 0-1)
    df['gameweek_norm'] = df['gameweek'] / 38

    # Month (if kickoff_time available)
    if 'kickoff_time' in df.columns:
        df['kickoff_datetime'] = pd.to_datetime(df['kickoff_time'], errors='coerce')
        df['month'] = df['kickoff_datetime'].dt.month
        df['month_norm'] = df['month'] / 12
    else:
        df['month'] = 0
        df['month_norm'] = 0

    print(f"  [OK] Added temporal features: gameweek_norm, month_norm")
    return df


def add_match_context_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add match context features (home/away).
    """
    print("\n[BUILD] Engineering match context features...")

    # Home/away binary
    df['is_home'] = (df['home_away'] == 'home').astype(int)

    print(f"  [OK] Added match context: is_home")
    return df


def add_target_variables(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create target variables for the two-stage model:
    1. started (binary): Did the player start?
    2. minutes_if_started (continuous): Minutes played IF they started
    """
    print("\n[TARGET] Creating target variables...")

    # Target 1: Started (binary)
    df['target_started'] = df['started'].astype(int)

    # Target 2: Minutes if started (only for rows where started=True)
    df['target_minutes_if_started'] = df.apply(
        lambda row: row['minutes'] if row['started'] else np.nan,
        axis=1
    )

    print(f"  [OK] Created targets: target_started, target_minutes_if_started")
    print(f"     Start rate: {df['target_started'].mean():.2%}")
    print(f"     Avg minutes if started: {df['target_minutes_if_started'].mean():.1f}")

    return df


def add_lagged_target(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add previous gameweek's minutes as a feature (strong predictor).
    """
    print("\n[BUILD] Engineering lagged target feature...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    df['prev_gw_minutes'] = df.groupby('fpl_id')['minutes'].shift(1).fillna(0)
    df['prev_gw_started'] = df.groupby('fpl_id')['started'].shift(1).fillna(0).astype(int)

    print(f"  [OK] Added lagged features: prev_gw_minutes, prev_gw_started")
    return df


def create_feature_list() -> Dict[str, List[str]]:
    """
    Define which columns are features for the ML models.

    Returns:
        Dictionary with 'features' and 'targets' keys
    """
    # Features for predicting STARTS (Stage 1: Logistic Regression)
    start_features = [
        # Position
        'pos_GK', 'pos_DEF', 'pos_MID', 'pos_FWD',

        # Recent form (3 games)
        'avg_minutes_last_3',
        'start_rate_last_3',
        'consistency_last_3',
        'trend_last_3',

        # Recent form (5 games)
        'avg_minutes_last_5',
        'start_rate_last_5',
        'consistency_last_5',
        'trend_last_5',

        # Recent form (8 games)
        'avg_minutes_last_8',
        'start_rate_last_8',
        'consistency_last_8',
        'trend_last_8',

        # Role lock
        'role_lock',
        'consecutive_85plus',

        # Lagged target
        'prev_gw_minutes',
        'prev_gw_started',

        # Temporal
        'gameweek_norm',
        'month_norm',

        # Match context
        'is_home',
    ]

    # Features for predicting MINUTES (Stage 2: Linear Regression)
    # Same as start features, but only trained on rows where started=True
    minutes_features = start_features.copy()

    targets = {
        'start': 'target_started',
        'minutes': 'target_minutes_if_started',
    }

    return {
        'start_features': start_features,
        'minutes_features': minutes_features,
        'targets': targets,
    }


def clean_and_validate(df: pd.DataFrame, feature_config: Dict) -> pd.DataFrame:
    """
    Clean dataset and validate features exist.
    """
    print("\n[CLEAN] Cleaning and validating dataset...", flush=True)

    # Check for missing features
    all_features = (
        feature_config['start_features'] +
        list(feature_config['targets'].values())
    )

    missing = [col for col in all_features if col not in df.columns]
    if missing:
        raise ValueError(f"Missing features: {missing}")

    # Remove rows with NaN in target variables (if any)
    initial_len = len(df)
    df = df.dropna(subset=['target_started'])
    dropped = initial_len - len(df)

    if dropped > 0:
        print(f"  [WARNING]  Dropped {dropped} rows with missing targets")

    # Check for infinite values
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    inf_mask = np.isinf(df[numeric_cols]).any(axis=1)
    if inf_mask.sum() > 0:
        print(f"  [WARNING]  Found {inf_mask.sum()} rows with infinite values, dropping...")
        df = df[~inf_mask]

    print(f"  [OK] Dataset cleaned: {len(df)} valid rows")
    return df


def save_engineered_data(df: pd.DataFrame, feature_config: Dict):
    """
    Save feature-engineered dataset for training.
    """
    output_path = DATA_DIR / "training_data_features.csv"
    df.to_csv(output_path, index=False)
    print(f"\n[SAVED] Saved feature-engineered data: {output_path}")

    # Save feature configuration
    config_path = DATA_DIR / "feature_config.json"
    with open(config_path, 'w') as f:
        json.dump(feature_config, f, indent=2)
    print(f"[SAVED] Saved feature config: {config_path}")

    # Print summary
    print(f"\n[STATS] Feature Engineering Summary:")
    print(f"   Total appearances: {len(df):,}")
    print(f"   Training samples (started): {df['target_started'].sum():,}")
    print(f"   Start rate: {df['target_started'].mean():.2%}")
    print(f"   Avg minutes (if started): {df[df['target_started']==1]['target_minutes_if_started'].mean():.1f}")
    print(f"   Number of features: {len(feature_config['start_features'])}")


def main():
    """
    Main execution: Load raw data, engineer features, save for training.
    """
    print("=" * 60)
    print("FPL ML Feature Engineering")
    print("=" * 60)

    try:
        # Load raw data
        df = load_raw_data()

        # Engineer features
        df = add_recent_form_features(df, windows=[3, 5, 8])
        df = add_role_lock_feature(df)
        df = add_position_features(df)
        df = add_temporal_features(df)
        df = add_match_context_features(df)
        df = add_lagged_target(df)
        df = add_target_variables(df)

        # Get feature configuration
        feature_config = create_feature_list()

        # Clean and validate
        df = clean_and_validate(df, feature_config)

        # Save
        save_engineered_data(df, feature_config)

        print("\n[OK] Feature engineering complete!")
        print(f"   Next step: Run train_models.py to train ML models")

    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        raise


if __name__ == "__main__":
    main()
