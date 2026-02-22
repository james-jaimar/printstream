/**
 * Hook for preparing artwork for production
 * Handles cropping, marking as ready, and validation
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CropAmountMm } from '@/types/labels';

type PrepareAction = 'crop' | 'mark_ready' | 'validate' | 'use_proof_as_print' | 'crop_to_bleed';

interface PrepareResult {
  success: boolean;
  item_id: string;
  action: string;
  print_pdf_url?: string;
  print_pdf_status?: string;
  message?: string;
  error?: string;
}

interface UsePrepareArtworkReturn {
  prepareItem: (itemId: string, action: PrepareAction, cropMm?: CropAmountMm) => Promise<PrepareResult>;
  prepareBulk: (items: { id: string; action: PrepareAction; cropMm?: CropAmountMm }[]) => Promise<PrepareResult[]>;
  isProcessing: boolean;
  processingItemIds: string[];
}

export function usePrepareArtwork(orderId: string): UsePrepareArtworkReturn {
  const [processingItemIds, setProcessingItemIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const isProcessing = processingItemIds.length > 0;

  const prepareItem = useCallback(async (
    itemId: string,
    action: PrepareAction,
    cropMm?: CropAmountMm
  ): Promise<PrepareResult> => {
    setProcessingItemIds(prev => [...prev, itemId]);

    try {
      const { data, error } = await supabase.functions.invoke('label-prepare-artwork', {
        body: {
          item_id: itemId,
          action,
          crop_mm: cropMm,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Preparation failed');
      }

      // Invalidate queries to refresh item data
      queryClient.invalidateQueries({ queryKey: ['label-items', orderId] });

      toast.success(data.message || `Artwork ${action} completed`);
      return data as PrepareResult;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to prepare artwork';
      toast.error(errorMessage);
      return {
        success: false,
        item_id: itemId,
        action,
        error: errorMessage,
      };
    } finally {
      setProcessingItemIds(prev => prev.filter(id => id !== itemId));
    }
  }, [orderId, queryClient]);

  const prepareBulk = useCallback(async (
    items: { id: string; action: PrepareAction; cropMm?: CropAmountMm }[]
  ): Promise<PrepareResult[]> => {
    const itemIds = items.map(i => i.id);
    setProcessingItemIds(prev => [...prev, ...itemIds]);

    try {
      const results = await Promise.allSettled(
        items.map(item => prepareItem(item.id, item.action, item.cropMm))
      );

      const prepareResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        return {
          success: false,
          item_id: items[index].id,
          action: items[index].action,
          error: result.reason?.message || 'Unknown error',
        };
      });

      const successCount = prepareResults.filter(r => r.success).length;
      const failCount = prepareResults.length - successCount;

      if (failCount === 0) {
        toast.success(`All ${successCount} items prepared successfully`);
      } else if (successCount > 0) {
        toast.warning(`${successCount} succeeded, ${failCount} failed`);
      } else {
        toast.error(`All ${failCount} items failed to prepare`);
      }

      return prepareResults;
    } finally {
      setProcessingItemIds(prev => prev.filter(id => !itemIds.includes(id)));
    }
  }, [prepareItem]);

  return {
    prepareItem,
    prepareBulk,
    isProcessing,
    processingItemIds,
  };
}
