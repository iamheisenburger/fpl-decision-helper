// FPL Official API Types

export interface FPLBootstrapStatic {
  events: FPLGameweek[];
  teams: FPLTeam[];
  elements: FPLPlayer[];
  element_types: FPLPosition[];
}

export interface FPLGameweek {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  data_checked: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface FPLTeam {
  id: number;
  name: string;
  short_name: string;
  code: number;
}

export interface FPLPosition {
  id: number;
  singular_name: string;
  singular_name_short: string;
  plural_name: string;
  plural_name_short: string;
}

export interface FPLPlayer {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  now_cost: number; // in 0.1m (e.g., 125 = £12.5m)
  status: string; // "a" = available, "d" = doubtful, "i" = injured, etc.
  news: string;
  news_added: string | null;
}

export interface FPLPlayerSummary {
  history: FPLMatchHistory[];
  history_past: FPLSeasonHistory[];
  fixtures: FPLFixture[];
}

export interface FPLMatchHistory {
  element: number; // player ID
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  team_h_score: number | null;
  team_a_score: number | null;
  round: number; // gameweek
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  value: number;
  transfers_balance: number;
  selected: number;
  transfers_in: number;
  transfers_out: number;
}

export interface FPLSeasonHistory {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  starts: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
}

export interface FPLFixture {
  id: number;
  code: number;
  event: number | null; // gameweek
  finished: boolean;
  kickoff_time: string;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  difficulty: number;
  is_home: boolean;
}

export interface FPLLiveGameweek {
  elements: FPLLivePlayer[];
}

export interface FPLLivePlayer {
  id: number;
  stats: {
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    starts: number;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
  };
  explain: Array<{
    fixture: number;
    stats: Array<{
      identifier: string;
      points: number;
      value: number;
    }>;
  }>;
}

// Processed types for our database
export interface ProcessedAppearance {
  fplPlayerId: number;
  gameweek: number;
  season: string;
  started: boolean;
  minutes: number;
  injExit: boolean;
  redCard: boolean;
  date: number;
  competition: string;
  opponent: string;
  homeAway: "home" | "away";
  fplGameweekId?: number;
}

export interface InjuryExitHeuristic {
  playerId: number;
  gameweek: number;
  likelihoodScore: number; // 0-1, higher = more likely injury
  reasons: string[];
}
