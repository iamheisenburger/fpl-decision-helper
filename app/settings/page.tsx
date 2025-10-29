"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const settings = useQuery(api.userSettings.getSettings);
  const upsertSettings = useMutation(api.userSettings.upsertSettings);
  const resetSettings = useMutation(api.userSettings.resetSettings);

  const [formData, setFormData] = useState({
    captaincyEoRate: 0.1,
    captaincyEoCap: 1.0,
    xiEoRate: 0.1,
    xiEoCap: 1.0,
    rminsWeight: 1.0,
    xMinsThreshold: 70,
    xMinsPenalty: 0.3,
    weeklyBleedBudget: 0.8,
    defaultHoldLength: 8,
    transferGainThreshold: 0.5,
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (settings) {
      setFormData({
        captaincyEoRate: settings.captaincyEoRate,
        captaincyEoCap: settings.captaincyEoCap,
        xiEoRate: settings.xiEoRate,
        xiEoCap: settings.xiEoCap,
        rminsWeight: settings.rminsWeight,
        xMinsThreshold: settings.xMinsThreshold,
        xMinsPenalty: settings.xMinsPenalty,
        weeklyBleedBudget: settings.weeklyBleedBudget,
        defaultHoldLength: settings.defaultHoldLength,
        transferGainThreshold: settings.transferGainThreshold,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      await upsertSettings(formData);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveStatus("idle");
    }
  };

  const handleReset = async () => {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      await resetSettings();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Risk Profile Settings</h1>
        <p className="text-muted-foreground">
          Configure your EO tolerance, rMins weighting, and bleed budget to match your risk profile.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Captaincy Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Captaincy Settings</CardTitle>
            <CardDescription>
              EO tolerance for captaincy decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="captaincyEoRate">
                EO Rate (EV per 10% EO)
              </Label>
              <Input
                id="captaincyEoRate"
                type="number"
                step="0.01"
                value={formData.captaincyEoRate}
                onChange={(e) =>
                  setFormData({ ...formData, captaincyEoRate: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 0.1 (treat every 10% EO gap as 0.1 EV tolerance)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="captaincyEoCap">
                EO Tolerance Cap (EV)
              </Label>
              <Input
                id="captaincyEoCap"
                type="number"
                step="0.1"
                value={formData.captaincyEoCap}
                onChange={(e) =>
                  setFormData({ ...formData, captaincyEoCap: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 1.0 (maximum tolerance cap)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* XI Settings */}
        <Card>
          <CardHeader>
            <CardTitle>XI Selection Settings</CardTitle>
            <CardDescription>
              EO tolerance for XI decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="xiEoRate">
                EO Rate (EV per 15% EO)
              </Label>
              <Input
                id="xiEoRate"
                type="number"
                step="0.01"
                value={formData.xiEoRate}
                onChange={(e) =>
                  setFormData({ ...formData, xiEoRate: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 0.1 (treat every 15% EO gap as 0.1 EV tolerance)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="xiEoCap">
                EO Tolerance Cap (EV)
              </Label>
              <Input
                id="xiEoCap"
                type="number"
                step="0.1"
                value={formData.xiEoCap}
                onChange={(e) =>
                  setFormData({ ...formData, xiEoCap: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 1.0 (maximum tolerance cap)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* rMins Settings */}
        <Card>
          <CardHeader>
            <CardTitle>rMins (Realized Minutes) Settings</CardTitle>
            <CardDescription>
              Weight for EV95 upside surcharge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rminsWeight">
                rMins Weight
              </Label>
              <Input
                id="rminsWeight"
                type="number"
                step="0.1"
                value={formData.rminsWeight}
                onChange={(e) =>
                  setFormData({ ...formData, rminsWeight: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 1.0 (ceiling weight for EV95×P90 calculations - 1.0 = full expected value)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* xMins Penalty Settings */}
        <Card>
          <CardHeader>
            <CardTitle>xMins Penalty Settings</CardTitle>
            <CardDescription>
              Penalty for players with risky minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="xMinsThreshold">
                xMins Threshold (minutes)
              </Label>
              <Input
                id="xMinsThreshold"
                type="number"
                value={formData.xMinsThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, xMinsThreshold: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 70 (players below this get penalized)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="xMinsPenalty">
                xMins Penalty (EV)
              </Label>
              <Input
                id="xMinsPenalty"
                type="number"
                step="0.1"
                value={formData.xMinsPenalty}
                onChange={(e) =>
                  setFormData({ ...formData, xMinsPenalty: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 0.3 (EV penalty for risky minutes)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bleed Budget */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Bleed Budget</CardTitle>
            <CardDescription>
              Maximum EV you're willing to bleed per week
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weeklyBleedBudget">
                Weekly Bleed Budget (EV)
              </Label>
              <Input
                id="weeklyBleedBudget"
                type="number"
                step="0.1"
                value={formData.weeklyBleedBudget}
                onChange={(e) =>
                  setFormData({ ...formData, weeklyBleedBudget: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 0.8 (total across captaincy, XI, and transfers)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Transfer Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Transfer Settings</CardTitle>
            <CardDescription>
              Default hold length and gain threshold
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultHoldLength">
                Default Hold Length (weeks)
              </Label>
              <Input
                id="defaultHoldLength"
                type="number"
                value={formData.defaultHoldLength}
                onChange={(e) =>
                  setFormData({ ...formData, defaultHoldLength: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 8 (weeks to project NetGain)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transferGainThreshold">
                Transfer Gain Threshold (EV)
              </Label>
              <Input
                id="transferGainThreshold"
                type="number"
                step="0.1"
                value={formData.transferGainThreshold}
                onChange={(e) =>
                  setFormData({ ...formData, transferGainThreshold: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: 0.5 (minimum NetGain to recommend transfer)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
