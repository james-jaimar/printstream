import { useLabelStages } from '@/hooks/labels/useLabelStages';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';

const SERVICE_DEFINITIONS = [
  { type: 'rewinding', label: 'Rewinding', description: 'Rewind labels onto specified core sizes', stage_name: 'Rewinding', icon: '🔄' },
  { type: 'joining', label: 'Joining Rolls', description: 'Join multiple rolls into one continuous roll', stage_name: 'Joining Rolls', icon: '🔗' },
  { type: 'handwork', label: 'Handwork', description: 'Manual label application, sorting, or inspection', stage_name: 'Handwork', icon: '🖐' },
  { type: 'qa', label: 'Quality Inspection', description: 'QA check of colour accuracy and print quality', stage_name: 'Quality Inspection', icon: '✅' },
  { type: 'packaging', label: 'Labelling & Boxing', description: 'Box, label, and prepare finished product', stage_name: 'Labelling & Boxing', icon: '📦' },
  { type: 'delivery', label: 'Delivery / Collection', description: 'Courier, local delivery, or collection from premises', stage_name: null, icon: '🚚' },
];

export function LabelServicesManagement() {
  const { data: stages, isLoading } = useLabelStages();

  if (isLoading) return <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Services Configuration</h3>
        <p className="text-xs text-muted-foreground">These service types can be added as quoted line items to any label order. Each service links to a production stage for tracking.</p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {SERVICE_DEFINITIONS.map((svc, i) => {
          const linkedStage = svc.stage_name
            ? stages?.find(s => s.name === svc.stage_name)
            : null;

          return (
            <div
              key={svc.type}
              className={`flex items-center gap-4 px-4 py-3 ${i < SERVICE_DEFINITIONS.length - 1 ? 'border-b' : ''} bg-card`}
            >
              <span className="text-2xl shrink-0">{svc.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{svc.label}</span>
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5">{svc.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{svc.description}</p>
              </div>
              <div className="shrink-0 text-right">
                {linkedStage ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: linkedStage.color }} />
                    <span className="text-xs text-muted-foreground">→ {linkedStage.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Info className="h-3 w-3" />
                    Multiple stages
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">How services work:</p>
        <p>1. Staff add service lines to an order (e.g. "Rewind to 25mm cores — 12 rolls")</p>
        <p>2. On order approval, each service line generates a <strong>production stage instance</strong></p>
        <p>3. Operators move stages through Pending → Active → Completed in the order modal</p>
        <p>4. To add or modify service types, update the stage library in the <strong>Stages</strong> tab</p>
      </div>
    </div>
  );
}
