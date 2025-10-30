"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { Id } from "@/convex/_generated/dataModel";

export default function MinutesLabPage() {
  const [selectedGameweek, setSelectedGameweek] = useState(9); // Current GW
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<"ALL" | "GK" | "DEF" | "MID" | "FWD">("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string>("ALL");

  // Get ALL players
  const allPlayers = useQuery(api.players.getAllPlayers);

  // Get xMins predictions for all players (we'll optimize this later)
  // For now, this is a placeholder - we'd need to batch generate for all players
  const [showOnlyWithPredictions, setShowOnlyWithPredictions] = useState(false);

  // Filtered and sorted players
  const filteredPlayers = useMemo(() => {
    if (!allPlayers) return [];

    let filtered = allPlayers;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter((p: any) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by position
    if (selectedPosition !== "ALL") {
      filtered = filtered.filter((p: any) => p.position === selectedPosition);
    }

    // Filter by team
    if (selectedTeam !== "ALL") {
      filtered = filtered.filter((p: any) => p.team === selectedTeam);
    }

    // Sort by name
    return filtered.sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [allPlayers, searchTerm, selectedPosition, selectedTeam]);

  // Get unique teams for filter
  const teams = useMemo(() => {
    if (!allPlayers) return [];
    const uniqueTeams = [...new Set(allPlayers.map((p: any) => p.team))];
    return uniqueTeams.sort();
  }, [allPlayers]);

  if (!allPlayers) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Minutes Lab</h1>
          <p className="text-muted-foreground">Loading players...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Minutes Lab</h1>
        <p className="text-muted-foreground">
          View and manage expected minutes predictions for all {allPlayers.length} players
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and filter players</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search Player</Label>
              <Input
                type="text"
                placeholder="e.g., Salah, Haaland"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Position Filter */}
            <div className="space-y-2">
              <Label>Position</Label>
              <select
                className="w-full p-2 border rounded-md"
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value as any)}
              >
                <option value="ALL">All Positions</option>
                <option value="GK">Goalkeepers</option>
                <option value="DEF">Defenders</option>
                <option value="MID">Midfielders</option>
                <option value="FWD">Forwards</option>
              </select>
            </div>

            {/* Team Filter */}
            <div className="space-y-2">
              <Label>Team</Label>
              <select
                className="w-full p-2 border rounded-md"
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="ALL">All Teams</option>
                {teams.map((team: any) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>

            {/* Gameweek Selector */}
            <div className="space-y-2">
              <Label>Gameweek</Label>
              <Input
                type="number"
                value={selectedGameweek}
                onChange={(e) => setSelectedGameweek(parseInt(e.target.value))}
                min={1}
                max={38}
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredPlayers.length} of {allPlayers.length} players
          </div>
        </CardContent>
      </Card>

      {/* Important Notice */}
      <Card className="mb-6 bg-yellow-50 border-yellow-200">
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-yellow-900">
              ⚠️ Important: Predictions Not Yet Generated for All Players
            </div>
            <div className="text-yellow-800">
              Currently, xMins predictions are only generated for players in your squad. To see
              predictions for all players, we need to:
            </div>
            <ul className="list-disc list-inside text-yellow-800 ml-4">
              <li>Generate 14-week horizon predictions (GW 9-22)</li>
              <li>Batch process all 700+ players (takes significant compute time)</li>
              <li>Set up automatic daily updates</li>
              <li>Deploy ML models for accurate long-term predictions</li>
            </ul>
            <div className="text-yellow-800 mt-2">
              <strong>Current Status:</strong> Heuristic predictions for next gameweek only, squad
              players only
            </div>
            <div className="text-yellow-800">
              <strong>Target:</strong> ML-powered 14-week predictions for all 700+ players, updated
              daily
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Player List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Player Database ({filteredPlayers.length} players)
          </CardTitle>
          <CardDescription>
            Click on a player to view detailed 14-week predictions (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-3 bg-gray-100 rounded-md font-semibold text-sm">
              <div className="col-span-3">Player</div>
              <div className="col-span-2">Team</div>
              <div className="col-span-1">Pos</div>
              <div className="col-span-1">£</div>
              <div className="col-span-1 text-center">xMins</div>
              <div className="col-span-1 text-center">P90</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-1"></div>
            </div>

            {/* Player Rows */}
            {filteredPlayers.slice(0, 50).map((player: any) => (
              <div
                key={player._id}
                className="grid grid-cols-12 gap-4 p-3 border rounded-md hover:bg-gray-50"
              >
                <div className="col-span-3 font-semibold">{player.name}</div>
                <div className="col-span-2 text-sm text-muted-foreground">{player.team}</div>
                <div className="col-span-1">
                  <Badge variant="outline">{player.position}</Badge>
                </div>
                <div className="col-span-1 text-sm">£{player.price.toFixed(1)}m</div>
                <div className="col-span-1 text-center text-muted-foreground">-</div>
                <div className="col-span-1 text-center text-muted-foreground">-</div>
                <div className="col-span-2 text-center">
                  <Badge variant="secondary">Not Generated</Badge>
                </div>
                <div className="col-span-1">
                  <Button variant="ghost" size="sm" disabled>
                    View
                  </Button>
                </div>
              </div>
            ))}

            {filteredPlayers.length > 50 && (
              <div className="text-center p-4 text-sm text-muted-foreground">
                Showing first 50 players. Use filters to narrow results.
              </div>
            )}

            {filteredPlayers.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                No players found matching your filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm">
            <div>
              <strong>Roadmap to Full System:</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong>Week 1-2:</strong> Set up automatic daily data sync (prices, injuries,
                fixtures)
              </li>
              <li>
                <strong>Week 2-3:</strong> Extend predictions to 14-week horizon (GW 9-22)
              </li>
              <li>
                <strong>Week 3-4:</strong> Batch generate predictions for all 700+ players
              </li>
              <li>
                <strong>Week 4-6:</strong> Add injury tracking and manager change detection
              </li>
              <li>
                <strong>Week 6-10:</strong> Train and deploy ML models (85-90% accuracy target)
              </li>
              <li>
                <strong>Ongoing:</strong> Add fixture difficulty, depth charts, confidence intervals
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
