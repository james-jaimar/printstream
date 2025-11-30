import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatWONumber } from "@/utils/woNumberFormatter";

interface AdvanceResult {
  woNo: string;
  success: boolean;
  error?: string;
  stagesUpdated?: number;
}

interface BulkAdvanceResponse {
  processed: number;
  failed: number;
  total: number;
  results: AdvanceResult[];
  message: string;
}

interface ProductionStage {
  id: string;
  name: string;
  order_index: number;
}

const TrackerBulkAdvance = () => {
  const [orderList, setOrderList] = useState("");
  const [targetStage, setTargetStage] = useState("");
  const [advanceMode, setAdvanceMode] = useState<"to" | "through">("to");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentJob, setCurrentJob] = useState("");
  const [results, setResults] = useState<BulkAdvanceResponse | null>(null);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [isLoadingStages, setIsLoadingStages] = useState(true);

  // Fetch post-proof stages (order_index >= 3)
  useEffect(() => {
    const fetchStages = async () => {
      try {
        const { data, error } = await supabase
          .from('production_stages')
          .select('id, name, order_index')
          .eq('is_active', true)
          .gte('order_index', 3) // Only post-proof stages
          .order('order_index', { ascending: true });

        if (error) throw error;
        setStages(data || []);
      } catch (error) {
        console.error("Error fetching stages:", error);
        toast.error("Failed to load production stages");
      } finally {
        setIsLoadingStages(false);
      }
    };

    fetchStages();
  }, []);

  const parseOrderList = (input: string): string[] => {
    const orders = input
      .split(/[\n,\s]+/)
      .map(order => order.trim())
      .filter(order => order.length > 0)
      .map(order => formatWONumber(order))
      .filter(order => order.length > 0);
    
    return [...new Set(orders)];
  };

  const handleBulkAdvance = async () => {
    const orders = parseOrderList(orderList);
    
    if (orders.length === 0) {
      toast.error("Please enter at least one order number");
      return;
    }

    if (orders.length > 200) {
      toast.error("Maximum 200 jobs per batch. Please reduce the list.");
      return;
    }

    if (!targetStage) {
      toast.error("Please select a target stage");
      return;
    }

    const selectedStage = stages.find(s => s.id === targetStage);
    if (!selectedStage) {
      toast.error("Invalid stage selected");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults(null);
    setCurrentJob(orders[0]);

    try {
      console.log("🚀 Starting bulk advance:", {
        orderNumbers: orders,
        targetStageName: selectedStage.name,
        advanceMode,
      });
      
      const { data, error } = await supabase.functions.invoke('bulk-advance-stages', {
        body: {
          orderNumbers: orders,
          targetStageName: selectedStage.name,
          advanceMode,
        }
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error(`Failed to process jobs: ${error.message}`);
        return;
      }

      console.log("✅ Bulk advance response:", data);
      
      setResults(data as BulkAdvanceResponse);
      setProgress(100);
      
      if (data.failed === 0) {
        toast.success(`Successfully processed all ${data.processed} jobs!`);
      } else {
        toast.warning(`Processed ${data.processed} jobs. ${data.failed} failed.`);
      }

    } catch (error) {
      console.error("Bulk advance error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
      setCurrentJob("");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Advance to Stage</h1>
        <p className="text-muted-foreground mt-2">
          Quickly advance multiple orders to a specific production stage for go-live setup
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          This tool will NOT modify DTP or PROOF stages. It only updates post-proof production stages
          (Batch Allocation, Printing, Finishing, etc.)
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Order Selection & Target Stage</CardTitle>
          <CardDescription>
            Paste order numbers and select which stage to advance them to
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Order List */}
          <div className="space-y-2">
            <Label htmlFor="order-list">Order Numbers</Label>
            <Textarea
              id="order-list"
              placeholder="Paste order numbers here (one per line or comma-separated)&#10;Examples:&#10;428300&#10;D428301&#10;428302, 428303&#10;D428304"
              value={orderList}
              onChange={(e) => setOrderList(e.target.value)}
              disabled={isProcessing}
              className="min-h-[200px] font-mono"
            />
            <p className="text-sm text-muted-foreground">
              You can include or omit the 'D' prefix. Maximum 200 orders per batch.
            </p>
          </div>

          {/* Target Stage Selection */}
          <div className="space-y-2">
            <Label htmlFor="target-stage">Target Stage</Label>
            <Select
              value={targetStage}
              onValueChange={setTargetStage}
              disabled={isProcessing || isLoadingStages}
            >
              <SelectTrigger id="target-stage">
                <SelectValue placeholder="Select production stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Only post-proof stages are shown (DTP and PROOF are protected)
            </p>
          </div>

          {/* Advance Mode */}
          <div className="space-y-3">
            <Label>Advance Mode</Label>
            <RadioGroup
              value={advanceMode}
              onValueChange={(value) => setAdvanceMode(value as "to" | "through")}
              disabled={isProcessing}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="to" id="mode-to" />
                <Label htmlFor="mode-to" className="cursor-pointer font-normal">
                  <span className="font-semibold">Advance TO stage</span> - Mark previous stages as completed, set target stage as active
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="through" id="mode-through" />
                <Label htmlFor="mode-through" className="cursor-pointer font-normal">
                  <span className="font-semibold">Advance THROUGH stage</span> - Mark all stages including target as completed
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Process Button */}
          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={handleBulkAdvance}
              disabled={isProcessing || !orderList.trim() || !targetStage}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Start Bulk Advance"
              )}
            </Button>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Processing {currentJob}...</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                This may take several minutes. Each job is processed with a 3-second delay.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>{results.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.processed}</p>
                    <p className="text-sm text-muted-foreground">Processed</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.failed}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{results.total}</p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>

              {results.failed > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Failed Jobs:</h4>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {results.results
                      .filter((r) => !r.success)
                      .map((result) => (
                        <div
                          key={result.woNo}
                          className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded text-sm"
                        >
                          <span className="font-medium">{result.woNo}</span>
                          <span className="text-red-600 dark:text-red-400">
                            {result.error || "Unknown error"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {results.processed > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Successful Jobs:</h4>
                  <div className="max-h-60 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {results.results
                        .filter((r) => r.success)
                        .map((result) => (
                          <div
                            key={result.woNo}
                            className="px-2 py-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 rounded text-sm"
                          >
                            {result.woNo}
                            {result.stagesUpdated !== undefined && (
                              <span className="ml-1 text-xs opacity-70">
                                ({result.stagesUpdated} stages)
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TrackerBulkAdvance;
