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

export default function XIPage() {
  const [currentGameweek, setCurrentGameweek] = useState(10);
  const [preferredFormation, setPreferredFormation] = useState<
    "any" | "4-4-2" | "3-5-2" | "4-3-3" | "3-4-3" | "5-4-1" | "5-3-2"
  >("any");

  // Query
  const optimization = useQuery(api.engines.xiOptimizer.optimizeXI, {
    gameweek: currentGameweek,
    preferredFormation,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">XI Optimizer</h1>
        <p className="text-muted-foreground">
          Get your optimal starting XI based on Risk-Adjusted EV (RAEV), balancing EV, EO, and
          rMins.
        </p>
      </div>

      {/* Controls */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gameweek">Gameweek:</Label>
                <Select
                  value={currentGameweek.toString()}
                  onValueChange={(value) => setCurrentGameweek(parseInt(value))}
                >
                  <SelectTrigger>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="formation">Preferred Formation:</Label>
                <Select
                  value={preferredFormation}
                  onValueChange={(value: any) => setPreferredFormation(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any (Best RAEV)</SelectItem>
                    <SelectItem value="4-4-2">4-4-2</SelectItem>
                    <SelectItem value="3-5-2">3-5-2</SelectItem>
                    <SelectItem value="4-3-3">4-3-3</SelectItem>
                    <SelectItem value="3-4-3">3-4-3</SelectItem>
                    <SelectItem value="5-4-1">5-4-1</SelectItem>
                    <SelectItem value="5-3-2">5-3-2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {!optimization ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Loading optimization... Make sure you have 15 players in your squad with stats
              entered.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Card */}
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle>Optimized XI</CardTitle>
              <CardDescription>Formation: {optimization.formation}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Total RAEV</p>
                  <p className="text-2xl font-bold">
                    {optimization.totalRAEV.toFixed(2)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Total EV</p>
                  <p className="text-2xl font-bold">
                    {optimization.totalEV.toFixed(2)}
                  </p>
                </div>
                <div
                  className={`p-4 rounded-md ${
                    optimization.xiBleed > 0.5
                      ? "bg-amber-50 dark:bg-amber-950"
                      : "bg-gray-50 dark:bg-gray-900"
                  }`}
                >
                  <p className="text-sm text-muted-foreground mb-1">XI Bleed</p>
                  <p className="text-2xl font-bold">
                    {optimization.xiBleed.toFixed(2)} EV
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Starting XI */}
          <Card>
            <CardHeader>
              <CardTitle>Starting XI (11 players)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Group by position */}
                {["GK", "DEF", "MID", "FWD"].map((position) => {
                  const positionPlayers = optimization.xi.filter(
                    (p) => p.position === position
                  );
                  if (positionPlayers.length === 0) return null;

                  return (
                    <div key={position} className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground mt-4">
                        {position} ({positionPlayers.length})
                      </h3>
                      {positionPlayers.map((player) => (
                        <div
                          key={player.playerId}
                          className="flex items-center justify-between p-3 border rounded-md bg-green-50 dark:bg-green-950"
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-semibold text-sm w-12">
                              {player.position}
                            </span>
                            <span className="font-medium">{player.name}</span>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <span className="text-muted-foreground">
                              EV: {player.ev.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground">
                              EO: {player.eo.toFixed(1)}%
                            </span>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              RAEV: {player.raev.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Bench */}
          <Card>
            <CardHeader>
              <CardTitle>Bench (4 players)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {optimization.bench.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No bench players</p>
                ) : (
                  optimization.bench.map((player) => (
                    <div
                      key={player.playerId}
                      className="flex items-center justify-between p-3 border rounded-md"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-sm w-12">
                          {player.position}
                        </span>
                        <span className="font-medium">{player.name}</span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-muted-foreground">
                          EV: {player.ev.toFixed(1)}
                        </span>
                        <span className="text-muted-foreground">
                          EO: {player.eo.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">
                          RAEV: {player.raev.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pivot Options */}
          {optimization.pivotOptions && optimization.pivotOptions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Pivot Options</CardTitle>
                <CardDescription>
                  Potential bench → starter swaps (positive margin means beneficial)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {optimization.pivotOptions.map((pivot, idx) => (
                    <div
                      key={idx}
                      className={`p-4 border rounded-md ${
                        pivot.margin > 0
                          ? "bg-blue-50 dark:bg-blue-950"
                          : "bg-gray-50 dark:bg-gray-900"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">
                          {pivot.benchPlayer} ↔ {pivot.starterToReplace}
                        </span>
                        <span
                          className={`font-bold ${
                            pivot.margin > 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {pivot.margin > 0 ? "+" : ""}
                          {pivot.margin.toFixed(2)} margin
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>EV diff: {pivot.evDiff.toFixed(2)}</span>
                        <span>EO diff: {pivot.eoDiff.toFixed(1)}%</span>
                        <span>rMins bonus: {pivot.rminsBonus.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
