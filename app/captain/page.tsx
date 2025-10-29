"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// P90 confidence thresholds (granular)
function calculateP90(xMins: number): number {
  if (xMins >= 95) return 1.0;
  if (xMins >= 90) return 0.9;
  if (xMins >= 88) return 0.85;
  if (xMins >= 86) return 0.75;
  if (xMins >= 84) return 0.65;
  if (xMins >= 82) return 0.55;
  if (xMins >= 80) return 0.45;
  if (xMins >= 75) return 0.30;
  if (xMins >= 70) return 0.15;
  return 0.0;
}

// Variance penalty - increases as player strays from 95 xMins
function calculateVariancePenalty(xMins: number): number {
  return (95 - xMins) / 100;
}

// Calculate EO tolerance
function calculateTolerance(eoGap: number, settings: { captaincyEoRate: number; captaincyEoCap: number }): number {
  const tolerance = (eoGap / 10) * settings.captaincyEoRate;
  return Math.min(settings.captaincyEoCap, tolerance);
}

// Calculate Total Score: EV + ceiling bonus - variance penalty
function calculateTotalScore(player: { ev: number; ev95: number; xMins: number }): number {
  const p90 = calculateP90(player.xMins);
  const ceilingBonus = (player.ev95 - player.ev) * p90 * 0.5;
  const variancePenalty = calculateVariancePenalty(player.xMins);
  return player.ev + ceilingBonus - variancePenalty;
}

