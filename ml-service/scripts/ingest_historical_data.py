"""
Data Ingestion Script for FPL ML Training
Downloads and processes 2 seasons of historical data (2024-25, 2025-26)
Current season: 2025-26 (GW9 as of now)

Why only 2 seasons?
- Recent data > historical noise
- Managers, teams, tactics change year-over-year
- Meta changes (VAR, rules, fixture congestion)
- Quality over quantity for ML training
"""

import requests
import pandas as pd
import json
from pathlib import Path
from typing import Dict, List
import time

# GitHub repo with historical FPL data
GITHUB_BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"

# Seasons to fetch (ONLY recent seasons - see NORTH_STAR.md)
SEASONS = ["2024-25", "2025-26"]

# Output directory
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def fetch_fpl_current_season() -> pd.DataFrame:
    """
    Fetch current season (2025-26) data from live FPL API.

    Returns:
        DataFrame with columns: player_id, player_name, gameweek, season, started,
                               minutes, opponent, home_away, position, team, etc.
    """
    print("Fetching current season (2025-26) from FPL API...", flush=True)

    # Get bootstrap data for player/team mapping
    bootstrap = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/").json()

    # Create lookup maps
    team_map = {t['id']: t['name'] for t in bootstrap['teams']}
    position_map = {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'}

    all_data = []
    total_players = len(bootstrap['elements'])

    for idx, player in enumerate(bootstrap['elements'], 1):
        player_id = player['id']
        player_name = player['web_name']
        position = position_map.get(player['element_type'], 'UNK')
        team = team_map.get(player['team'], 'Unknown')
        price = player['now_cost'] / 10

        # Encode player name to avoid Windows console encoding issues
        safe_name = player_name.encode('ascii', 'replace').decode('ascii')
        print(f"  [{idx}/{total_players}] Fetching {safe_name}...", flush=True)

        try:
            # Fetch player history
            response = requests.get(
                f"https://fantasy.premierleague.com/api/element-summary/{player_id}/"
            )

            if response.status_code != 200:
                print(f"    [WARNING]  Failed (HTTP {response.status_code})")
                continue

            data = response.json()

            # Process match history
            for match in data['history']:
                all_data.append({
                    'fpl_id': player_id,
                    'player_name': player_name,
                    'position': position,
                    'team': team,
                    'price': price,
                    'gameweek': match['round'],
                    'season': '2025-26',
                    'started': match['starts'] == 1,
                    'minutes': match['minutes'],
                    'opponent': team_map.get(match['opponent_team'], 'Unknown'),
                    'home_away': 'home' if match['was_home'] else 'away',
                    'kickoff_time': match['kickoff_time'],
                    'red_card': match.get('red_cards', 0) > 0,
                    'yellow_card': match.get('yellow_cards', 0) > 0,
                    'goals': match.get('goals_scored', 0),
                    'assists': match.get('assists', 0),
                    'points': match.get('total_points', 0),
                })

            # Rate limiting
            time.sleep(0.3)

        except Exception as e:
            print(f"    [WARNING]  Error: {e}")
            continue

    df = pd.DataFrame(all_data)
    print(f"[OK] Fetched {len(df)} appearances for 2025-26 season")
    return df


def fetch_historical_season(season: str) -> pd.DataFrame:
    """
    Fetch historical season data from vaastav/Fantasy-Premier-League GitHub repo.

    Args:
        season: Season string like "2022-23"

    Returns:
        DataFrame with standardized columns
    """
    print(f"\nFetching {season} from GitHub archive...", flush=True)

    # Fetch players data
    players_url = f"{GITHUB_BASE}/{season}/players_raw.csv"

    try:
        players_df = pd.read_csv(players_url)
        print(f"  [OK] Downloaded players_raw.csv ({len(players_df)} players)", flush=True)
    except Exception as e:
        print(f"  [WARNING]  Failed to download: {e}", flush=True)
        return pd.DataFrame()

    # Process gameweek data for each player
    all_data = []

    # Get unique player IDs from the players file
    # Try to find player directories (each player has a folder with gw.csv)
    print(f"  Processing individual player gameweek data...", flush=True)

    # Alternative: Download merged_gw.csv which has all gameweeks for all players
    merged_url = f"{GITHUB_BASE}/{season}/gws/merged_gw.csv"

    try:
        # Skip bad lines in CSV (some rows have corrupted data)
        gw_df = pd.read_csv(merged_url, on_bad_lines='skip', engine='python')
        print(f"  [OK] Downloaded merged_gw.csv ({len(gw_df)} appearances)", flush=True)

        # Standardize column names
        gw_df['season'] = season
        gw_df['started'] = gw_df['minutes'] > 0  # Approximation
        gw_df['home_away'] = gw_df['was_home'].apply(lambda x: 'home' if x else 'away')
        gw_df['red_card'] = gw_df.get('red_cards', 0) > 0
        gw_df['yellow_card'] = gw_df.get('yellow_cards', 0) > 0

        # Rename columns to match our schema
        column_mapping = {
            'element': 'fpl_id',
            'name': 'player_name',
            'round': 'gameweek',
            'opponent_team': 'opponent',
            'total_points': 'points',
            'goals_scored': 'goals',
        }

        gw_df = gw_df.rename(columns=column_mapping)

        return gw_df

    except Exception as e:
        print(f"  [WARNING]  Failed to download merged_gw.csv: {e}", flush=True)
        return pd.DataFrame()


def add_position_and_team(df: pd.DataFrame, season: str) -> pd.DataFrame:
    """
    Enrich dataframe with position and team data from players_raw.csv
    """
    print(f"  Enriching {season} data with position/team...")

    players_url = f"{GITHUB_BASE}/{season}/players_raw.csv"

    try:
        players_df = pd.read_csv(players_url)

        # Create position map
        position_map = {1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD'}
        players_df['position'] = players_df['element_type'].map(position_map)

        # Get team names
        teams_url = f"{GITHUB_BASE}/{season}/teams.csv"
        teams_df = pd.read_csv(teams_url)
        team_map = dict(zip(teams_df['id'], teams_df['name']))
        players_df['team'] = players_df['team'].map(team_map)

        # Merge with gameweek data
        merge_cols = ['id', 'position', 'team', 'now_cost']
        player_info = players_df[merge_cols].rename(columns={
            'id': 'fpl_id',
            'now_cost': 'price'
        })

        # Convert price
        player_info['price'] = player_info['price'] / 10

        df = df.merge(player_info, on='fpl_id', how='left')

        print(f"  [OK] Enriched with position/team data")
        return df

    except Exception as e:
        print(f"  [WARNING]  Failed to enrich: {e}")
        return df


def create_training_dataset() -> pd.DataFrame:
    """
    Fetch 2 recent seasons and combine into single training dataset.

    Returns:
        Combined DataFrame ready for feature engineering
    """
    all_seasons = []

    # Fetch 2024-25 (full season) from GitHub
    df_2024 = fetch_historical_season("2024-25")
    if not df_2024.empty:
        df_2024 = add_position_and_team(df_2024, "2024-25")
        all_seasons.append(df_2024)
        print(f"  [OK] 2024-25: {len(df_2024)} appearances")

    # Fetch current season (2025-26) from live API
    current_df = fetch_fpl_current_season()
    if not current_df.empty:
        all_seasons.append(current_df)
        print(f"  [OK] 2025-26: {len(current_df)} appearances")

    # Combine all seasons
    if not all_seasons:
        raise ValueError("Failed to fetch any season data!")

    combined_df = pd.concat(all_seasons, ignore_index=True)

    # Sort by player and date
    combined_df = combined_df.sort_values(['fpl_id', 'season', 'gameweek'])

    print(f"\n[OK] Combined dataset: {len(combined_df)} total appearances")
    print(f"   Players: {combined_df['fpl_id'].nunique()}")
    print(f"   Seasons: {combined_df['season'].unique()}")

    return combined_df


def save_training_data(df: pd.DataFrame):
    """
    Save processed data to CSV for ML training.
    """
    output_path = DATA_DIR / "training_data_raw.csv"
    df.to_csv(output_path, index=False)
    print(f"\n[SAVED] Saved to: {output_path}")

    # Also save summary stats
    summary = {
        'total_appearances': len(df),
        'unique_players': df['fpl_id'].nunique(),
        'seasons': df['season'].unique().tolist(),
        'gameweeks_per_season': df.groupby('season')['gameweek'].max().to_dict(),
        'positions': df['position'].value_counts().to_dict(),
        'date_generated': pd.Timestamp.now().isoformat(),
    }

    summary_path = DATA_DIR / "dataset_summary.json"
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"[STATS] Dataset Summary:")
    print(f"   Total appearances: {summary['total_appearances']:,}")
    print(f"   Unique players: {summary['unique_players']:,}")
    print(f"   Seasons: {', '.join(summary['seasons'])}")
    print(f"   Positions: {summary['positions']}")


def main():
    """
    Main execution: Fetch 3 seasons of data and save for training.
    """
    print("=" * 60, flush=True)
    print("FPL ML Training Data Ingestion", flush=True)
    print("=" * 60, flush=True)
    print(f"Fetching data for seasons: {', '.join(SEASONS)}", flush=True)
    print(flush=True)

    try:
        # Create combined dataset
        df = create_training_dataset()

        # Save to disk
        save_training_data(df)

        print("\n[OK] Data ingestion complete!")
        print(f"   Next step: Run feature_engineering.py to prepare training features")

    except Exception as e:
        print(f"\n[ERROR] Error: {e}")
        raise


if __name__ == "__main__":
    main()
