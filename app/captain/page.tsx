"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

export default function CaptainPage() {
  const [currentGameweek, setCurrentGameweek] = useState(10);
  const [player1Id, setPlayer1Id] = useState<Id<"players"> | null>(null);
  const [player2Id, setPlayer2Id] = useState<Id<"players"> | null>(null);

  // Queries
  const squad = useQuery(api.userSquad.getSquad, { gameweek: currentGameweek });
  const analysis = useQuery(
    api.engines.captaincy.analyzeCaptaincy,
    player1Id && player2Id
      ? { gameweek: currentGameweek, player1Id, player2Id }
      : "skip"
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Captain Decision</h1>
        <p className="text-muted-foreground">
          Compare two captain options and get a data-driven recommendation based on your risk profile.
        </p>
      </div>

      {/* Gameweek Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="gameweek">Gameweek:</Label>
            <Select
              value={currentGameweek.toString()}
              onValueChange={(value) => {
                setCurrentGameweek(parseInt(value));
                setPlayer1Id(null);
                setPlayer2Id(null);
              }}
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

      {/* Player Selection */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Captain Option 1</CardTitle>
            <CardDescription>Select first captain candidate</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={player1Id || ""}
              onValueChange={(value) => setPlayer1Id(value as Id<"players">)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {squad
                  ?.filter((p) => p.playerId !== player2Id)
                  .map((player) => (
                    <SelectItem key={player.playerId} value={player.playerId}>
                      {player.position} - {player.playerName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Captain Option 2</CardTitle>
            <CardDescription>Select second captain candidate</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={player2Id || ""}
              onValueChange={(value) => setPlayer2Id(value as Id<"players">)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {squad
                  ?.filter((p) => p.playerId !== player1Id)
                  .map((player) => (
                    <SelectItem key={player.playerId} value={player.playerId}>
                      {player.position} - {player.playerName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Results */}
      {!player1Id || !player2Id ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Select two players above to see captain recommendation
            </p>
          </CardContent>
        </Card>
      ) : !analysis ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Loading analysis... Make sure both players have stats entered for this gameweek.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Recommendation Card */}
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="text-2xl">Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`p-6 rounded-lg ${
                  analysis.pickHighEO
                    ? "bg-green-50 dark:bg-green-950"
                    : "bg-blue-50 dark:bg-blue-950"
                }`}
              >
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    {analysis.pickHighEO ? "🛡️ Shield High-EO" : "🎯 Chase EV"}
                  </p>
                  <h2 className="text-3xl font-bold mb-2">
                    Captain: {analysis.recommendedPlayerName}
                  </h2>
                  <p className="text-sm mt-4 font-medium">{analysis.reasoning}</p>
                </div>
              </div>

              {analysis.captainBleed > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-md">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ⚠️ Captain Bleed: {analysis.captainBleed.toFixed(2)} EV
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    You're protecting rank at a slight EV cost
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detailed Breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Player Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>Player Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2 text-green-600 dark:text-green-400">
                      High-EO: {analysis.highEOPlayer.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">EV:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.ev.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">EV95:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.ev95.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">xMins:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.xMins}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">EO:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.eo.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">P90:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.p90.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <hr />

                  <div>
                    <h3 className="font-semibold mb-2 text-blue-600 dark:text-blue-400">
                      Alt: {analysis.altPlayer.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">EV:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.ev.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">EV95:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.ev95.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">xMins:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.xMins}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">EO:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.eo.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">P90:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.p90.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calculation Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Calculation Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">EO Gap:</span>
                    <span className="font-medium">
                      {analysis.eoGap.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tolerance:</span>
                    <span className="font-medium">
                      {analysis.tolerance.toFixed(2)} EV
                    </span>
                  </div>
                  <hr />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">EV Gap (Raw):</span>
                    <span className="font-medium">
                      {analysis.evGapRaw.toFixed(2)} EV
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      rMins Surcharge:
                    </span>
                    <span className="font-medium">
                      +{analysis.rMinsSurcharge.toFixed(2)} EV
                    </span>
                  </div>
                  {analysis.xMinsPenalty > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        xMins Penalty:
                      </span>
                      <span className="font-medium text-amber-600">
                        +{analysis.xMinsPenalty.toFixed(2)} EV
                      </span>
                    </div>
                  )}
                  <hr />
                  <div className="flex justify-between font-semibold">
                    <span>EV Gap (Effective):</span>
                    <span>{analysis.evGapEffective.toFixed(2)} EV</span>
                  </div>
                </div>

                <div
                  className={`mt-4 p-3 rounded-md ${
                    analysis.evGapEffective <= analysis.tolerance
                      ? "bg-green-50 dark:bg-green-950"
                      : "bg-blue-50 dark:bg-blue-950"
                  }`}
                >
                  <p className="text-xs font-medium text-center">
                    {analysis.evGapEffective <= analysis.tolerance ? (
                      <>
                        ✓ Effective gap ({analysis.evGapEffective.toFixed(2)}) ≤
                        Tolerance ({analysis.tolerance.toFixed(2)})
                      </>
                    ) : (
                      <>
                        ✗ Effective gap ({analysis.evGapEffective.toFixed(2)}) &gt;
                        Tolerance ({analysis.tolerance.toFixed(2)})
                      </>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
