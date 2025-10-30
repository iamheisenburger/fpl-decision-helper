import { fplClient } from "./client";
import type {
  FPLMatchHistory,
  ProcessedAppearance,
  InjuryExitHeuristic,
} from "./types";

/**
 * Process FPL match history into our appearance format
 */
export function processMatchHistory(
  fplPlayerId: number,
  match: FPLMatchHistory,
  season: string,
  teamName: string
): ProcessedAppearance {
  // Detect injury exit heuristically:
  // - Subbed off before 60 minutes
  // - Minutes < 60 and didn't start (unlikely to be tactical)
  const earlySubOff = match.minutes > 0 && match.minutes < 60;
  const didStart = match.starts === 1;

  // Simple heuristic: if started and subbed off early, might be injury
  // We'll mark as potential injury, user can override in UI
  const injExit = didStart && earlySubOff;

  return {
    fplPlayerId,
    gameweek: match.round,
    season,
    started: match.starts === 1,
    minutes: match.minutes,
    injExit,
    redCard: match.red_cards > 0,
    date: new Date(match.kickoff_time).getTime(),
    competition: "Premier League",
    opponent: teamName,
    homeAway: match.was_home ? "home" : "away",
    fplGameweekId: match.fixture,
  };
}

/**
 * Enhanced injury exit detection
 * Uses multiple signals to score likelihood of injury exit
 */
export function detectInjuryExit(
  match: FPLMatchHistory,
  playerNews?: string
): InjuryExitHeuristic {
  const reasons: string[] = [];
  let score = 0.0;

  // Signal 1: Early substitution (< 60 minutes)
  if (match.starts === 1 && match.minutes > 0 && match.minutes < 60) {
    score += 0.4;
    reasons.push(`Subbed off at ${match.minutes}'`);
  }

  // Signal 2: Very early substitution (< 30 minutes)
  if (match.starts === 1 && match.minutes > 0 && match.minutes < 30) {
    score += 0.3;
    reasons.push("Very early sub");
  }

  // Signal 3: Player news mentions injury keywords
  if (playerNews) {
    const injuryKeywords = [
      "injury",
      "injured",
      "knock",
      "strain",
      "tight",
      "issue",
      "problem",
      "doubt",
      "fitness",
      "concern",
    ];

    const newsLower = playerNews.toLowerCase();
    const hasInjuryMention = injuryKeywords.some((keyword) =>
      newsLower.includes(keyword)
    );

    if (hasInjuryMention) {
      score += 0.5;
      reasons.push("News mentions injury");
    }
  }

  // Signal 4: Zero minutes after starting (sent off without card recorded?)
  if (match.starts === 1 && match.minutes === 0) {
    score += 0.2;
    reasons.push("Started but 0 minutes");
  }

  return {
    playerId: match.element,
    gameweek: match.round,
    likelihoodScore: Math.min(score, 1.0),
    reasons,
  };
}

/**
 * Fetch and process historical data for a single player
 */
export async function fetchPlayerHistory(
  fplPlayerId: number,
  currentSeason: string
): Promise<{
  appearances: ProcessedAppearance[];
  injuryHeuristics: InjuryExitHeuristic[];
}> {
  try {
    const summary = await fplClient.getPlayerSummary(fplPlayerId);
    const bootstrap = await fplClient.getBootstrapStatic();

    // Map team IDs to names
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

    const appearances: ProcessedAppearance[] = [];
    const injuryHeuristics: InjuryExitHeuristic[] = [];

    // Process current season history
    for (const match of summary.history) {
      const opponent = teamMap.get(match.opponent_team) || "Unknown";
      const appearance = processMatchHistory(
        fplPlayerId,
        match,
        currentSeason,
        opponent
      );

      // Get player info for news
      const player = bootstrap.elements.find((p) => p.id === fplPlayerId);
      const injuryHeuristic = detectInjuryExit(match, player?.news);

      appearances.push(appearance);
      if (injuryHeuristic.likelihoodScore > 0.3) {
        injuryHeuristics.push(injuryHeuristic);
      }
    }

    // Process past seasons
    // Note: FPL API doesn't provide detailed match-by-match for past seasons
    // We can only get aggregated stats, so we'll skip past seasons for now
    // In production, you might want to use a different data source for historical data

    return {
      appearances,
      injuryHeuristics,
    };
  } catch (error) {
    console.error(`Failed to fetch history for player ${fplPlayerId}:`, error);
    return {
      appearances: [],
      injuryHeuristics: [],
    };
  }
}

/**
 * Fetch historical data for all players
 */
