"use client";

import { useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  const [syncStatus, setSyncStatus] = useState("");
  const [contextStatus, setContextStatus] = useState("");
  const [fixtureStatus, setFixtureStatus] = useState("");
  const [predictionStatus, setPredictionStatus] = useState("");
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [nextGameweek, setNextGameweek] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);

  const syncPlayers = useAction(api.dataIngestion.syncPlayers);
  const syncGameweekContext = useAction(api.dataIngestion.syncGameweekContext);
  const syncFixtures = useAction(api.fixtures.syncFixtures);
  const generateAllPredictions = useAction(api.engines.multiWeekPredictor.generateAllPlayersMultiWeek);
  const getCurrentGW = useAction(api.utils.gameweekDetection.getCurrentGameweek);
  const getNextGW = useAction(api.utils.gameweekDetection.getNextGameweek);
  const getDeadline = useAction(api.utils.gameweekDetection.getGameweekDeadline);

  const allPlayers = useQuery(api.players.getAllPlayers);
  const settings = useQuery(api.userSettings.getSettings);
  const latestSyncs = useQuery(api.syncLogs.getLatestSyncs);

  // Fetch current gameweek on load
  useEffect(() => {
    const fetchGameweekInfo = async () => {
      try {
        const [current, next, deadlineInfo] = await Promise.all([
          getCurrentGW({}),
          getNextGW({}),
          getDeadline({}),
        ]);
        setCurrentGameweek(current);
        setNextGameweek(next);
        if (deadlineInfo) {
          setDeadline(deadlineInfo.deadline);
        }
      } catch (error) {
        console.error("Failed to fetch gameweek info:", error);
      }
    };
    fetchGameweekInfo();
  }, [getCurrentGW, getNextGW, getDeadline]);

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

  const handleSyncFixtures = async () => {
    setFixtureStatus("Syncing fixtures from FPL API...");
    try {
      const result = await syncFixtures({});
      if (result.success) {
        setFixtureStatus(
          `✅ Synced fixtures successfully!\n` +
          `New: ${result.synced}, Updated: ${result.updated}, Total: ${result.total}`
        );
      } else {
        setFixtureStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setFixtureStatus(`❌ Error: ${error}`);
    }
  };

  const handleGenerateAllPredictions = async () => {
    if (currentGameweek === null) {
      setPredictionStatus("❌ Loading gameweek information, please wait...");
      return;
    }

    setPredictionStatus(
      `Generating 14-week predictions for all ${allPlayers?.length || 725} players...\n` +
      `This will take ~20-25 minutes (${(allPlayers?.length || 725) * 14} total predictions).`
    );
    try {
      const result = await generateAllPredictions({
        currentGameweek: currentGameweek,
        horizonWeeks: 14,
        batchSize: 10
      });

      if (result.success) {
        setPredictionStatus(
          `✅ ${result.message}\n` +
          `Generated: ${result.generated} players × 14 weeks = ${result.totalPredictions || result.generated * 14} predictions\n` +
          `Skipped: ${result.skipped}, Failed: ${result.failed}`
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
        <h1 className="text-3xl font-bold mb-2">Admin & System Status</h1>
        <p className="text-muted-foreground">
          Monitor the automated xMins prediction system and manually trigger data syncs if needed
        </p>
      </div>

      <div className="grid gap-6">
        {/* Gameweek Info */}
        <Card>
          <CardHeader>
            <CardTitle>Current Gameweek Information</CardTitle>
            <CardDescription>
              Automatically detected from FPL Official API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">Current Gameweek</div>
                <div className="text-2xl font-bold">
                  {currentGameweek !== null ? `GW ${currentGameweek}` : "Loading..."}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Next Gameweek</div>
                <div className="text-2xl font-bold">
                  {nextGameweek !== null ? `GW ${nextGameweek}` : "Loading..."}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Next Deadline</div>
                <div className="text-sm font-mono">
                  {deadline ? new Date(deadline).toLocaleString() : "Loading..."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual Sync Section */}
        <Card>
          <CardHeader>
            <CardTitle>Manual Data Sync</CardTitle>
            <CardDescription>
              These operations run automatically via cron jobs, but you can trigger them manually if needed
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

            <div className="flex items-center gap-4 mt-4">
              <Button onClick={handleSyncContext}>
                Sync Gameweek Context
              </Button>
            </div>
            {contextStatus && (
              <div className="text-sm">
                {contextStatus}
              </div>
            )}

            <div className="flex items-center gap-4 mt-4">
              <Button onClick={handleSyncFixtures} className="bg-purple-600 hover:bg-purple-700">
                Sync Fixtures with FDR
              </Button>
              <Badge variant="outline">
                Populates fixture difficulty ratings (1-5)
              </Badge>
            </div>
            {fixtureStatus && (
              <div className="text-sm whitespace-pre-line">
                {fixtureStatus}
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleGenerateAllPredictions}
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Generate 14-Week Predictions for ALL Players
                </Button>
                {allPlayers && currentGameweek && (
                  <Badge variant="secondary">
                    {allPlayers.length} players × 14 weeks (GW{currentGameweek + 1}-{currentGameweek + 14})
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                This will generate xMins predictions for all 725 players for the next 14 gameweeks.
                Includes injury return timelines, gradual recovery curves, and confidence decay.
                Estimated time: ~20-25 minutes (10,150 total predictions).
              </div>
              {predictionStatus && (
                <div className="text-sm mt-2 whitespace-pre-line">
                  {predictionStatus}
                </div>
              )}
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

        {/* Last Sync Times */}
        <Card>
          <CardHeader>
            <CardTitle>Last Sync Times</CardTitle>
            <CardDescription>
              Track when automated jobs last ran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              {latestSyncs?.map((sync: any) => {
                const lastSync = sync.lastSync;
                const timeSince = lastSync
                  ? Math.round((Date.now() - lastSync.timestamp) / (1000 * 60))
                  : null;

                return (
                  <div key={sync.syncType} className="flex justify-between items-center">
                    <div>
                      <div className="font-medium capitalize">
                        {sync.syncType === "pre-deadline"
                          ? "Pre-Deadline Refresh"
                          : `${sync.syncType.charAt(0).toUpperCase() + sync.syncType.slice(1)} Sync`}
                      </div>
                      {lastSync && (
                        <div className="text-xs text-muted-foreground">
                          {timeSince !== null && timeSince < 60
                            ? `${timeSince} minutes ago`
                            : timeSince !== null && timeSince < 1440
                            ? `${Math.round(timeSince / 60)} hours ago`
                            : timeSince !== null
                            ? `${Math.round(timeSince / 1440)} days ago`
                            : "Never"}
                        </div>
                      )}
                    </div>
                    {lastSync ? (
                      <Badge
                        variant={lastSync.status === "success" ? "default" : "destructive"}
                        className={lastSync.status === "success" ? "bg-green-600" : ""}
                      >
                        {lastSync.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Never Run</Badge>
                    )}
                  </div>
                );
              })}
              {!latestSyncs || latestSyncs.length === 0 && (
                <div className="text-muted-foreground text-center py-4">
                  No sync history yet. Cron jobs will start running automatically.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Automation Status */}
        <Card>
          <CardHeader>
            <CardTitle>Automation Status</CardTitle>
            <CardDescription>
              The system runs automatically - no weekly maintenance required
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Badge variant="default" className="mt-0.5">AUTO</Badge>
              <div>
                <div className="font-medium">Daily Player Sync</div>
                <div className="text-muted-foreground">
                  Runs every day at 2:00 AM UTC - updates prices, injuries, news
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="default" className="mt-0.5">AUTO</Badge>
              <div>
                <div className="font-medium">Daily Fixture Sync</div>
                <div className="text-muted-foreground">
                  Runs every day at 2:15 AM UTC - tracks postponements, reschedules
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="default" className="mt-0.5">AUTO</Badge>
              <div>
                <div className="font-medium">14-Week Prediction Generation</div>
                <div className="text-muted-foreground">
                  Runs every Saturday at 6:00 AM UTC - regenerates 14-week xMins for all 725 players with injury timelines and recovery curves
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="default" className="mt-0.5 bg-green-600">LIVE</Badge>
              <div>
                <div className="font-medium">Pre-Deadline Refresh</div>
                <div className="text-muted-foreground">
                  Runs every Friday at 12:00 PM UTC - captures last-minute team news 6.5 hours before deadline
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              📊 <a href="/minutes-lab" className="underline text-blue-600 hover:text-blue-800">/minutes-lab</a> - View xMins predictions for all 725 players
            </div>
            <div>
              ⚽ <a href="/captain" className="underline text-blue-600 hover:text-blue-800">/captain</a> - Optimize captain selection with EO shields
            </div>
            <div>
              🎯 <a href="/xi" className="underline text-blue-600 hover:text-blue-800">/xi</a> - Optimize starting XI with bench probabilities
            </div>
            <div>
              ⚙️ <a href="/settings" className="underline text-blue-600 hover:text-blue-800">/settings</a> - Configure risk tolerance and model parameters
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
