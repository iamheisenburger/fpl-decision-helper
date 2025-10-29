"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

// Calculation functions
function calculateP90(xMins: number): number {
  if (xMins >= 88) return 1.0;
  if (xMins >= 85) return 0.7;
  if (xMins >= 81) return 0.4;
  return 0.0;
}

function calculateRAEV(player: {
  ev: number;
  ev95: number;
  xMins: number;
  eo: number;
}): number {
  const p90 = calculateP90(player.xMins);
  const playerUpside = player.ev95 * p90;

  // Simple RAEV = EV + small EO bonus
  const eoBonus = player.eo > 50 ? 0.1 : 0;
  return player.ev + eoBonus;
}

type Position = "GK" | "DEF" | "MID" | "FWD";

interface Player {
  name: string;
  position: Position;
  ev: number;
  ev95: number;
  xMins: number;
  eo: number;
  raev: number;
}

const emptyPlayer = {
  name: "",
  position: "MID" as Position,
  ev: 0,
  ev95: 0,
  xMins: 0,
  eo: 0,
};

export default function XIPage() {
  const [players, setPlayers] = useState<any[]>(
    Array(15).fill(null).map(() => ({ ...emptyPlayer }))
  );
  const [result, setResult] = useState<any>(null);

  const updatePlayer = (index: number, field: string, value: any) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], [field]: value };
    setPlayers(newPlayers);
  };

  const optimizeXI = () => {
    // Filter filled players
    const filledPlayers: Player[] = players
      .filter(p => p.name)
      .map(p => ({
        ...p,
        ev: parseFloat(p.ev as any) || 0,
        ev95: parseFloat(p.ev95 as any) || 0,
        xMins: parseInt(p.xMins as any) || 0,
        eo: parseFloat(p.eo as any) || 0,
        raev: 0,
      }))
      .map(p => ({
        ...p,
        raev: calculateRAEV(p),
      }));

    if (filledPlayers.length < 11) {
      alert("Please enter at least 11 players");
      return;
    }

    // Group by position
    const gks = filledPlayers.filter(p => p.position === "GK").sort((a, b) => b.raev - a.raev);
    const defs = filledPlayers.filter(p => p.position === "DEF").sort((a, b) => b.raev - a.raev);
    const mids = filledPlayers.filter(p => p.position === "MID").sort((a, b) => b.raev - a.raev);
    const fwds = filledPlayers.filter(p => p.position === "FWD").sort((a, b) => b.raev - a.raev);

    // Greedy selection - pick best by RAEV respecting formation constraints
    const formations = [
      { def: 3, mid: 5, fwd: 2 },
      { def: 4, mid: 4, fwd: 2 },
      { def: 4, mid: 3, fwd: 3 },
      { def: 3, mid: 4, fwd: 3 },
      { def: 5, mid: 4, fwd: 1 },
      { def: 5, mid: 3, fwd: 2 },
    ];

    let bestXI: Player[] = [];
    let bestFormation = "";
    let bestTotalRAEV = -Infinity;

    for (const formation of formations) {
      if (defs.length < formation.def || mids.length < formation.mid || fwds.length < formation.fwd || gks.length < 1) {
        continue;
      }

      const xi = [
        ...gks.slice(0, 1),
        ...defs.slice(0, formation.def),
        ...mids.slice(0, formation.mid),
        ...fwds.slice(0, formation.fwd),
      ];

      const totalRAEV = xi.reduce((sum, p) => sum + p.raev, 0);

      if (totalRAEV > bestTotalRAEV) {
        bestTotalRAEV = totalRAEV;
        bestXI = xi;
        bestFormation = `${formation.def}-${formation.mid}-${formation.fwd}`;
      }
    }

    const bench = filledPlayers.filter(p => !bestXI.some(starter => starter.name === p.name));

    setResult({
      xi: bestXI,
      bench,
      formation: bestFormation,
      totalRAEV: bestTotalRAEV,
      totalEV: bestXI.reduce((sum, p) => sum + p.ev, 0),
    });
  };

  const quickFill = () => {
    // Quick fill example data for testing
    setPlayers([
      { name: "Sels", position: "GK", ev: 2.5, ev95: 4.5, xMins: 90, eo: 5.2 },
      { name: "Flekken", position: "GK", ev: 2.3, ev95: 4.2, xMins: 90, eo: 3.1 },
      { name: "Gabriel", position: "DEF", ev: 4.2, ev95: 5.5, xMins: 88, eo: 35.4 },
      { name: "Gvardiol", position: "DEF", ev: 4.3, ev95: 4.6, xMins: 86, eo: 5.6 },
      { name: "Lewis", position: "DEF", ev: 4.1, ev95: 4.8, xMins: 85, eo: 12.3 },
      { name: "Robinson", position: "DEF", ev: 3.8, ev95: 4.2, xMins: 82, eo: 8.1 },
      { name: "Pedro Porro", position: "DEF", ev: 3.9, ev95: 5.1, xMins: 84, eo: 15.7 },
      { name: "Salah", position: "MID", ev: 7.8, ev95: 12.4, xMins: 90, eo: 82.3 },
      { name: "Semenyo", position: "MID", ev: 4.5, ev95: 4.5, xMins: 95, eo: 64.4 },
      { name: "Palmer", position: "MID", ev: 7.2, ev95: 11.8, xMins: 88, eo: 78.1 },
      { name: "Saka", position: "MID", ev: 6.8, ev95: 10.2, xMins: 87, eo: 52.3 },
      { name: "Reijnders", position: "MID", ev: 4.3, ev95: 4.9, xMins: 82, eo: 26.8 },
      { name: "Haaland", position: "FWD", ev: 5.7, ev95: 6.2, xMins: 85, eo: 68.5 },
      { name: "Cunha", position: "FWD", ev: 5.1, ev95: 5.8, xMins: 86, eo: 42.1 },
      { name: "Strand Larsen", position: "FWD", ev: 3.9, ev95: 4.3, xMins: 75, eo: 8.7 },
    ]);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">XI Optimizer</h1>
          <p className="text-muted-foreground">
            Enter 15 players and get your optimized starting XI.
          </p>
        </div>
        <Button variant="outline" onClick={quickFill}>Quick Fill (Test Data)</Button>
      </div>

      {/* Player Input Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Your 15-Player Squad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {players.map((player, index) => (
              <div key={index} className="grid grid-cols-7 gap-2 items-end">
                <div className="col-span-2">
                  {index === 0 && <Label className="text-xs mb-1 block">Name</Label>}
                  <Input
                    placeholder={`Player ${index + 1}`}
                    value={player.name}
                    onChange={(e) => updatePlayer(index, "name", e.target.value)}
                  />
                </div>
                <div>
                  {index === 0 && <Label className="text-xs mb-1 block">Pos</Label>}
                  <Select
                    value={player.position}
                    onValueChange={(value) => updatePlayer(index, "position", value)}
                  >
                    <SelectTrigger>
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
                <div>
                  {index === 0 && <Label className="text-xs mb-1 block">EV</Label>}
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="EV"
                    value={player.ev || ""}
                    onChange={(e) => updatePlayer(index, "ev", e.target.value)}
                  />
                </div>
                <div>
                  {index === 0 && <Label className="text-xs mb-1 block">EV95</Label>}
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="EV95"
                    value={player.ev95 || ""}
                    onChange={(e) => updatePlayer(index, "ev95", e.target.value)}
                  />
                </div>
                <div>
                  {index === 0 && <Label className="text-xs mb-1 block">xMins</Label>}
                  <Input
                    type="number"
                    placeholder="xMins"
                    value={player.xMins || ""}
                    onChange={(e) => updatePlayer(index, "xMins", e.target.value)}
                  />
                </div>
                <div>
                  {index === 0 && <Label className="text-xs mb-1 block">EO%</Label>}
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="EO%"
                    value={player.eo || ""}
                    onChange={(e) => updatePlayer(index, "eo", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button size="lg" onClick={optimizeXI} className="w-full md:w-auto">
          Optimize XI
        </Button>
      </div>

      {/* Results */}
      {result && (
        <>
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle>Optimized XI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-center mb-6">
                <div className="p-4 bg-green-500/10 rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Formation</p>
                  <p className="text-2xl font-bold">{result.formation}</p>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Total EV</p>
                  <p className="text-2xl font-bold">{result.totalEV.toFixed(1)}</p>
                </div>
                <div className="p-4 bg-purple-500/10 rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Total RAEV</p>
                  <p className="text-2xl font-bold">{result.totalRAEV.toFixed(1)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold mb-3">Starting XI (11 players)</h3>
                {["GK", "DEF", "MID", "FWD"].map((position) => {
                  const positionPlayers = result.xi.filter(
                    (p: Player) => p.position === position
                  );
                  if (positionPlayers.length === 0) return null;

                  return (
                    <div key={position} className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        {position} ({positionPlayers.length})
                      </p>
                      {positionPlayers.map((player: Player, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 border rounded-md bg-green-500/5"
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-semibold text-sm w-8">
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
                            <span className="font-medium text-green-400">
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

          {result.bench.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bench ({result.bench.length} players)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.bench.map((player: Player, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 border rounded-md"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-sm w-8">
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
