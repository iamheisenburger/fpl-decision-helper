"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { calculateCaptainEO, calculateRankPercentage } from "@/convex/eoCalculations";

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

// Variance penalty - non-linear formula to reflect diminishing marginal risk
function calculateVariancePenalty(xMins: number): number {
  return Math.pow((95 - xMins) / 100, 1.5);
}

// Calculate Total Score: EV + ceiling bonus + EO shield - variance penalty
function calculateTotalScore(
  player: { ev: number; ev95: number; xMins: number; captainEO: number },
  eoRate: number,
  eoThreshold: number
): {
  totalScore: number;
  ceilingBonus: number;
  eoShield: number;
  variancePenalty: number;
} {
  const p90 = calculateP90(player.xMins);
  const ceilingBonus = (player.ev95 - player.ev) * p90;
  const eoShield = (player.captainEO / eoThreshold) * eoRate;
  const variancePenalty = calculateVariancePenalty(player.xMins);
  return {
    totalScore: player.ev + ceilingBonus + eoShield - variancePenalty,
    ceilingBonus,
    eoShield,
    variancePenalty,
  };
}

export default function CaptainPage() {
  const settingsData = useQuery(api.userSettings.getSettings);

  // Default settings fallback
  const settings = settingsData || {
    captaincyEoRate: 0.1,
    captaincyEoThreshold: 12,
    xMinsThreshold: 70,
    xMinsPenalty: 0.3,
    weeklyBleedBudget: 0.8,
  };

  const [rank, setRank] = useState("");

  const [player1, setPlayer1] = useState({
    name: "",
    ev: "",
    ev95: "",
    xMins: "",
    ownership: "",
    fixtureDifficulty: 3,
  });

  const [player2, setPlayer2] = useState({
    name: "",
    ev: "",
    ev95: "",
    xMins: "",
    ownership: "",
    fixtureDifficulty: 3,
  });

  const [analysis, setAnalysis] = useState<any>(null);

  const handleAnalyze = () => {
    // Validate inputs
    if (!player1.name || !player2.name) {
      alert("Please enter both player names");
      return;
    }

    if (!rank) {
      alert("Please enter your current FPL rank");
      return;
    }

    const currentRank = parseInt(rank);
    if (isNaN(currentRank) || currentRank <= 0) {
      alert("Please enter a valid rank");
      return;
    }

    // Calculate captain EO for each player
    const p1Ownership = parseFloat(player1.ownership) || 0;
    const p2Ownership = parseFloat(player2.ownership) || 0;
    const p1CaptainEO = calculateCaptainEO(p1Ownership, currentRank, player1.fixtureDifficulty);
    const p2CaptainEO = calculateCaptainEO(p2Ownership, currentRank, player2.fixtureDifficulty);

    const p1 = {
      name: player1.name,
      ev: parseFloat(player1.ev) || 0,
      ev95: parseFloat(player1.ev95) || 0,
      xMins: parseInt(player1.xMins) || 0,
      ownership: p1Ownership,
      fixtureDifficulty: player1.fixtureDifficulty,
      captainEO: p1CaptainEO,
    };

    const p2 = {
      name: player2.name,
      ev: parseFloat(player2.ev) || 0,
      ev95: parseFloat(player2.ev95) || 0,
      xMins: parseInt(player2.xMins) || 0,
      ownership: p2Ownership,
      fixtureDifficulty: player2.fixtureDifficulty,
      captainEO: p2CaptainEO,
    };

    // Identify high-EO player
    const isP1HighEO = p1.captainEO >= p2.captainEO;
    const highEO = isP1HighEO ? p1 : p2;
    const alt = isP1HighEO ? p2 : p1;

    // Calculate Total Scores using threshold settings
    const highEOResult = calculateTotalScore(highEO, settings.captaincyEoRate, settings.captaincyEoThreshold);
    const altResult = calculateTotalScore(alt, settings.captaincyEoRate, settings.captaincyEoThreshold);

    // Decision: Pick player with highest Total Score (EO protection already baked in)
    const recommendedPlayer = highEOResult.totalScore >= altResult.totalScore ? highEO : alt;
    const winningScore = Math.max(highEOResult.totalScore, altResult.totalScore);
    const losingScore = Math.min(highEOResult.totalScore, altResult.totalScore);
    const scoreGap = winningScore - losingScore;

    // Calculate EO gap for display
    const eoGap = Math.abs(highEO.captainEO - alt.captainEO);

    // P90 values for display
    const p90HighEO = calculateP90(highEO.xMins);
    const p90Alt = calculateP90(alt.xMins);

    // Reasoning
    const reasoning = `${recommendedPlayer.name} has the highest Total Score (${winningScore.toFixed(2)}) with EO protection baked in`;

    setAnalysis({
      recommendedPlayer: recommendedPlayer.name,
      winningScore,
      losingScore,
      scoreGap,
      highEOPlayer: {
        ...highEO,
        p90: p90HighEO,
        totalScore: highEOResult.totalScore,
        ceilingBonus: highEOResult.ceilingBonus,
        eoShield: highEOResult.eoShield,
        variancePenalty: highEOResult.variancePenalty
      },
      altPlayer: {
        ...alt,
        p90: p90Alt,
        totalScore: altResult.totalScore,
        ceilingBonus: altResult.ceilingBonus,
        eoShield: altResult.eoShield,
        variancePenalty: altResult.variancePenalty
      },
      eoGap,
      reasoning,
    });
  };

  const rankPercentage = rank && !isNaN(parseInt(rank)) ? calculateRankPercentage(parseInt(rank)) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Captain Decision</h1>
        <p className="text-muted-foreground">
          Enter stats for 2 captain options and get instant recommendation with dynamic EO calculation.
        </p>
      </div>

      {/* Rank Input */}
      <Card>
        <CardHeader>
          <CardTitle>Your Current Rank</CardTitle>
          <CardDescription>
            Used to calculate near-rank competitive ownership. Update this weekly as your rank changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>FPL Rank</Label>
            <Input
              type="number"
              placeholder="e.g., 479527"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
            />
            {rankPercentage !== null && (
              <p className="text-sm text-muted-foreground">
                Top {rankPercentage.toFixed(2)}% of managers
              </p>
            )}
          </div>
        </CardContent>
      </Card>

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
                <Label>Overall Ownership %</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="72.5"
                  value={player1.ownership}
                  onChange={(e) => setPlayer1({ ...player1, ownership: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fixture Difficulty (1=hardest, 5=easiest)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((diff) => (
                  <Button
                    key={diff}
                    type="button"
                    variant={player1.fixtureDifficulty === diff ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setPlayer1({ ...player1, fixtureDifficulty: diff })}
                  >
                    {diff}
                  </Button>
                ))}
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
                <Label>Overall Ownership %</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="35.2"
                  value={player2.ownership}
                  onChange={(e) => setPlayer2({ ...player2, ownership: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fixture Difficulty (1=hardest, 5=easiest)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((diff) => (
                  <Button
                    key={diff}
                    type="button"
                    variant={player2.fixtureDifficulty === diff ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setPlayer2({ ...player2, fixtureDifficulty: diff })}
                  >
                    {diff}
                  </Button>
                ))}
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
              <div className="p-6 rounded-lg bg-primary/10">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    🎯 Highest Total Score
                  </p>
                  <h2 className="text-3xl font-bold mb-2">
                    Captain: {analysis.recommendedPlayer}
                  </h2>
                  <p className="text-sm mt-4 font-medium">{analysis.reasoning}</p>
                  <p className="text-xs mt-2 text-muted-foreground">
                    Wins by {analysis.scoreGap.toFixed(2)} EV
                  </p>
                </div>
              </div>
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
                      High Captain-EO: {analysis.highEOPlayer.name}
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
                        <span className="text-muted-foreground">Ownership:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.ownership.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Captain EO:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.captainEO.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fixture:</span>{" "}
                        <span className="font-medium">
                          {analysis.highEOPlayer.fixtureDifficulty}/5
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
                        <span className="text-muted-foreground">Ownership:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.ownership.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Captain EO:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.captainEO.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fixture:</span>{" "}
                        <span className="font-medium">
                          {analysis.altPlayer.fixtureDifficulty}/5
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EO Shield:</span>
                        <span className="text-green-400">+{analysis.highEOPlayer.eoShield.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Variance Penalty:</span>
                        <span className="text-red-400">-{analysis.highEOPlayer.variancePenalty.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EO Shield:</span>
                        <span className="text-green-400">+{analysis.altPlayer.eoShield.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Variance Penalty:</span>
                        <span className="text-red-400">-{analysis.altPlayer.variancePenalty.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                        <span>Total:</span>
                        <span>{analysis.altPlayer.totalScore.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <hr className="border-border" />

                  <div className="flex justify-between font-semibold">
                    <span>Score Difference:</span>
                    <span>{analysis.scoreGap.toFixed(2)} EV</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Captain EO Gap:</span>
                    <span className="font-medium">
                      {analysis.eoGap.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-md bg-primary/10 border border-primary/20">
                  <p className="text-xs font-medium text-center">
                    ✓ {analysis.recommendedPlayer} wins with highest Total Score
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
