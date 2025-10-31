"""
Add Rotation Volatility Features to Address Error Patterns
Based on error analysis showing 33% false starts and 16% surprise starters
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json

DATA_DIR = Path(__file__).parent.parent / "data"


def add_rotation_volatility_features(df):
    """
    Add features to capture rotation unpredictability.
    Addresses the "false start" and "surprise starter" error patterns.
    """
    print("\n[ENHANCE] Adding rotation volatility features...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Feature 1: Start inconsistency (how volatile is start status)
    # If player alternates between starting/benched, this is high
    df['start_volatility_5gw'] = (
        df.groupby('fpl_id')['started']
        .rolling(window=5, min_periods=2)
        .std()
        .reset_index(level=0, drop=True)
    )
    df['start_volatility_5gw'] = df.groupby('fpl_id')['start_volatility_5gw'].shift(1).fillna(0)

    # Feature 2: "Rested last game" - if benched last GW, more likely to start this GW (rotation)
    df['rested_last_gw'] = ((df.groupby('fpl_id')['started'].shift(1) == False) &
                            (df.groupby('fpl_id')['minutes'].shift(1) < 10)).astype(int)

    # Feature 3: "Played 2 consecutive" - if started last 2 GWs, might be rested
    last_2_starts = (
        df.groupby('fpl_id')['started']
        .rolling(window=2, min_periods=2)
        .sum()
        .reset_index(level=0, drop=True)
    )
    df['started_last_2'] = df.groupby('fpl_id')['started'].shift(1).rolling(window=2).sum().fillna(0)
    df['consecutive_starts'] = (df['started_last_2'] == 2).astype(int)

    # Feature 4: Minutes variance (high variance = rotation risk)
    df['minutes_std_5gw'] = (
        df.groupby('fpl_id')['minutes']
        .rolling(window=5, min_periods=2)
        .std()
        .reset_index(level=0, drop=True)
    )
    df['minutes_std_5gw'] = df.groupby('fpl_id')['minutes_std_5gw'].shift(1).fillna(0)

    # Feature 5: Team rotation unpredictability per position
    # For each team-position, calculate how often the same player starts
    team_pos_stability = {}

    for team in df['team'].unique():
        for pos in df['position'].unique():
            mask = (df['team'] == team) & (df['position'] == pos)
            team_pos_data = df[mask]

            if len(team_pos_data) > 0:
                # Count unique starters per gameweek
                starters_per_gw = team_pos_data[team_pos_data['started'] == True].groupby('gameweek')['fpl_id'].nunique()
                avg_unique_starters = starters_per_gw.mean() if len(starters_per_gw) > 0 else 1
                team_pos_stability[(team, pos)] = avg_unique_starters
            else:
                team_pos_stability[(team, pos)] = 1

    df['team_pos_rotation_rate'] = df.apply(
        lambda row: team_pos_stability.get((row['team'], row['position']), 1),
        axis=1
    )

    # Feature 6: "Surprise starter" risk - player with low start_rate but high squad depth
    # Only add if squad_depth_position exists
    if 'squad_depth_position' in df.columns:
        df['surprise_starter_risk'] = ((df['start_rate_last_5'] < 0.3) &
                                       (df['squad_depth_position'] >= 2)).astype(int)
    else:
        df['surprise_starter_risk'] = 0

    # Feature 7: Fixture congestion indicator
    # Calculate days since last match (if <3 days, rotation risk higher)
    df['kickoff_time'] = pd.to_datetime(df['kickoff_time'], errors='coerce')
    df['days_since_last_match'] = (
        df.groupby('fpl_id')['kickoff_time']
        .diff()
        .dt.total_seconds() / (24 * 3600)
    ).fillna(7)

    df['fixture_congestion'] = (df['days_since_last_match'] < 3.5).astype(int)

    print(f"  [OK] Added 7 rotation volatility features")
    print(f"     Start volatility mean: {df['start_volatility_5gw'].mean():.3f}")
    print(f"     Rested last GW: {df['rested_last_gw'].sum():,} cases ({df['rested_last_gw'].mean():.1%})")
    print(f"     Consecutive starts: {df['consecutive_starts'].sum():,} cases")
    print(f"     Fixture congestion: {df['fixture_congestion'].sum():,} cases ({df['fixture_congestion'].mean():.1%})")
    print(f"     Surprise starter risk: {df['surprise_starter_risk'].sum():,} cases")

    return df


def main():
    """
    Add rotation volatility features to training data.
    """
    print("=" * 60)
    print("ADDING ROTATION VOLATILITY FEATURES")
    print("=" * 60)

    # Load existing training data
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    df = pd.read_csv(data_path)

    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"[OK] Loaded {len(df):,} samples with {len(config['start_features'])} features")

    # Add rotation features
    df = add_rotation_volatility_features(df)

    # Add squad depth and manager profiles (if not already present)
    if 'squad_depth_position' not in df.columns:
        print("\n[BUILD] Computing squad depth...")
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

    if 'manager_early_sub_rate' not in df.columns:
        print("\n[BUILD] Computing manager profiles...")
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

    # Update config with new features
    new_features = ['start_volatility_5gw', 'rested_last_gw', 'consecutive_starts',
                   'minutes_std_5gw', 'team_pos_rotation_rate', 'surprise_starter_risk',
                   'fixture_congestion']

    # Add to both start and minutes features
    config['start_features'] = config['start_features'] + new_features
    config['minutes_features'] = config['minutes_features'] + new_features

    # Remove duplicates
    config['start_features'] = list(dict.fromkeys(config['start_features']))
    config['minutes_features'] = list(dict.fromkeys(config['minutes_features']))

    print(f"\n[OK] Total features: {len(config['start_features'])} (added 7 new)")

    # Save updated data
    df.to_csv(data_path, index=False)
    print(f"[SAVE] Updated training data saved")

    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"[SAVE] Updated config saved")

    print("\n[SUCCESS] Rotation volatility features added!")
    print(f"  Ready to retrain with {len(config['start_features'])} features")


if __name__ == "__main__":
    main()