export async function fetchAllPlayersHistory(
  currentSeason: string,
  onProgress?: (current: number, total: number, playerName: string) => void
): Promise<{
  appearances: ProcessedAppearance[];
  injuryHeuristics: InjuryExitHeuristic[];
  errors: Array<{ playerId: number; error: string }>;
}> {
  const bootstrap = await fplClient.getBootstrapStatic();
  const players = bootstrap.elements;

  const allAppearances: ProcessedAppearance[] = [];
  const allInjuryHeuristics: InjuryExitHeuristic[] = [];
  const errors: Array<{ playerId: number; error: string }> = [];

  for (let i = 0; i < players.length; i++) {
    const player = players[i];

    if (onProgress) {
      onProgress(i + 1, players.length, player.web_name);
    }

    try {
      const { appearances, injuryHeuristics } = await fetchPlayerHistory(
        player.id,
        currentSeason
      );

      allAppearances.push(...appearances);
      allInjuryHeuristics.push(...injuryHeuristics);
    } catch (error) {
      errors.push({
        playerId: player.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Rate limiting: wait between players
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    appearances: allAppearances,
    injuryHeuristics: allInjuryHeuristics,
    errors,
  };
}

/**
 * Sync FPL players to Convex database
 * Returns mapping of FPL ID -> Convex ID
 */
export async function syncPlayersToConvex(
  convexMutation: any
): Promise<Map<number, string>> {
  const bootstrap = await fplClient.getBootstrapStatic();
  const playerMap = new Map<number, string>();

  for (const fplPlayer of bootstrap.elements) {
    // Map element_type to position
    const positionMap: { [key: number]: string } = {
      1: "GK",
      2: "DEF",
      3: "MID",
      4: "FWD",
    };

    const position = positionMap[fplPlayer.element_type];
    const team = bootstrap.teams.find((t) => t.id === fplPlayer.team);

    if (!position || !team) continue;

    try {
      // Create or update player in Convex
      const convexPlayerId = await convexMutation({
        name: fplPlayer.web_name,
        position,
        price: fplPlayer.now_cost / 10, // Convert from 0.1m to 1m
        team: team.name,
      });

      playerMap.set(fplPlayer.id, convexPlayerId);
    } catch (error) {
      console.error(
        `Failed to sync player ${fplPlayer.web_name}:`,
        error
      );
    }
  }

  return playerMap;
}

/**
 * Calculate congestion flags for gameweeks
 * Based on fixture density (if >1 match in 5 days)
 */
export async function detectCongestionFlags(): Promise<
  Map<number, { congestion: boolean; avgDaysRest: number }>
> {
  const fixtures = await fplClient.getFixtures();
  const gameweekMap = new Map<
    number,
    { congestion: boolean; avgDaysRest: number }
  >();

  // Group fixtures by gameweek
  const fixturesByGW = new Map<number, typeof fixtures>();
  for (const fixture of fixtures) {
    if (!fixture.event) continue;

    if (!fixturesByGW.has(fixture.event)) {
      fixturesByGW.set(fixture.event, []);
    }
    fixturesByGW.get(fixture.event)!.push(fixture);
  }

  // Analyze each gameweek
  for (const [gw, gwFixtures] of fixturesByGW) {
    const kickoffTimes = gwFixtures
      .filter((f) => f.kickoff_time)
      .map((f) => new Date(f.kickoff_time).getTime())
      .sort();

    if (kickoffTimes.length < 2) {
      gameweekMap.set(gw, { congestion: false, avgDaysRest: 7 });
      continue;
    }

    // Calculate time between first and last fixture
    const span = kickoffTimes[kickoffTimes.length - 1] - kickoffTimes[0];
    const spanDays = span / (1000 * 60 * 60 * 24);

    // Congestion if fixtures span < 5 days
    const congestion = spanDays < 5;

    gameweekMap.set(gw, {
      congestion,
      avgDaysRest: spanDays / gwFixtures.length,
    });
  }

  return gameweekMap;
}

/**
 * Detect international break gameweeks
 * Heuristic: if gameweek has > 14 days since previous GW
 */
export async function detectInternationalBreaks(): Promise<Set<number>> {
  const bootstrap = await fplClient.getBootstrapStatic();
  const intlBreaks = new Set<number>();

  const gameweeks = bootstrap.events
    .filter((gw) => gw.deadline_time)
    .sort((a, b) => a.id - b.id);

  for (let i = 1; i < gameweeks.length; i++) {
    const prev = new Date(gameweeks[i - 1].deadline_time).getTime();
    const curr = new Date(gameweeks[i].deadline_time).getTime();
    const daysBetween = (curr - prev) / (1000 * 60 * 60 * 24);

    // If > 14 days between gameweeks, likely international break
    if (daysBetween > 14) {
      intlBreaks.add(gameweeks[i].id);
    }
  }

  return intlBreaks;
}
