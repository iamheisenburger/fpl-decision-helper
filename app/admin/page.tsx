"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  const [syncStatus, setSyncStatus] = useState("");
  const [contextStatus, setContextStatus] = useState("");
  const [predictionStatus, setPredictionStatus] = useState("");

  const syncPlayers = useAction(api.dataIngestion.syncPlayers);
  const syncGameweekContext = useAction(api.dataIngestion.syncGameweekContext);
  const generateSquadPredictions = useAction(api.dataIngestion.generateSquadPredictions);

  const allPlayers = useQuery(api.players.getAllPlayers);
  const settings = useQuery(api.userSettings.getSettings);

  const handleSyncPlayers = async () => {
    setSyncStatus("Syncing players from FPL API...");
    try {
      const result = await syncPlayers({});
      if (result.success) {
        setSyncStatus(`✅ Synced ${result.synced}/${result.total} players (${result.errors} errors)`);
      } else {
        setSyncStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setSyncStatus(`❌ Error: ${error}`);
    }
  };

  const handleSyncContext = async () => {
    setContextStatus("Syncing gameweek context...");
    try {
      const result = await syncGameweekContext({});
      if (result.success) {
        setContextStatus(`✅ Synced ${result.synced} gameweeks`);
      } else {
        setContextStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setContextStatus(`❌ Error: ${error}`);
    }
  };

  const handleTestPredictions = async () => {
    setPredictionStatus("Generating test predictions (this may take 1-2 minutes)...");
    try {
      // Use current gameweek from settings, or default to 10
      const currentGW = settings?.currentGameweek || 10;
      const result = await generateSquadPredictions({ gameweek: currentGW });

      if (result.success) {
        setPredictionStatus(
          `✅ ${result.message}\n` +
          `Successfully generated: ${result.successCount}, Failed: ${result.failedCount}\n` +
          (result.errors.length > 0 ? `Errors: ${result.errors.map(e => `${e.playerName}: ${e.error}`).join(', ')}` : '')
        );
      } else {
        setPredictionStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setPredictionStatus(`❌ Error: ${error}`);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin & Testing</h1>
        <p className="text-muted-foreground">
          Initialize the xMins prediction system and test functionality
        </p>
      </div>

      <div className="grid gap-6">
        {/* Step 1: Sync Players */}
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Sync FPL Players</CardTitle>
            <CardDescription>
              Fetch all 600+ Premier League players from FPL Official API and store in database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handleSyncPlayers}>
                Sync Players from FPL
              </Button>
              {allPlayers && (
                <Badge variant="secondary">
                  {allPlayers.length} players in database
                </Badge>
              )}
            </div>
            {syncStatus && (
              <div className="text-sm">
                {syncStatus}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Sync Context */}
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Sync Gameweek Context</CardTitle>
            <CardDescription>
              Fetch fixture congestion and international break data for all gameweeks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleSyncContext}>
              Sync Gameweek Context
            </Button>
            {contextStatus && (
              <div className="text-sm">
                {contextStatus}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Test Predictions */}
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Generate Test Predictions</CardTitle>
            <CardDescription>
              Run heuristic predictions for your current squad (uses recent form data)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleTestPredictions} variant="default">
              Generate Predictions (Heuristic)
            </Button>
            {predictionStatus && (
              <div className="text-sm">
                {predictionStatus}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-4">
              Note: Heuristic predictions use simple statistics (weighted averages, role lock detection).
              For ML-based predictions, deploy the Python FastAPI service.
            </div>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Players in Database:</span>
                <Badge variant="outline">{allPlayers?.length || 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span>xMins Model Enabled:</span>
                <Badge variant={settings?.xMinsUseModel ? "default" : "secondary"}>
                  {settings?.xMinsUseModel ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Recency Window:</span>
                <Badge variant="outline">{settings?.xMinsRecencyWindow || 8} GWs</Badge>
              </div>
              <div className="flex justify-between">
                <span>Min Healthy Starts:</span>
                <Badge variant="outline">{settings?.xMinsMinHealthyStarts || 5}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              1. ✅ Run Steps 1-3 above to initialize the system
            </div>
            <div>
              2. 🔄 Go to <a href="/minutes-lab" className="underline text-blue-600">/minutes-lab</a> to view predictions
            </div>
            <div>
              3. 🔄 Your captain/XI pages will automatically use predicted xMins
            </div>
            <div>
              4. 🔄 Set up Convex cron job for weekly auto-updates
            </div>
            <div>
              5. 🚀 (Optional) Deploy Python FastAPI service for ML predictions
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
