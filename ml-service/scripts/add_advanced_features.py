"""
Add Advanced Features for 85-90% Accuracy Target
Focus on improving START prediction (Stage 1) which is causing most errors
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import requests

DATA_DIR = Path(__file__).parent.parent / "data"


def add_days_since_last_start(df):
    """Critical rotation indicator - how many days since player last started"""
    print("[FEATURE] Days since last start...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])
    df['kickoff_time'] = pd.to_datetime(df['kickoff_time'], errors='coerce')

    # Get last start date for each player
    df['last_start_date'] = df[df['started'] == True].groupby('fpl_id')['kickoff_time'].shift(1)

    # Calculate days since last start
    df['days_since_last_start'] = (df['kickoff_time'] - df['last_start_date']).dt.total_seconds() / (24 * 3600)
    df['days_since_last_start'] = df['days_since_last_start'].fillna(14)  # Default to 2 weeks if no recent start

    # Rotation risk indicators
    df['rested_7plus_days'] = (df['days_since_last_start'] >= 7).astype(int)
    df['played_within_3_days'] = (df['days_since_last_start'] <= 3).astype(int)

    print(f"  Mean days since last start: {df['days_since_last_start'].mean():.1f}")
    print(f"  Rested 7+ days: {df['rested_7plus_days'].sum():,} cases")
    print(f"  Played within 3 days: {df['played_within_3_days'].sum():,} cases")

    return df


def add_minutes_trend(df):
    """Minutes trajectory - increasing (getting nailed) or decreasing (being rotated)"""
    print("[FEATURE] Minutes trend (slope over last 5)...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Calculate linear trend of minutes over last 5 games
    def calculate_trend(series):
        if len(series) < 2:
            return 0
        x = np.arange(len(series))
        y = series.values
        if np.all(y == y[0]):  # All same value
            return 0
        slope = np.polyfit(x, y, 1)[0]
        return slope

    df['minutes_trend_5gw'] = (
        df.groupby('fpl_id')['minutes']
        .rolling(window=5, min_periods=2)
        .apply(calculate_trend, raw=False)
        .reset_index(level=0, drop=True)
    )
    df['minutes_trend_5gw'] = df.groupby('fpl_id')['minutes_trend_5gw'].shift(1).fillna(0)

    # Binary indicators
    df['minutes_increasing'] = (df['minutes_trend_5gw'] > 5).astype(int)
    df['minutes_decreasing'] = (df['minutes_trend_5gw'] < -5).astype(int)

    print(f"  Mean trend: {df['minutes_trend_5gw'].mean():.2f} min/game")
    print(f"  Increasing: {df['minutes_increasing'].sum():,} cases")
    print(f"  Decreasing: {df['minutes_decreasing'].sum():,} cases")

    return df


def add_yellow_card_risk(df):
    """Yellow card accumulation - rotation risk near suspension thresholds"""
    print("[FEATURE] Yellow card suspension risk...")

    # FPL rules: 5 yellows = 1 game ban, 10 = 2 games, 15 = 3 games
    # Assume we don't have season-long yellow card data, so use recent as proxy
    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Count yellows in last 10 games (proxy for season total)
    df['yellows_last_10'] = (
        df.groupby('fpl_id')['yellow_card']
        .rolling(window=10, min_periods=1)
        .sum()
        .reset_index(level=0, drop=True)
    )
    df['yellows_last_10'] = df.groupby('fpl_id')['yellows_last_10'].shift(1).fillna(0)

    # Risk of suspension (4 yellows = at risk)
    df['yellow_card_risk'] = (df['yellows_last_10'] >= 4).astype(int)

    print(f"  Mean yellows (last 10): {df['yellows_last_10'].mean():.2f}")
    print(f"  High yellow card risk: {df['yellow_card_risk'].sum():,} cases")

    return df


def add_age_features(df):
    """Age-based rotation patterns - young players rotated more, old players rested"""
    print("[FEATURE] Age and rotation...")

    # Get current age from FPL API (or use birth date if available)
    # For now, we'll fetch from bootstrap-static
    try:
        response = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/")
        bootstrap = response.json()

        # Map player ID to age
        age_map = {}
        for player in bootstrap['elements']:
            fpl_id = player['id']
            # FPL doesn't provide age directly, but we can estimate from price/experience
            # Higher price + lower minutes variance = experienced (older)
            # For now, create a proxy: expensive + consistent = older
            age_map[fpl_id] = 'unknown'

        # Since age isn't directly available, create proxy features
        df['is_premium'] = (df['price'] >= 9.0).astype(int)  # Expensive = usually prime age or star
        df['is_budget'] = (df['price'] <= 5.0).astype(int)   # Cheap = young or fringe

        print(f"  Premium players: {df['is_premium'].sum():,} cases")
        print(f"  Budget players: {df['is_budget'].sum():,} cases")

    except Exception as e:
        print(f"  Warning: Could not fetch age data: {e}")
        df['is_premium'] = 0
        df['is_budget'] = 0

    return df


def add_upcoming_fixture_difficulty(df):
    """Next 3 fixtures average difficulty - rotation more likely before easy run"""
    print("[FEATURE] Upcoming fixture difficulty (next 3 fixtures)...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Get next 3 opponents' strength
    df['next_1_opp_strength'] = df.groupby('fpl_id')['opponent_strength'].shift(-1)
    df['next_2_opp_strength'] = df.groupby('fpl_id')['opponent_strength'].shift(-2)
    df['next_3_opp_strength'] = df.groupby('fpl_id')['opponent_strength'].shift(-3)

    # Average of next 3
    df['upcoming_3_fixture_difficulty'] = (
        df[['next_1_opp_strength', 'next_2_opp_strength', 'next_3_opp_strength']].mean(axis=1)
    )
    df['upcoming_3_fixture_difficulty'] = df['upcoming_3_fixture_difficulty'].fillna(3.0)

    # Easy run coming = rotation more likely in current game
    df['easy_run_ahead'] = (df['upcoming_3_fixture_difficulty'] < 2.5).astype(int)

    print(f"  Mean upcoming difficulty: {df['upcoming_3_fixture_difficulty'].mean():.2f}")
    print(f"  Easy run ahead: {df['easy_run_ahead'].sum():,} cases")

    return df


def add_positional_competition(df):
    """Enhanced depth chart - recent appearances by position in last 3 GWs"""
    print("[FEATURE] Positional competition (recent appearances)...")

    df = df.sort_values(['team', 'position', 'season', 'gameweek'])

    # Count unique players who played in this position for this team in last 3 GWs
    competition = []
    for idx, row in df.iterrows():
        recent_competition = df[
            (df['team'] == row['team']) &
            (df['position'] == row['position']) &
            (df['season'] == row['season']) &
            (df['gameweek'] >= row['gameweek'] - 3) &
            (df['gameweek'] < row['gameweek']) &
            (df['minutes'] > 0)
        ]['fpl_id'].nunique()
        competition.append(recent_competition)

    df['position_competition_3gw'] = competition
    df['high_competition'] = (df['position_competition_3gw'] >= 3).astype(int)

    print(f"  Mean competition: {df['position_competition_3gw'].mean():.2f} players")
    print(f"  High competition: {df['high_competition'].sum():,} cases")

    return df


def add_form_momentum(df):
    """Recent performance trends - goals/assists in last 3"""
    print("[FEATURE] Form momentum (recent goals/assists)...")

    df = df.sort_values(['fpl_id', 'season', 'gameweek'])

    # Last 3 games total goals + assists
    df['goal_contributions_last_3'] = (
        df.groupby('fpl_id')['goals'].rolling(window=3, min_periods=1).sum().reset_index(level=0, drop=True) +
        df.groupby('fpl_id')['assists'].rolling(window=3, min_periods=1).sum().reset_index(level=0, drop=True)
    )
    df['goal_contributions_last_3'] = df.groupby('fpl_id')['goal_contributions_last_3'].shift(1).fillna(0)

    # Hot form (2+ goal involvements in last 3)
    df['hot_form'] = (df['goal_contributions_last_3'] >= 2).astype(int)

    print(f"  Mean goal contributions (last 3): {df['goal_contributions_last_3'].mean():.2f}")
    print(f"  Hot form: {df['hot_form'].sum():,} cases")

    return df


def main():
    """Add advanced features to push toward 85-90% accuracy"""
    print("=" * 60)
    print("ADVANCED FEATURE ENGINEERING FOR 85-90% TARGET")
    print("=" * 60)

    # Load existing data
    data_path = DATA_DIR / "training_data_features.csv"
    config_path = DATA_DIR / "feature_config.json"

    print(f"\n[LOAD] Loading training data...")
    df = pd.read_csv(data_path)

    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"  Current: {len(df):,} samples, {len(config['start_features'])} features")

    # Add all advanced features
    df = add_days_since_last_start(df)
    df = add_minutes_trend(df)
    df = add_yellow_card_risk(df)
    df = add_age_features(df)
    df = add_upcoming_fixture_difficulty(df)
    df = add_positional_competition(df)
    df = add_form_momentum(df)

    # Update config
    new_features = [
        'days_since_last_start', 'rested_7plus_days', 'played_within_3_days',
        'minutes_trend_5gw', 'minutes_increasing', 'minutes_decreasing',
        'yellows_last_10', 'yellow_card_risk',
        'is_premium', 'is_budget',
        'upcoming_3_fixture_difficulty', 'easy_run_ahead',
        'position_competition_3gw', 'high_competition',
        'goal_contributions_last_3', 'hot_form'
    ]

    # Add to both start and minutes features
    config['start_features'] = list(set(config['start_features'] + new_features))
    config['minutes_features'] = list(set(config['minutes_features'] + new_features))

    print(f"\n[OK] Added {len(new_features)} advanced features")
    print(f"  Total features: {len(config['start_features'])}")

    # Save
    df.to_csv(data_path, index=False)
    print(f"[SAVE] Updated training data")

    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"[SAVE] Updated config")

    print(f"\n[SUCCESS] Ready to retrain with {len(config['start_features'])} features")
    print(f"  Target: 85-90% accuracy at ±15 min")


if __name__ == "__main__":
    main()
