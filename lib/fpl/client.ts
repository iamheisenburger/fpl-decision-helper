import type {
  FPLBootstrapStatic,
  FPLPlayerSummary,
  FPLLiveGameweek,
} from "./types";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

/**
 * FPL Official API Client
 * Fetches data from the FPL API with rate limiting and error handling
 */
export class FPLClient {
  private lastRequestTime = 0;
  private minRequestInterval = 1000; // 1 second between requests

  /**
   * Rate-limited fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    retries = 3,
    backoff = 1000
  ): Promise<Response> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);

        if (response.ok) {
          return response;
        }

        // If rate limited (429) or server error (5xx), retry with backoff
        if (response.status === 429 || response.status >= 500) {
          console.warn(
            `Request failed with status ${response.status}, retrying in ${backoff}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff *= 2; // Exponential backoff
          continue;
        }

        // For other errors, throw immediately
        throw new Error(
          `FPL API request failed: ${response.status} ${response.statusText}`
        );
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        console.warn(`Request failed, retrying in ${backoff}ms...`, error);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2;
      }
    }

    throw new Error("Max retries exceeded");
  }

  /**
   * Fetch bootstrap-static data (players, teams, gameweeks)
   */
  async getBootstrapStatic(): Promise<FPLBootstrapStatic> {
    const url = `${FPL_BASE_URL}/bootstrap-static/`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  /**
   * Fetch player summary (historical performance)
   */
  async getPlayerSummary(playerId: number): Promise<FPLPlayerSummary> {
    const url = `${FPL_BASE_URL}/element-summary/${playerId}/`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  /**
   * Fetch live gameweek data
   */
  async getLiveGameweek(gameweek: number): Promise<FPLLiveGameweek> {
    const url = `${FPL_BASE_URL}/event/${gameweek}/live/`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  /**
   * Fetch fixtures
   */
  async getFixtures(): Promise<any[]> {
    const url = `${FPL_BASE_URL}/fixtures/`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }

  /**
   * Get current season string (e.g., "2024-25")
   */
  getCurrentSeason(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 0-indexed

    // FPL season starts in August
    if (month >= 8) {
      return `${year}-${(year + 1).toString().slice(2)}`;
    } else {
      return `${year - 1}-${year.toString().slice(2)}`;
    }
  }

  /**
   * Get season string for a specific year
   */
  getSeasonString(startYear: number): string {
    return `${startYear}-${(startYear + 1).toString().slice(2)}`;
  }
}

// Singleton instance
export const fplClient = new FPLClient();
