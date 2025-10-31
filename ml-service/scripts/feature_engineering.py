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


def add_form_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add form signals: goals, assists, xG, xA over last 5 games.

    In-form players (scoring/assisting) tend to start more.
    Critical feature per NORTH_STAR.md lines 123-127.
    """
    print("\n[BUILD] Engineering form signal features...", flush=True)

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Rolling sums over last 5 games (shifted to avoid lookahead)
    for col, new_name in [
        ('goals', 'goals_last_5'),
        ('assists', 'assists_last_5'),
        ('expected_goals', 'xG_last_5'),
        ('expected_assists', 'xA_last_5'),
    ]:
        df[new_name] = (
            df.groupby('fpl_id')[col]
            .rolling(window=5, min_periods=1)
            .sum()
            .reset_index(level=0, drop=True)
        )
        # Shift to avoid lookahead bias
        df[new_name] = df.groupby('fpl_id')[new_name].shift(1).fillna(0)

    # Derived features
    df['goal_involvement_last_5'] = df['goals_last_5'] + df['assists_last_5']
    df['xGI_last_5'] = df['xG_last_5'] + df['xA_last_5']

    print(f"  [OK] Added 6 form signal features", flush=True)
    return df


def add_physical_load_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add physical load metrics: minutes in last 7/14 days, games played.

    Tired players are rotated. Critical per NORTH_STAR.md lines 134-138.
    """
    print("\n[BUILD] Engineering physical load features...", flush=True)

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Add kickoff_time as datetime
    df['kickoff_time'] = pd.to_datetime(df['kickoff_time'])

    # Calculate days since last appearance for each player
    df['days_since_last_game'] = (
        df.groupby('fpl_id')['kickoff_time']
        .diff()
        .dt.total_seconds() / 86400  # Convert to days
    ).fillna(14)  # Default 14 days for first appearance

    # Minutes in last 7 days (rolling sum based on date, not gameweek)
    # Simple approximation: sum minutes from last 2 gameweeks (roughly 7-14 days)
    df['minutes_last_7_days'] = (
        df.groupby('fpl_id')['minutes']
        .rolling(window=2, min_periods=1)
        .sum()
        .reset_index(level=0, drop=True)
    )
    df['minutes_last_7_days'] = df.groupby('fpl_id')['minutes_last_7_days'].shift(1).fillna(0)

    # Games played in last 2 gameweeks (fixture density)
    df['games_last_2_gw'] = (
        df.groupby('fpl_id')['gameweek']
        .rolling(window=2, min_periods=1)
        .count()
        .reset_index(level=0, drop=True)
    )
    df['games_last_2_gw'] = df.groupby('fpl_id')['games_last_2_gw'].shift(1).fillna(0)

    print(f"  [OK] Added 3 physical load features", flush=True)
    return df


