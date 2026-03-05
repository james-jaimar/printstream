import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HeartPulse, Trash2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ScheduleHealth {
  ghost_slots: number;
  orphan_slots: number;
  total_slots: number;
  healthy_slots: number;
  checked_at: string;
}

export function ScheduleHealthCard() {
  const [health, setHealth] = useState<ScheduleHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_schedule_health");
      if (error) throw error;
      setHealth(data as unknown as ScheduleHealth);
    } catch (e: any) {
      console.error("Failed to fetch schedule health:", e);
      toast.error("Failed to check schedule health");
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      const { data, error } = await supabase.rpc("purge_ghost_slots");
      if (error) throw error;
      toast.success(`Purged ${data} ghost/orphan slots`);
      await fetchHealth();
    } catch (e: any) {
      console.error("Purge failed:", e);
      toast.error(`Purge failed: ${e.message}`);
    } finally {
      setPurging(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const hasIssues = health && (health.ghost_slots > 0 || health.orphan_slots > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5" />
          Schedule Health
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !health ? (
          <p className="text-sm text-muted-foreground">Checking schedule integrity…</p>
        ) : health ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Total Slots" value={health.total_slots} />
              <StatBox label="Healthy" value={health.healthy_slots} variant="good" />
              <StatBox
                label="Ghost Slots"
                value={health.ghost_slots}
                variant={health.ghost_slots > 0 ? "bad" : "good"}
                tooltip="Slots linked to completed stages — blocking resources"
              />
              <StatBox
                label="Orphan Slots"
                value={health.orphan_slots}
                variant={health.orphan_slots > 0 ? "bad" : "good"}
                tooltip="Slots with no matching stage instance"
              />
            </div>

            {hasIssues ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">
                  {health.ghost_slots + health.orphan_slots} problematic slot(s) detected — these may be pushing jobs into the future.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="ml-auto shrink-0" disabled={purging}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Purge Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Purge ghost & orphan slots?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete {health.ghost_slots + health.orphan_slots} problematic time slots.
                        After purging, you should reschedule from the Schedule Board to recalculate resource timelines.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handlePurge}>Purge</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/20">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <p className="text-sm text-primary">Schedule is healthy — no ghost or orphan slots detected.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Auto-sweep runs every 6 hours. Last checked: {new Date(health.checked_at).toLocaleString()}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  variant = "neutral",
  tooltip,
}: {
  label: string;
  value: number;
  variant?: "good" | "bad" | "neutral";
  tooltip?: string;
}) {
  const colorClass =
    variant === "good"
      ? "text-primary"
      : variant === "bad"
      ? "text-destructive"
      : "text-foreground";

  return (
    <div className="rounded-md border p-3 text-center" title={tooltip}>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
