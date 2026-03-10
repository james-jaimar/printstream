import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { backfillPaperSpecifications } from '@/utils/backfillPaperSpecifications';

export default function BackfillPaperSpecs() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    total: number;
    processed: number;
    failed: number;
    skipped: number;
    unmapped: number;
    unmappedKeys: string[];
    errors: Array<{ jobId: string; woNo: string; error: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceResolve, setForceResolve] = useState(false);

  const handleRunBackfill = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      const backfillResults = await backfillPaperSpecifications({ forceResolve });
      setResults(backfillResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Backfill Paper Specifications</CardTitle>
          <CardDescription>
            This utility will populate the job_print_specifications table with paper type and weight
            data from production jobs that have specifications stored in JSONB format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This will scan all production jobs with paper_specifications JSONB data and insert
              missing entries into the job_print_specifications table. Jobs that already have
              paper specs in the table will be skipped.
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleRunBackfill} 
            disabled={isRunning}
            className="w-full"
          >
            {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isRunning ? 'Running Backfill...' : 'Run Backfill Now'}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {results && (
            <Card className="bg-muted">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Backfill Complete
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold">Total Jobs:</span> {results.total}
                  </div>
                  <div>
                    <span className="font-semibold text-green-600">Processed:</span> {results.processed}
                  </div>
                  <div>
                    <span className="font-semibold text-blue-600">Skipped:</span> {results.skipped}
                  </div>
                  <div>
                    <span className="font-semibold text-red-600">Failed:</span> {results.failed}
                  </div>
                  <div>
                    <span className="font-semibold text-amber-600">Unmapped:</span> {results.unmapped}
                  </div>
                </div>

                {results.unmappedKeys && results.unmappedKeys.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Unmapped Paper Keys:</h4>
                    <div className="space-y-1 text-xs max-h-60 overflow-y-auto">
                      {results.unmappedKeys.map((key, idx) => (
                        <div key={idx} className="p-2 bg-amber-50 rounded font-mono text-amber-900">
                          {key}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-sm mb-2">Errors:</h4>
                    <div className="space-y-1 text-xs max-h-60 overflow-y-auto">
                      {results.errors.map((err, idx) => (
                        <div key={idx} className="p-2 bg-destructive/10 rounded">
                          <span className="font-mono">{err.woNo}:</span> {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
