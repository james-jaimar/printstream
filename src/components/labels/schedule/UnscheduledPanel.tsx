/**
 * Unscheduled Panel for Label Schedule Board
 * Groups orders by material for easy identification
 */

import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { DraggableOrderCard } from './ScheduleOrderCard';
import { getSubstrateColor } from '@/hooks/labels/useLabelSchedule';
import type { UnscheduledOrderGroup } from '@/hooks/labels/useLabelSchedule';

interface UnscheduledPanelProps {
  orders: UnscheduledOrderGroup[];
  onOrderClick?: (order: UnscheduledOrderGroup) => void;
}

export function UnscheduledPanel({ orders, onOrderClick }: UnscheduledPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled',
    data: { type: 'unscheduled' },
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group by material_key
  const materialGroups = useMemo(() => {
    const groups = new Map<string, { orders: UnscheduledOrderGroup[]; substrateType: string | null }>();
    for (const order of orders) {
      const key = order.material_key;
      if (!groups.has(key)) {
        groups.set(key, { orders: [], substrateType: order.substrate_type });
      }
      groups.get(key)!.orders.push(order);
    }
    return groups;
  }, [orders]);

  const sortedKeys = Array.from(materialGroups.keys()).sort();

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] border-r">
      <div className="p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-semibold">Unscheduled</p>
            <p className="text-xs text-muted-foreground">
              {orders.length} order{orders.length !== 1 ? 's' : ''} pending
            </p>
          </div>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 p-2 space-y-2 overflow-y-auto bg-background',
          isOver && 'bg-primary/10 ring-2 ring-primary ring-inset'
        )}
      >
        <SortableContext
          items={orders.map(o => `unscheduled-${o.order_id}`)}
          strategy={verticalListSortingStrategy}
        >
          {sortedKeys.map((materialKey) => {
            const group = materialGroups.get(materialKey)!;
            const isCollapsed = collapsedGroups.has(materialKey);
            const colorClass = getSubstrateColor(group.substrateType);
            const abbreviatedKey = materialKey
              .replace('Hot Melt', 'HM')
              .replace('Acrylic', 'Acr')
              .replace('Semi Gloss', 'SG');

            return (
              <div key={materialKey}>
                <button
                  onClick={() => toggleGroup(materialKey)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium',
                    colorClass
                  )}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span className="truncate flex-1 text-left">{abbreviatedKey}</span>
                  <span className="text-[10px] opacity-75">{group.orders.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="mt-1 space-y-1.5 pl-1">
                    {group.orders.map((order) => (
                      <DraggableOrderCard
                        key={order.order_id}
                        id={`unscheduled-${order.order_id}`}
                        order={order}
                        onClick={() => onOrderClick?.(order)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </SortableContext>

        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center text-xs text-muted-foreground">
            <Inbox className="h-8 w-8 mb-2 opacity-50" />
            <p>All orders scheduled!</p>
          </div>
        )}
      </div>
    </div>
  );
}