export default function CaptainPage() {
  const settingsData = useQuery(api.userSettings.getSettings);

  // Default settings fallback
  const settings = settingsData || {
    captaincyEoRate: 0.1,
    captaincyEoCap: 1.0,
    xMinsThreshold: 70,
    xMinsPenalty: 0.3,
    weeklyBleedBudget: 0.8,
  };
  const [player1, setPlayer1] = useState({
    name: "",
    ev: "",
    ev95: "",
    xMins: "",
    eo: "",
  });

  const [player2, setPlayer2] = useState({
    name: "",
    ev: "",
    ev95: "",
    xMins: "",
    eo: "",
  });

  const [analysis, setAnalysis] = useState<any>(null);

  const handleAnalyze = () => {
    // Validate inputs
    if (!player1.name || !player2.name) {
      alert("Please enter both player names");
      return;
    }

    const p1 = {
      name: player1.name,
      ev: parseFloat(player1.ev) || 0,
      ev95: parseFloat(player1.ev95) || 0,
      xMins: parseInt(player1.xMins) || 0,
      eo: parseFloat(player1.eo) || 0,
    };

    const p2 = {
      name: player2.name,
      ev: parseFloat(player2.ev) || 0,
      ev95: parseFloat(player2.ev95) || 0,
      xMins: parseInt(player2.xMins) || 0,
      eo: parseFloat(player2.eo) || 0,
    };

    // Identify high-EO player
    const isP1HighEO = p1.eo >= p2.eo;
    const highEO = isP1HighEO ? p1 : p2;
    const alt = isP1HighEO ? p2 : p1;

    // Calculate Total Scores independently
    const highEOTotalScore = calculateTotalScore(highEO);
    const altTotalScore = calculateTotalScore(alt);

    // Calculate advantage gap
    const advantageGap = altTotalScore - highEOTotalScore;

    // Calculate EO tolerance
    const eoGap = highEO.eo - alt.eo;
    const tolerance = calculateTolerance(eoGap, settings);

    // Decision: Shield if advantage gap is within tolerance
    const pickHighEO = advantageGap <= tolerance;
    const recommendedPlayer = pickHighEO ? highEO : alt;

    // Captain bleed: Total Score (RAEV) sacrificed when shielding high-EO
    const evGapRaw = alt.ev - highEO.ev;
    const captainBleed = pickHighEO ? Math.max(0, advantageGap) : 0;

    // P90 values for display
    const p90HighEO = calculateP90(highEO.xMins);
    const p90Alt = calculateP90(alt.xMins);

    // Calculate ceiling bonuses for display
    const highEOCeilingBonus = (highEO.ev95 - highEO.ev) * p90HighEO * 0.5;
    const altCeilingBonus = (alt.ev95 - alt.ev) * p90Alt * 0.5;

    // Reasoning
    let reasoning = "";
    if (pickHighEO) {
      reasoning = `Advantage gap (${advantageGap.toFixed(
        2
      )} EV) ≤ tolerance (${tolerance.toFixed(2)} EV) → Shield ${
        recommendedPlayer.name
      } (${recommendedPlayer.eo.toFixed(1)}% EO)`;
    } else {
      reasoning = `Advantage gap (${advantageGap.toFixed(
        2
      )} EV) > tolerance (${tolerance.toFixed(2)} EV) → Chase ${
        recommendedPlayer.name
      } (${recommendedPlayer.ev.toFixed(1)} EV)`;
    }

    setAnalysis({
      recommendedPlayer: recommendedPlayer.name,
      pickHighEO,
      highEOPlayer: { ...highEO, p90: p90HighEO, totalScore: highEOTotalScore, ceilingBonus: highEOCeilingBonus },
      altPlayer: { ...alt, p90: p90Alt, totalScore: altTotalScore, ceilingBonus: altCeilingBonus },
      eoGap,
      tolerance,
      evGapRaw,
      advantageGap,
      captainBleed,
      reasoning,
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Captain Decision</h1>
        <p className="text-muted-foreground">
          Enter stats for 2 captain options and get instant recommendation.
        </p>
      </div>

      {/* Input Form */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Captain Option 1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Player Name</Label>
              <Input
                placeholder="e.g., Erling Haaland"
                value={player1.name}
                onChange={(e) => setPlayer1({ ...player1, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>EV</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="5.7"
                  value={player1.ev}
                  onChange={(e) => setPlayer1({ ...player1, ev: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>EV95</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="16.8"
                  value={player1.ev95}
                  onChange={(e) => setPlayer1({ ...player1, ev95: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>xMins</Label>
                <Input
                  type="number"
                  placeholder="85"
                  value={player1.xMins}
                  onChange={(e) => setPlayer1({ ...player1, xMins: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>EO%</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="68.5"
                  value={player1.eo}
                  onChange={(e) => setPlayer1({ ...player1, eo: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Captain Option 2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Player Name</Label>
              <Input
                placeholder="e.g., Bruno Fernandes"
                value={player2.name}
                onChange={(e) => setPlayer2({ ...player2, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>EV</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="6.2"
                  value={player2.ev}
                  onChange={(e) => setPlayer2({ ...player2, ev: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>EV95</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="16.8"
                  value={player2.ev95}
                  onChange={(e) => setPlayer2({ ...player2, ev95: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>xMins</Label>
                <Input
                  type="number"
                  placeholder="89"
                  value={player2.xMins}
                  onChange={(e) => setPlayer2({ ...player2, xMins: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>EO%</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="16.8"
                  value={player2.eo}
                  onChange={(e) => setPlayer2({ ...player2, eo: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button size="lg" onClick={handleAnalyze} className="w-full md:w-auto">
          Analyze Captain Choice
        </Button>
      </div>

      {/* Results */}
      {analysis && (
        <>
          {/* Recommendation Card */}
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="text-2xl">Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`p-6 rounded-lg ${
                  analysis.pickHighEO ? "bg-green-500/10" : "bg-blue-500/10"
                }`}
              >
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    {analysis.pickHighEO ? "🛡️ Shield High-EO" : "🎯 Chase EV"}
                  </p>
                  <h2 className="text-3xl font-bold mb-2">
                    Captain: {analysis.recommendedPlayer}
                  </h2>
                  <p className="text-sm mt-4 font-medium">{analysis.reasoning}</p>
                </div>
              </div>

              {analysis.captainBleed > 0 && (
                <div className={`p-4 rounded-md border ${
                  analysis.captainBleed > settings.weeklyBleedBudget
                    ? "bg-red-500/10 border-red-500/20"
                    : "bg-amber-500/10 border-amber-500/20"
                }`}>
                  <p className={`text-sm font-medium ${
                    analysis.captainBleed > settings.weeklyBleedBudget ? "text-red-400" : "text-amber-400"
                  }`}>
                    {analysis.captainBleed > settings.weeklyBleedBudget ? "🚨" : "⚠️"} Captain Bleed: {analysis.captainBleed.toFixed(2)} EV / {settings.weeklyBleedBudget.toFixed(1)} budget
                  </p>
                  <p className={`text-xs mt-1 ${
                    analysis.captainBleed > settings.weeklyBleedBudget ? "text-red-400/80" : "text-amber-400/80"
                  }`}>
                    {analysis.captainBleed > settings.weeklyBleedBudget
                      ? "⚠️ Exceeds your weekly bleed budget! Consider chasing EV instead."
                      : "You're protecting rank at an acceptable EV cost"}
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
                    <h3 className="font-semibold mb-2 text-green-400">
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

                  <hr className="border-border" />

                  <div>
                    <h3 className="font-semibold mb-2 text-blue-400">
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
                  <div className="space-y-2">
                    <div className="font-semibold text-green-400">
                      {analysis.highEOPlayer.name} Total Score:
                    </div>
                    <div className="pl-4 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base EV:</span>
                        <span>{analysis.highEOPlayer.ev.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ceiling Bonus:</span>
                        <span className="text-green-400">+{analysis.highEOPlayer.ceilingBonus.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Total:</span>
                        <span>{analysis.highEOPlayer.totalScore.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-semibold text-blue-400">
                      {analysis.altPlayer.name} Total Score:
                    </div>
                    <div className="pl-4 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base EV:</span>
                        <span>{analysis.altPlayer.ev.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ceiling Bonus:</span>
                        <span className="text-green-400">+{analysis.altPlayer.ceilingBonus.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Total:</span>
                        <span>{analysis.altPlayer.totalScore.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  <div className="flex justify-between font-semibold">
                    <span>Advantage Gap:</span>
                    <span>{analysis.advantageGap.toFixed(2)} EV</span>
                  </div>
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
                </div>

                <div
                  className={`mt-4 p-3 rounded-md ${
                    analysis.advantageGap <= analysis.tolerance
                      ? "bg-green-500/10 border border-green-500/20"
                      : "bg-blue-500/10 border border-blue-500/20"
                  }`}
                >
                  <p className="text-xs font-medium text-center">
                    {analysis.advantageGap <= analysis.tolerance ? (
                      <>
                        ✓ Advantage gap ({analysis.advantageGap.toFixed(2)}) ≤
                        Tolerance ({analysis.tolerance.toFixed(2)})
                      </>
                    ) : (
                      <>
                        ✗ Advantage gap ({analysis.advantageGap.toFixed(2)}) &gt;
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
