/**
 * Hook for importing label orders from Quickeasy Excel files
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { parseLabelExcelFile, importLabelOrders, type LabelImportOptions, type LabelImportStats } from '@/utils/labels';
import { ExcelImportDebugger } from '@/utils/excel/debugger';

interface UseLabelImportReturn {
  importing: boolean;
  stats: LabelImportStats | null;
  importFile: (file: File, options?: LabelImportOptions) => Promise<boolean>;
  reset: () => void;
}

export function useLabelImport(): UseLabelImportReturn {
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<LabelImportStats | null>(null);
  const queryClient = useQueryClient();
  
  const importFile = useCallback(async (
    file: File, 
    options: LabelImportOptions = {}
  ): Promise<boolean> => {
    setImporting(true);
    setStats(null);
    
    const logger = new ExcelImportDebugger(options.verbose);
    
    try {
      // Parse the Excel file
      const parsedData = await parseLabelExcelFile(file, logger);
      
      if (parsedData.orders.length === 0) {
        toast.error('No valid label orders found in file');
        setStats(parsedData.stats);
        return false;
      }
      
      // Import to database
      const result = await importLabelOrders(parsedData, options);
      
      setStats(result.stats);
      
      if (result.success) {
        toast.success(
          `Imported ${result.stats.ordersCreated} orders with ${result.stats.itemsCreated} items`
        );
        
        // Invalidate label queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['label-orders'] });
        queryClient.invalidateQueries({ queryKey: ['label-items'] });
        
        return true;
      } else {
        toast.error(`Import completed with errors: ${result.errors[0]}`);
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      toast.error(message);
      
      setStats({
        totalRows: 0,
        ordersCreated: 0,
        itemsCreated: 0,
        skippedRows: 0,
        errors: [message],
        warnings: [],
        matchedDielines: 0,
        matchedSubstrates: 0
      });
      
      return false;
    } finally {
      setImporting(false);
      logger.flushBatchedMessages();
    }
  }, [queryClient]);
  
  const reset = useCallback(() => {
    setStats(null);
  }, []);
  
  return { importing, stats, importFile, reset };
}
