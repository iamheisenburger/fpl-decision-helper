"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

export default function DataEntryPage() {
  const [currentGameweek, setCurrentGameweek] = useState(10);

  // Queries
  const allPlayers = useQuery(api.players.getAllPlayers);
  const squad = useQuery(api.userSquad.getSquad, { gameweek: currentGameweek });
  const gameweekInputs = useQuery(api.gameweekInputs.getGameweekInputs, {
    gameweek: currentGameweek,
  });

  // Mutations
  const addPlayer = useMutation(api.players.addPlayer);
  const deletePlayer = useMutation(api.players.deletePlayer);
  const addToSquad = useMutation(api.userSquad.addToSquad);
  const removeFromSquad = useMutation(api.userSquad.removeFromSquad);
  const upsertGameweekInput = useMutation(api.gameweekInputs.upsertGameweekInput);

  // Player Database form state
  const [newPlayer, setNewPlayer] = useState({
    name: "",
    position: "MID" as "GK" | "DEF" | "MID" | "FWD",
    price: 0,
    team: "",
  });

  // Weekly stats form state
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [weeklyStats, setWeeklyStats] = useState({
    ev: 0,
    ev95: 0,
    xMins: 0,
    eo: 0,
  });

  const handleAddPlayer = async () => {
    if (!newPlayer.name || !newPlayer.team) {
      alert("Please fill in player name and team");
      return;
    }

    try {
      await addPlayer(newPlayer);
      setNewPlayer({ name: "", position: "MID", price: 0, team: "" });
      alert("Player added successfully!");
    } catch (error) {
      alert("Failed to add player");
      console.error(error);
    }
  };

  const handleDeletePlayer = async (id: Id<"players">) => {
    if (confirm("Are you sure you want to delete this player?")) {
      try {
        await deletePlayer({ id });
      } catch (error) {
        alert("Failed to delete player");
        console.error(error);
      }
    }
  };

  const handleAddToSquad = async (playerId: Id<"players">) => {
    if (squad && squad.length >= 15) {
      alert("Squad is full (15 players). Remove someone first.");
      return;
    }

    try {
      await addToSquad({
        playerId,
        gameweek: currentGameweek,
        isCaptain: false,
        isVice: false,
        benchOrder: 0,
      });
    } catch (error) {
      alert("Failed to add to squad. Player might already be in squad.");
      console.error(error);
    }
  };

  const handleRemoveFromSquad = async (id: Id<"userSquad">) => {
    try {
      await removeFromSquad({ id });
    } catch (error) {
      alert("Failed to remove from squad");
      console.error(error);
    }
  };

  const handleSaveWeeklyStats = async () => {
    if (!selectedPlayerId) {
      alert("Please select a player");
      return;
    }

    try {
      await upsertGameweekInput({
        playerId: selectedPlayerId,
        gameweek: currentGameweek,
        ...weeklyStats,
      });
      alert("Weekly stats saved!");
      setWeeklyStats({ ev: 0, ev95: 0, xMins: 0, eo: 0 });
      setSelectedPlayerId(null);
    } catch (error) {
      alert("Failed to save weekly stats");
      console.error(error);
    }
  };

  // Get squad player IDs for filtering
  const squadPlayerIds = squad?.map((s) => s.playerId) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Data Entry</h1>
        <p className="text-muted-foreground">
          Manage your player database, squad, and weekly stats all in one place.
        </p>
      </div>

      {/* Gameweek Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="gameweek">Current Gameweek:</Label>
            <Select
              value={currentGameweek.toString()}
              onValueChange={(value) => setCurrentGameweek(parseInt(value))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 38 }, (_, i) => i + 1).map((gw) => (
                  <SelectItem key={gw} value={gw.toString()}>
                    GW {gw}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="players" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="players">Player Database</TabsTrigger>
          <TabsTrigger value="squad">Squad Selection ({squad?.length || 0}/15)</TabsTrigger>
          <TabsTrigger value="stats">Weekly Stats</TabsTrigger>
        </TabsList>

        {/* Tab 1: Player Database */}
        <TabsContent value="players" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add New Player</CardTitle>
              <CardDescription>Add players to your database</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="player-name">Name</Label>
                  <Input
                    id="player-name"
                    placeholder="Player name"
                    value={newPlayer.name}
                    onChange={(e) =>
                      setNewPlayer({ ...newPlayer, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="player-position">Position</Label>
                  <Select
                    value={newPlayer.position}
                    onValueChange={(value: any) =>
                      setNewPlayer({ ...newPlayer, position: value })
                    }
                  >
                    <SelectTrigger id="player-position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GK">GK</SelectItem>
                      <SelectItem value="DEF">DEF</SelectItem>
                      <SelectItem value="MID">MID</SelectItem>
                      <SelectItem value="FWD">FWD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="player-price">Price (£m)</Label>
                  <Input
                    id="player-price"
                    type="number"
                    step="0.1"
                    placeholder="Price"
                    value={newPlayer.price || ""}
                    onChange={(e) =>
                      setNewPlayer({
                        ...newPlayer,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="player-team">Team</Label>
                  <Input
                    id="player-team"
                    placeholder="Team"
                    value={newPlayer.team}
                    onChange={(e) =>
                      setNewPlayer({ ...newPlayer, team: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddPlayer} className="w-full">
                    Add Player
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Players ({allPlayers?.length || 0})</CardTitle>
              <CardDescription>Your player database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allPlayers?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No players yet. Add some above!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allPlayers?.map((player) => (
                      <div
                        key={player._id}
                        className="flex items-center justify-between p-3 border rounded-md"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-sm w-12">
                            {player.position}
                          </span>
                          <span className="font-medium">{player.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {player.team}
                          </span>
                          <span className="text-sm">£{player.price.toFixed(1)}m</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddToSquad(player._id)}
                            disabled={squadPlayerIds.includes(player._id)}
                          >
                            {squadPlayerIds.includes(player._id)
                              ? "In Squad"
                              : "Add to Squad"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeletePlayer(player._id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Squad Selection */}
        <TabsContent value="squad" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Squad (GW {currentGameweek})</CardTitle>
              <CardDescription>
                Select 15 players for this gameweek
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {!squad || squad.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No players in squad. Add players from the Player Database tab.
                  </p>
                ) : (
                  <>
                    {/* Group by position */}
                    {["GK", "DEF", "MID", "FWD"].map((position) => {
                      const positionPlayers = squad.filter(
                        (s) => s.position === position
                      );
                      if (positionPlayers.length === 0) return null;

                      return (
                        <div key={position} className="space-y-2">
                          <h3 className="font-semibold text-sm text-muted-foreground mt-4">
                            {position} ({positionPlayers.length})
                          </h3>
                          {positionPlayers.map((player) => (
                            <div
                              key={player._id}
                              className="flex items-center justify-between p-3 border rounded-md"
                            >
                              <div className="flex items-center gap-4">
                                <span className="font-semibold text-sm w-12">
                                  {player.position}
                                </span>
                                <span className="font-medium">
                                  {player.playerName}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {player.team}
                                </span>
                                <span className="text-sm">
                                  £{player.price?.toFixed(1)}m
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveFromSquad(player._id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Weekly Stats */}
        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enter Weekly Stats (GW {currentGameweek})</CardTitle>
              <CardDescription>
                Enter EV, EV95, xMins, and EO for your squad players
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stats-player">Select Player</Label>
                <Select
                  value={selectedPlayerId || ""}
                  onValueChange={(value) => {
                    setSelectedPlayerId(value as Id<"players">);
                    // Load existing stats if available
                    const existing = gameweekInputs?.find(
                      (gi) => gi.playerId === value
                    );
                    if (existing) {
                      setWeeklyStats({
                        ev: existing.ev,
                        ev95: existing.ev95,
                        xMins: existing.xMins,
                        eo: existing.eo,
                      });
                    } else {
                      setWeeklyStats({ ev: 0, ev95: 0, xMins: 0, eo: 0 });
                    }
                  }}
                >
                  <SelectTrigger id="stats-player">
                    <SelectValue placeholder="Select a player from your squad" />
                  </SelectTrigger>
                  <SelectContent>
                    {squad?.map((player) => (
                      <SelectItem key={player.playerId} value={player.playerId}>
                        {player.position} - {player.playerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stat-ev">EV (Expected Value)</Label>
                  <Input
                    id="stat-ev"
                    type="number"
                    step="0.1"
                    value={weeklyStats.ev || ""}
                    onChange={(e) =>
                      setWeeklyStats({
                        ...weeklyStats,
                        ev: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stat-ev95">EV95 (95th Percentile)</Label>
                  <Input
                    id="stat-ev95"
                    type="number"
                    step="0.1"
                    value={weeklyStats.ev95 || ""}
                    onChange={(e) =>
                      setWeeklyStats({
                        ...weeklyStats,
                        ev95: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stat-xMins">xMins (Expected Minutes)</Label>
                  <Input
                    id="stat-xMins"
                    type="number"
                    value={weeklyStats.xMins || ""}
                    onChange={(e) =>
                      setWeeklyStats({
                        ...weeklyStats,
                        xMins: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stat-eo">EO% (Expected Ownership)</Label>
                  <Input
                    id="stat-eo"
                    type="number"
                    step="0.1"
                    value={weeklyStats.eo || ""}
                    onChange={(e) =>
                      setWeeklyStats({
                        ...weeklyStats,
                        eo: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveWeeklyStats} disabled={!selectedPlayerId}>
                Save Weekly Stats
              </Button>
            </CardContent>
          </Card>

          {/* Show existing stats */}
          <Card>
            <CardHeader>
              <CardTitle>Current Week Stats</CardTitle>
              <CardDescription>
                Stats entered for GW {currentGameweek}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {!gameweekInputs || gameweekInputs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No stats entered for this gameweek yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {gameweekInputs.map((input) => (
                      <div
                        key={input._id}
                        className="flex items-center justify-between p-3 border rounded-md text-sm"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-semibold w-12">
                            {input.position}
                          </span>
                          <span className="font-medium w-32">
                            {input.playerName}
                          </span>
                          <span className="text-muted-foreground">
                            EV: {input.ev.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">
                            EV95: {input.ev95.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">
                            xMins: {input.xMins}
                          </span>
                          <span className="text-muted-foreground">
                            EO: {input.eo.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
