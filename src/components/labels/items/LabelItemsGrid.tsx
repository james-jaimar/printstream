import { LabelItemCard } from './LabelItemCard';
import { useUpdateLabelItem, useDeleteLabelItem } from '@/hooks/labels/useLabelItems';
import type { LabelItem } from '@/types/labels';

interface ItemAnalysis {
  validation?: {
    status: string;
    issues: string[];
  };
  thumbnail_url?: string;
}

interface LabelItemsGridProps {
  items: LabelItem[];
  orderId: string;
  itemAnalyses?: Record<string, ItemAnalysis>;
}

export function LabelItemsGrid({ items, orderId, itemAnalyses = {} }: LabelItemsGridProps) {
  const updateItem = useUpdateLabelItem();
  const deleteItem = useDeleteLabelItem();

  if (items.length === 0) {
    return null;
  }

  const handleQuantityChange = (itemId: string, quantity: number) => {
    updateItem.mutate({
      id: itemId,
      updates: { quantity },
    });
  };

  const handleNameChange = (itemId: string, name: string) => {
    updateItem.mutate({
      id: itemId,
      updates: { name },
    });
  };

  const handleDelete = (itemId: string) => {
    deleteItem.mutate({ id: itemId, orderId });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => {
        const analysis = itemAnalyses[item.id];
        const validationStatus = analysis?.validation?.status as 
          'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop' | 'pending' | undefined;
        
        return (
          <LabelItemCard
            key={item.id}
            item={item}
            onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
            onDelete={() => handleDelete(item.id)}
            onNameChange={(name) => handleNameChange(item.id, name)}
            validationStatus={validationStatus || 'pending'}
            validationIssues={analysis?.validation?.issues || []}
            thumbnailUrl={analysis?.thumbnail_url || item.artwork_thumbnail_url || undefined}
          />
        );
      })}
    </div>
  );
}
