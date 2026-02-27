import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Database, RefreshCw, Loader2, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { firebirdRowsToMatrixData, type FirebirdRow } from "@/utils/firebirdDataMapper";
import { parseMatrixDataToJobs } from "@/utils/excel/matrixParser";
import { ExcelImportDebugger } from "@/utils/excel/debugger";
import { EnhancedMappingProcessor } from "@/utils/excel/enhancedMappingProcessor";
import { EnhancedJobCreator } from "@/utils/excel/enhancedJobCreator";
import { PaginatedJobCreationDialog } from "@/components/admin/upload/PaginatedJobCreationDialog";
import { finalizeProductionReadyJobs } from "@/utils/excel/enhancedParser";
import type { EnhancedJobCreationResult } from "@/utils/excel/enhancedJobCreator";
import JobPartAssignmentManager from "@/components/jobs/JobPartAssignmentManager";

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

type SyncStatus = "idle" | "queued" | "running" | "completed" | "failed";

export const QuickEasySyncPanel: React.FC = () => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{ rows: number; jobs: number; duplicates: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Paginated dialog state
  const [enhancedResult, setEnhancedResult] = useState<EnhancedJobCreationResult | null>(null);
  const [showEnhancedDialog, setShowEnhancedDialog] = useState(false);
  const [isCreatingJobs, setIsCreatingJobs] = useState(false);
  const [debugLogger] = useState(() => new ExcelImportDebugger());

  // Part assignment state
  const [showPartAssignment, setShowPartAssignment] = useState(false);
  const [partAssignmentJob, setPartAssignmentJob] = useState<{ id: string; wo_no: string } | null>(null);

  const isSyncing = syncStatus === "queued" || syncStatus === "running";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Process completed run data
  const processRunData = useCallback(async (rawData: any[]) => {
    if (!user) return;

    const firebirdRows: FirebirdRow[] = rawData || [];
    if (firebirdRows.length === 0) {
      toast.info("No orders found in the selected date range");
      setLastSyncResult({ rows: 0, jobs: 0, duplicates: 0 });
      return;
    }

    toast.info(`Fetched ${firebirdRows.length} rows from QuickEasy. Processing...`);

    const matrixData = firebirdRowsToMatrixData(firebirdRows);
    debugLogger.addDebugInfo(`Firebird sync: ${firebirdRows.length} rows, ${matrixData.detectedGroups.length} groups detected`);

    const columnMapping = {
      woNo: 0, customer: 2, reference: 4, date: 1, dueDate: -1,
      rep: -1, category: -1, location: -1, size: 5,
      specification: -1, contact: 3, qty: 11,
    };

    const jobsResult = await parseMatrixDataToJobs(matrixData, columnMapping, debugLogger);

    if (jobsResult.jobs.length === 0) {
      toast.info(`No new orders to import (${jobsResult.duplicatesSkipped} duplicates skipped)`);
      setLastSyncResult({ rows: firebirdRows.length, jobs: 0, duplicates: jobsResult.duplicatesSkipped });
      return;
    }

    const enhancedProcessor = new EnhancedMappingProcessor(debugLogger, []);
    await enhancedProcessor.initialize();

    const enhancedMappingResult = await enhancedProcessor.processJobsWithEnhancedMapping(
      jobsResult.jobs, -1, -1, matrixData.rows, {}
    );

    const jobCreator = new EnhancedJobCreator(debugLogger, user.id, true);
    await jobCreator.initialize();

    const result = await jobCreator.prepareEnhancedJobsWithExcelData(
      enhancedMappingResult.jobs, matrixData.headers, matrixData.rows,
    );

    result.duplicatesSkipped = jobsResult.duplicatesSkipped;
    result.duplicateJobs = jobsResult.duplicateJobs;

    setEnhancedResult(result);
    setShowEnhancedDialog(true);
    setLastSyncResult({
      rows: firebirdRows.length,
      jobs: jobsResult.jobs.length,
      duplicates: jobsResult.duplicatesSkipped,
    });

    const dupMsg = jobsResult.duplicatesSkipped > 0
      ? ` (${jobsResult.duplicatesSkipped} duplicates skipped)`
      : "";
    toast.success(`${jobsResult.jobs.length} orders ready for review${dupMsg}`);
  }, [user, debugLogger]);

  // Poll for run completion
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from("quickeasy_sync_runs")
        .select("status, row_count, raw_data, error, duration_ms")
        .eq("id", id)
        .single();

      if (error) {
        console.error("[QuickEasy Poll] Error:", error);
        return;
      }

      if (data.status === "completed") {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setSyncStatus("completed");
        toast.success(`QuickEasy sync completed — ${data.row_count} rows in ${((data.duration_ms || 0) / 1000).toFixed(1)}s`);
        
        // Process the data through the import pipeline
        try {
          await processRunData(data.raw_data as any[]);
        } catch (err: any) {
          console.error("[QuickEasy] Processing error:", err);
          setSyncError(`Data fetched but processing failed: ${err.message}`);
        }
      } else if (data.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setSyncStatus("failed");
        setSyncError(data.error || "Sync failed (unknown reason)");
        toast.error(`QuickEasy sync failed: ${data.error || "Unknown error"}`);
      } else if (data.status === "running" && syncStatus !== "running") {
        setSyncStatus("running");
      }
    }, 3000);
  }, [processRunData, syncStatus]);

  const handleSync = async () => {
    if (!user?.id) {
      toast.error("You must be logged in");
      return;
    }

    setSyncStatus("queued");
    setSyncError(null);
    setLastSyncResult(null);
    setElapsedSeconds(0);
    debugLogger.clear();

    // Start elapsed timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    try {
      toast.info("Starting QuickEasy sync...");
      const { data, error } = await supabase.functions.invoke("firebird-sync", {
        body: { startDate, endDate },
      });

      if (error) throw new Error(error.message || "Edge function error");
      if (!data?.success || !data?.runId) throw new Error(data?.error || "Failed to start sync");

      setRunId(data.runId);
      startPolling(data.runId);
    } catch (err: any) {
      console.error("[QuickEasy Sync] Error:", err);
      setSyncStatus("failed");
      setSyncError(err.message || "Sync failed");
      toast.error(`QuickEasy sync failed: ${err.message}`);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Single job processing for paginated dialog
  const handleSingleJobConfirm = async (
    woNo: string,
    userApprovedMappings?: Array<{ groupName: string; mappedStageId: string; mappedStageName: string; category: string }>
  ) => {
    if (!enhancedResult || !user) return;

    try {
      const singleJobResult = {
        ...enhancedResult,
        categoryAssignments: { [woNo]: enhancedResult.categoryAssignments[woNo] },
        rowMappings: { [woNo]: enhancedResult.rowMappings[woNo] || [] },
        stats: { total: 1, successful: 0, failed: 0, newCategories: 0, workflowsInitialized: 0 },
      };

      const finalResult = await finalizeProductionReadyJobs(singleJobResult, debugLogger, user.id, userApprovedMappings);

      if (finalResult.stats.successful > 0) {
        if (finalResult.createdJobs?.length > 0) {
          const createdJob = finalResult.createdJobs[0];
          setPartAssignmentJob({ id: createdJob.id, wo_no: createdJob.wo_no });
          setShowPartAssignment(true);
        }
      } else {
        throw new Error(finalResult.failedJobs[0]?.error || "Unknown error");
      }
    } catch (error) {
      console.error(`Error processing job ${woNo}:`, error);
      throw error;
    }
  };

  const handlePaginatedComplete = () => {
    setEnhancedResult(null);
    setShowEnhancedDialog(false);
    toast.success("QuickEasy import completed!");
  };

  const formatElapsed = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            QuickEasy Live Sync
          </CardTitle>
          <CardDescription>
            Pull digital production orders directly from QuickEasy via SP_DIGITAL_PRODUCTION.
            Auto-syncs hourly during business hours. Use the manual button below to sync on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="sync-start">Start Date</Label>
              <Input
                id="sync-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sync-end">End Date</Label>
              <Input
                id="sync-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {syncStatus === "queued" ? "Starting..." : "Syncing..."}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Fetch from QuickEasy
                </>
              )}
            </Button>
          </div>

          {/* Running status indicator */}
          {isSyncing && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted text-sm">
              <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />
              <span>
                {syncStatus === "queued" ? "Queued — connecting to QuickEasy..." : "Fetching data from QuickEasy..."}
              </span>
              <Badge variant="outline">{formatElapsed(elapsedSeconds)}</Badge>
            </div>
          )}

          {syncError && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{syncError}</span>
            </div>
          )}

          {lastSyncResult && (
            <div className="flex items-center gap-3 text-sm">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>
                {lastSyncResult.rows} rows fetched → {lastSyncResult.jobs} new orders
              </span>
              {lastSyncResult.duplicates > 0 && (
                <Badge variant="secondary">{lastSyncResult.duplicates} duplicates skipped</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reuse the same PaginatedJobCreationDialog */}
      <PaginatedJobCreationDialog
        open={showEnhancedDialog}
        onOpenChange={setShowEnhancedDialog}
        result={enhancedResult}
        isProcessing={isCreatingJobs}
        onSingleJobConfirm={handleSingleJobConfirm}
        onComplete={handlePaginatedComplete}
      />

      {/* Part Assignment Modal */}
      {partAssignmentJob && (
        <JobPartAssignmentManager
          jobId={partAssignmentJob.id}
          jobTableName="production_jobs"
          open={showPartAssignment}
          onClose={() => {
            setShowPartAssignment(false);
            setPartAssignmentJob(null);
          }}
        />
      )}
    </>
  );
};
