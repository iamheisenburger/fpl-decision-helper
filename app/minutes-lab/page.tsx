"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Id } from "@/convex/_generated/dataModel";

export default function MinutesLabPage() {
  const [selectedGameweek, setSelectedGameweek] = useState(10); // Default to GW10
  const [excludeInjury, setExcludeInjury] = useState(true);
  const [excludeRedCard, setExcludeRedCard] = useState(true);
  const [recencyWindow, setRecencyWindow] = useState(8);

  const settings = useQuery(api.userSettings.getSettings);
  const squad = useQuery(api.userSquad.getSquad, { gameweek: selectedGameweek });

  // Get xMins predictions for squad players
  const xMinsPredictions = useQuery(
    api.xmins.getMultiplePlayersXMins,
    squad
      ? {
          playerIds: squad.map((p: any) => p.playerId),
          gameweek: selectedGameweek,
        }
      : "skip"
  );

  const upsertOverride = useMutation(api.overrides.upsertOverride);
  const applyOverride = useMutation(api.overrides.applyOverride);

  const [overrideValues, setOverrideValues] = useState<Record<string, { xMins?: number; p90?: number }>>({});

  const handleOverride = async (playerId: Id<"players">, field: "xMins" | "p90", value: number) => {
    try {
      await applyOverride({
        playerId,
        gameweek: selectedGameweek,
        field,
        value,
        reason: "Manual override from Minutes Lab",
      });
      alert("Override applied successfully!");
    } catch (error) {
      alert(`Failed to apply override: ${error}`);
    }
  };

  if (!squad) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Minutes Lab</h1>
          <p className="text-muted-foreground">
            No squad data found for GW{selectedGameweek}. Please add your squad first.
          </p>
          <Button className="mt-4" onClick={() => (window.location.href = "/data-entry")}>
            Go to Data Entry
          </Button>
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
          View and manage expected minutes predictions for your squad
        </p>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Prediction Settings</CardTitle>
          <CardDescription>Configure how predictions are calculated</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

            <div className="space-y-2">
              <Label>Recency Window (GWs)</Label>
              <Input
                type="number"
                value={recencyWindow}
                onChange={(e) => setRecencyWindow(parseInt(e.target.value))}
                min={3}
                max={15}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="exclude-injury"
                  checked={excludeInjury}
                  onCheckedChange={setExcludeInjury}
                />
                <Label htmlFor="exclude-injury">Exclude Injury Exits</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="exclude-red"
                  checked={excludeRedCard}
                  onCheckedChange={setExcludeRedCard}
                />
                <Label htmlFor="exclude-red">Exclude Red Cards</Label>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={() => alert("Recompute triggered!")} className="w-full md:w-auto">
              Recompute All Predictions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Squad Predictions Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Squad (GW{selectedGameweek})</h2>

        {squad.map((playerSquad: any) => {
          const prediction = xMinsPredictions?.find((p: any) => p.playerId === playerSquad.playerId)?.xmins;

          return (
            <Card key={playerSquad.playerId}>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Player Info */}
                  <div className="md:col-span-3">
                    <div className="font-semibold">{playerSquad.playerName}</div>
                    <div className="text-sm text-muted-foreground">
                      {playerSquad.position} • {playerSquad.team}
                    </div>
                  </div>

                  {/* Predictions */}
                  {prediction ? (
                    <>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">xMins</Label>
                        <div className="text-lg font-semibold">
                          {(prediction.startProb * prediction.xMinsStart).toFixed(1)}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">P90</Label>
                        <div className="text-lg font-semibold">
                          {(prediction.p90 * 100).toFixed(0)}%
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Start Prob</Label>
                        <div className="text-lg font-semibold">
                          {(prediction.startProb * 100).toFixed(0)}%
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Source</Label>
                        <Badge variant={prediction.source === "model" ? "default" : "secondary"}>
                          {prediction.source}
                        </Badge>
                        {prediction.flags?.roleLock && (
                          <Badge variant="outline" className="ml-2">
                            Role Lock
                          </Badge>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-8 text-center text-muted-foreground">
                      No prediction available
                    </div>
                  )}

                  {/* Override Button */}
                  <div className="md:col-span-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newXMins = prompt(
                          "Enter new xMins value:",
                          prediction
                            ? String((prediction.startProb * prediction.xMinsStart).toFixed(1))
                            : "85"
                        );
                        if (newXMins !== null) {
                          handleOverride(playerSquad.playerId, "xMins", parseFloat(newXMins));
                        }
                      }}
                    >
                      Override
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Impact Preview */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Impact Preview</CardTitle>
          <CardDescription>
            How these xMins values affect your captain and XI decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            💡 This will show diff before/after when you modify xMins values.
            <br />
            Coming soon: Real-time captain/XI recalculation on override.
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm">
            <div>
              <strong>How it works:</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong>Heuristic Mode:</strong> Uses recency-weighted averages of recent healthy
                starts
              </li>
              <li>
                <strong>Role Lock:</strong> Detected when player has 3+ consecutive 85+ minute
                starts
              </li>
              <li>
                <strong>P90:</strong> Probability of playing 90 minutes (granular buckets: 95→1.0,
                90→0.9, etc.)
              </li>
              <li>
                <strong>Override:</strong> Manually set xMins/P90 values that flow to captain/XI
                pages
              </li>
              <li>
                <strong>Coming Soon:</strong> ML-based predictions via FastAPI service
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
