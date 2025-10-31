"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function MinutesLabPage() {
  const [selectedGameweek, setSelectedGameweek] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<"ALL" | "GK" | "DEF" | "MID" | "FWD">("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string>("ALL");
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  const getCurrentGW = useAction(api.utils.gameweekDetection.getCurrentGameweek);
  const getPlayerOutlook = useAction(api.engines.multiWeekPredictor.getPlayerOutlook);

  // Fetch current gameweek on load and default to NEXT gameweek
  useEffect(() => {
    const fetchGameweek = async () => {
      try {
        const gw = await getCurrentGW({});
        setSelectedGameweek(gw + 1); // Show NEXT gameweek (predictions start from current+1)
      } catch (error) {
        console.error("Failed to fetch current gameweek:", error);
        setSelectedGameweek(10); // Fallback to 10
      }
    };
    fetchGameweek();
  }, [getCurrentGW]);

  // Get ALL players
  const allPlayers = useQuery(api.players.getAllPlayers);

  // Get xMins predictions for the selected gameweek
  const predictions = useQuery(
    api.xmins.getGameweekXMins,
    selectedGameweek !== null ? { gameweek: selectedGameweek } : "skip"
  );

  // Create prediction lookup map
  const predictionMap = useMemo(() => {
    if (!predictions) return new Map();
    const map = new Map();
    predictions.forEach((pred: any) => {
      map.set(pred.playerId, pred);
    });
    return map;
  }, [predictions]);

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

    // Sort by xMins descending (players with predictions first)
    return filtered.sort((a: any, b: any) => {
      const predA = predictionMap.get(a._id);
      const predB = predictionMap.get(b._id);

      if (!predA && !predB) return a.name.localeCompare(b.name);
      if (!predA) return 1;
      if (!predB) return -1;

      return (predB.xMinsStart || 0) - (predA.xMinsStart || 0);
    });
  }, [allPlayers, searchTerm, selectedPosition, selectedTeam, predictionMap]);

  // Get unique teams for filter
  const teams = useMemo(() => {
    if (!allPlayers) return [];
    const uniqueTeams = [...new Set(allPlayers.map((p: any) => p.team))];
    return uniqueTeams.sort();
  }, [allPlayers]);

  // Count predictions
  const predictionCount = predictions?.length || 0;

  // Handle view 14-week outlook
  const handleViewOutlook = async (player: any) => {
    setSelectedPlayer(player);
    setShowModal(true);
  };

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
        <div className="mt-2 flex gap-4">
          <Badge variant="default" className="bg-blue-600">
            {predictionCount} predictions for GW{selectedGameweek}
          </Badge>
          {predictionCount < allPlayers.length && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-700">
              {allPlayers.length - predictionCount} missing predictions
            </Badge>
          )}
        </div>
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
                value={selectedGameweek ?? ""}
                onChange={(e) => setSelectedGameweek(parseInt(e.target.value))}
                min={1}
                max={38}
                placeholder="Loading..."
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredPlayers.length} of {allPlayers.length} players
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
            Click "View" to see detailed 14-week predictions for any player
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
            {filteredPlayers.slice(0, 100).map((player: any) => {
              const pred = predictionMap.get(player._id);

              return (
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

                  {/* xMins */}
                  <div className="col-span-1 text-center">
                    {pred ? (
                      <span className="font-semibold text-blue-600">
                        {Math.round(pred.xMinsStart)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* P90 */}
                  <div className="col-span-1 text-center">
                    {pred ? (
                      <span className="text-sm">
                        {(pred.p90 * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-2 text-center">
                    {player.status === "i" || (player.chanceOfPlayingNextRound !== undefined && player.chanceOfPlayingNextRound < 50) ? (
                      <Badge variant="destructive" className="cursor-help" title={player.news || "Injured"}>
                        Injured {player.chanceOfPlayingNextRound !== undefined ? `(${player.chanceOfPlayingNextRound}%)` : ""}
                      </Badge>
                    ) : player.status === "d" || player.chanceOfPlayingNextRound === 50 || player.chanceOfPlayingNextRound === 75 ? (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-700 cursor-help" title={player.news || "Doubtful"}>
                        Doubtful ({player.chanceOfPlayingNextRound}%)
                      </Badge>
                    ) : player.status === "s" ? (
                      <Badge variant="destructive" className="cursor-help" title={player.news || "Suspended"}>
                        Suspended
                      </Badge>
                    ) : player.status === "u" ? (
                      <Badge variant="secondary" className="cursor-help" title={player.news || "Unavailable"}>
                        Unavailable
                      </Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600 cursor-help" title="Available to play">
                        Available
                      </Badge>
                    )}
                  </div>

                  {/* View Button */}
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewOutlook(player)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredPlayers.length > 100 && (
              <div className="text-center p-4 text-sm text-muted-foreground">
                Showing first 100 players. Use filters to narrow results.
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

      {/* 14-Week Outlook Modal */}
      <PlayerOutlookModal
        player={selectedPlayer}
        currentGameweek={selectedGameweek}
        open={showModal}
        onClose={() => setShowModal(false)}
        getPlayerOutlook={getPlayerOutlook}
      />
    </div>
  );
}

// Modal component for 14-week outlook
function PlayerOutlookModal({
  player,
  currentGameweek,
  open,
  onClose,
  getPlayerOutlook,
}: {
  player: any;
  currentGameweek: number | null;
  open: boolean;
  onClose: () => void;
  getPlayerOutlook: any;
}) {
  const [outlook, setOutlook] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && player && currentGameweek) {
      setLoading(true);
      getPlayerOutlook({
        playerId: player._id,
        currentGameweek: currentGameweek,
      })
        .then((data: any) => {
          setOutlook(data);
          setLoading(false);
        })
        .catch((error: any) => {
          console.error("Failed to fetch outlook:", error);
          setLoading(false);
        });
    }
  }, [open, player, currentGameweek, getPlayerOutlook]);

  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{player.name} - 14-Week Outlook</DialogTitle>
          <DialogDescription>
            {player.team} • {player.position} • £{player.price.toFixed(1)}m
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading predictions...</p>
          </div>
        )}

        {!loading && outlook && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {Math.round(outlook.summary.avgXMins)} mins
                  </div>
                  <div className="text-sm text-muted-foreground">Average xMins</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {(outlook.summary.avgConfidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Confidence</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {outlook.summary.weeksUnavailable}
                  </div>
                  <div className="text-sm text-muted-foreground">Weeks Unavailable</div>
                </CardContent>
              </Card>
            </div>

            {/* Injury Status */}
            {player.news && (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="pt-6">
                  <div className="font-semibold mb-2">Injury Status</div>
                  <p className="text-sm">{player.news}</p>
                </CardContent>
              </Card>
            )}

            {/* 14-Week Predictions Table */}
            <div className="space-y-2">
              <h3 className="font-semibold">Weekly Predictions</h3>
              <div className="border rounded-md">
                <div className="grid grid-cols-5 gap-4 p-3 bg-gray-100 font-semibold text-sm">
                  <div>Gameweek</div>
                  <div className="text-center">xMins</div>
                  <div className="text-center">P90</div>
                  <div className="text-center">Confidence</div>
                  <div className="text-center">Status</div>
                </div>
                {outlook.predictions.map((pred: any, idx: number) => (
                  <div
                    key={pred.gameweek}
                    className={`grid grid-cols-5 gap-4 p-3 border-t ${
                      pred.xMinsStart === 0 ? "bg-red-50" : pred.recoveryPhase ? "bg-yellow-50" : ""
                    }`}
                  >
                    <div className="font-semibold">GW{pred.gameweek}</div>
                    <div className="text-center">
                      <span className="font-semibold">{Math.round(pred.xMinsStart)}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round(pred.uncertaintyLo)}-{Math.round(pred.uncertaintyHi)})
                      </span>
                    </div>
                    <div className="text-center">{(pred.p90 * 100).toFixed(0)}%</div>
                    <div className="text-center">
                      <Badge
                        variant={
                          pred.confidence > 0.85
                            ? "default"
                            : pred.confidence > 0.70
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {(pred.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="text-center">
                      {pred.xMinsStart === 0 && pred.injuryAdjusted ? (
                        <Badge variant="destructive">Injured</Badge>
                      ) : pred.recoveryPhase ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                          Recovering
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">Available</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Confidence:</strong> Prediction reliability (95% for GW+1 → 60% for GW+14)</p>
              <p><strong>Uncertainty Range:</strong> Expected variation in minutes</p>
              <p><strong>Recovery Phase:</strong> Gradual return after injury (60% → 100% over 4 games)</p>
            </div>
          </div>
        )}

        {!loading && !outlook && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No predictions available for this player.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Run "Generate 14-Week Predictions" from the Admin page.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