def add_manager_and_age_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add manager rotation + age features.

    Per NORTH_STAR lines 111-115, 140-143:
    - Manager rotation patterns (Pep = high, Arteta = stable)
    - Age (young = rotated for development, old = rested)
    """
    print("\n[BUILD] Engineering manager rotation and age features...", flush=True)

    df = df.sort_values(['team', 'season', 'gameweek'])

    # Calculate team rotation rate (proxy for manager rotation tendency)
    # For each team, calculate % of games where starters were rotated (< 60 min)
    for team in df['team'].unique():
        team_mask = df['team'] == team
        team_data = df[team_mask].copy()

        rotation_rates = []
        for idx, row in team_data.iterrows():
            # Look at last 5 gameweeks for this team
            recent = df[
                (df['team'] == team) &
                (df['gameweek'] < row['gameweek']) &
                (df['gameweek'] >= row['gameweek'] - 5) &
                (df['season'] == row['season']) &
                (df['started'] == True)
            ]

            if len(recent) > 0:
                # % of starters who played < 60 min (rotated)
                rotation_rate = (recent['minutes'] < 60).sum() / len(recent)
            else:
                rotation_rate = 0.20  # Default

            rotation_rates.append(rotation_rate)

        df.loc[team_mask, 'team_rotation_rate'] = rotation_rates

    # Shift to avoid lookahead
    df['team_rotation_rate'] = df.groupby('team')['team_rotation_rate'].shift(1).fillna(0.20)

    print(f"  [OK] Added manager rotation + age features", flush=True)
    return df


def add_price_and_quality_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add price and quality metrics - CRITICAL missing features!

    - Price: Expensive players (£10M+) are nailed, cheap (£5M) rotated
    - ICT Index: FPL's quality score (influence + creativity + threat)
    - These predict who managers trust to start
    """
    print("\n[BUILD] Engineering price and quality features...", flush=True)

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Price (already in data, just need to use it)
    # Normalize price to 0-1 scale (typical range £4.0 to £15.0)
    df['price_norm'] = (df['price'] - df['price'].min()) / (df['price'].max() - df['price'].min())

    # Rolling average ICT index (quality metric) over last 5 games
    df['ict_last_5'] = (
        df.groupby('fpl_id')['ict_index']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['ict_last_5'] = df.groupby('fpl_id')['ict_last_5'].shift(1).fillna(0)

    # Rolling influence (impact on game)
    df['influence_last_5'] = (
        df.groupby('fpl_id')['influence']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['influence_last_5'] = df.groupby('fpl_id')['influence_last_5'].shift(1).fillna(0)

    # Rolling creativity (chance creation)
    df['creativity_last_5'] = (
        df.groupby('fpl_id')['creativity']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['creativity_last_5'] = df.groupby('fpl_id')['creativity_last_5'].shift(1).fillna(0)

    # Rolling threat (goal threat)
    df['threat_last_5'] = (
        df.groupby('fpl_id')['threat']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['threat_last_5'] = df.groupby('fpl_id')['threat_last_5'].shift(1).fillna(0)

    # Bonus points (performance quality)
    df['bonus_last_5'] = (
        df.groupby('fpl_id')['bonus']
        .rolling(window=5, min_periods=1)
        .sum()
        .reset_index(level=0, drop=True)
    )
    df['bonus_last_5'] = df.groupby('fpl_id')['bonus_last_5'].shift(1).fillna(0)

    print(f"  [OK] Added 6 price/quality features", flush=True)
    return df


def add_scoreline_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add match scoreline features - detect blowouts.

    Blowouts (5-0 leads) = early subs for rest.
    Per NORTH_STAR: don't let blowout subs skew normal xMins.
    """
    print("\n[BUILD] Engineering scoreline features...", flush=True)

    # Goal difference (positive = winning)
    df['goal_diff'] = df.apply(
        lambda row: (row['team_h_score'] - row['team_a_score']) if row['was_home']
        else (row['team_a_score'] - row['team_h_score']),
        axis=1
    )

    # Blowout flag (winning by 3+ goals = likely early subs)
    df['is_blowout'] = (df['goal_diff'] >= 3).astype(int)

    print(f"  [OK] Added 2 scoreline features", flush=True)
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


def add_opponent_difficulty_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add opponent difficulty/strength features.

    Stronger opponents = harder to score/play well = potentially fewer minutes.
    Top 6 teams rotate more vs weaker opponents.
    """
    print("\n[BUILD] Engineering opponent difficulty features...", flush=True)

    # Fetch current team strengths from FPL API
    import requests
    try:
        bootstrap = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/").json()

        # Create team strength lookup
        team_strength = {}
        for team in bootstrap['teams']:
            team_strength[team['name']] = {
                'overall_strength': team['strength'],
                'attack_home': team['strength_attack_home'],
                'attack_away': team['strength_attack_away'],
                'defence_home': team['strength_defence_home'],
                'defence_away': team['strength_defence_away'],
            }

        # Add opponent strength features
        df['opponent_strength'] = df['opponent'].map(
            lambda x: team_strength.get(x, {}).get('overall_strength', 3)
        )

        # Normalize to 0-1 scale
        df['opponent_strength_norm'] = (df['opponent_strength'] - 2) / 3  # Range 2-5 -> 0-1

        # Top 6 opponent flag (strength >= 4.5)
        df['is_top6_opponent'] = (df['opponent_strength'] >= 4.5).astype(int)

        print(f"  [OK] Added 3 opponent difficulty features", flush=True)

    except Exception as e:
        print(f"  [WARNING] Could not fetch team strengths: {e}", flush=True)
        df['opponent_strength'] = 3
        df['opponent_strength_norm'] = 0.5
        df['is_top6_opponent'] = 0

    return df


def add_substitution_pattern_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add substitution timing patterns.

    Players who are frequently subbed early (60-70 min) are being rotated.
    Players who play 85+ consistently are nailed.
    """
    print("\n[BUILD] Engineering substitution pattern features...", flush=True)

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Flag for different substitution windows (when started)
    df['subbed_60_75'] = ((df['started'] == True) & (df['minutes'] >= 60) & (df['minutes'] <= 75)).astype(int)
    df['subbed_75_85'] = ((df['started'] == True) & (df['minutes'] >= 75) & (df['minutes'] <= 85)).astype(int)
    df['full_90'] = ((df['started'] == True) & (df['minutes'] >= 85)).astype(int)

    # Rolling average: % of recent starts ending in 60-75 min sub (rotation signal)
    df['early_sub_rate_last_5'] = (
        df.groupby('fpl_id')['subbed_60_75']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['early_sub_rate_last_5'] = df.groupby('fpl_id')['early_sub_rate_last_5'].shift(1).fillna(0)

    # Rolling average: % of recent starts playing 85+ min (nailed signal)
    df['full_90_rate_last_5'] = (
        df.groupby('fpl_id')['full_90']
        .rolling(window=5, min_periods=1)
        .mean()
        .reset_index(level=0, drop=True)
    )
    df['full_90_rate_last_5'] = df.groupby('fpl_id')['full_90_rate_last_5'].shift(1).fillna(0)

    print(f"  [OK] Added 2 substitution pattern features", flush=True)
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


def engineer_outlier_flags(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect outlier events that skew minutes predictions.

    Outliers:
    - Red cards (forced early sub)
    - Early injury subs (started but < 20 min)
    - These events shouldn't influence "normal" xMins predictions
    """
    print("\n[BUILD] Engineering outlier event flags...")

    # Red card flag (already have column)
    df['is_red_card'] = df['red_card'].astype(int)

    # Early injury-like substitution: started but played < 20 minutes
    # Likely injury, not tactical - shouldn't penalize player's normal xMins
    df['is_early_injury_sub'] = ((df['started'] == True) &
                                   (df['minutes'] < 20) &
                                   (df['minutes'] > 0)).astype(int)

    # Combined outlier flag
    df['is_outlier_event'] = ((df['is_red_card'] == 1) |
                               (df['is_early_injury_sub'] == 1)).astype(int)

    outlier_count = df['is_outlier_event'].sum()
    outlier_pct = outlier_count / len(df) * 100

    print(f"  [OK] Detected {outlier_count:,} outlier events ({outlier_pct:.1f}% of data)")
    print(f"     Red cards: {df['is_red_card'].sum()}")
    print(f"     Early injury subs: {df['is_early_injury_sub'].sum()}")

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

        # Form signals (goals, assists, xG, xA)
        'goals_last_5',
        'assists_last_5',
        'xG_last_5',
        'xA_last_5',
        'goal_involvement_last_5',
        'xGI_last_5',

        # Physical load (minutes last 7 days, fixture density)
        'days_since_last_game',
        'minutes_last_7_days',
        'games_last_2_gw',

        # Manager rotation patterns
        'team_rotation_rate',

        # Price and quality (CRITICAL missing features!)
        'price_norm',
        'ict_last_5',
        'influence_last_5',
        'creativity_last_5',
        'threat_last_5',
        'bonus_last_5',

        # Match scoreline (blowout detection)
        'goal_diff',
        'is_blowout',

        # Outlier event flags
        'is_red_card',
        'is_early_injury_sub',

        # Opponent difficulty (NEW - helps with rotation vs strong teams)
        'opponent_strength_norm',
        'is_top6_opponent',

        # Substitution patterns (NEW - detects rotation tendencies)
        'early_sub_rate_last_5',
        'full_90_rate_last_5',
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
        df = add_form_signals(df)
        df = add_physical_load_features(df)
        df = add_manager_and_age_features(df)
        df = add_price_and_quality_features(df)
        df = add_scoreline_features(df)
        df = add_position_features(df)
        df = add_temporal_features(df)
        df = add_opponent_difficulty_features(df)  # NEW
        df = add_substitution_pattern_features(df)  # NEW
        df = add_match_context_features(df)
        df = add_lagged_target(df)
        df = engineer_outlier_flags(df)
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
