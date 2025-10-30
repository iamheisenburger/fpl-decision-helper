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
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [nextGameweek, setNextGameweek] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);

  const syncPlayers = useAction(api.dataIngestion.syncPlayers);
  const syncGameweekContext = useAction(api.dataIngestion.syncGameweekContext);
  const getCurrentGW = useAction(api.utils.gameweekDetection.getCurrentGameweek);
  const getNextGW = useAction(api.utils.gameweekDetection.getNextGameweek);
  const getDeadline = useAction(api.utils.gameweekDetection.getGameweekDeadline);

  const allPlayers = useQuery(api.players.getAllPlayers);
  const settings = useQuery(api.userSettings.getSettings);

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
                <div className="font-medium">Weekly Prediction Generation</div>
                <div className="text-muted-foreground">
                  Runs every Saturday at 6:00 AM UTC - regenerates xMins for all 725 players
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">PENDING</Badge>
              <div>
                <div className="font-medium">Cron Jobs Deployment</div>
                <div className="text-muted-foreground">
                  Will be activated in Phase 2E (next session)
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
