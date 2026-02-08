/**
 * Visual Slot Layout Preview
 * 
 * Shows a visual representation of how labels are arranged across slots
 * using the new RunLayoutDiagram component
 */

import { RunLayoutDiagram } from './optimizer/RunLayoutDiagram';
import { type ProposedRun, type LabelItem, type LabelDieline } from '@/types/labels';

interface SlotLayoutPreviewProps {
  runs: ProposedRun[];
  items: LabelItem[];
  dieline: LabelDieline;
}

export function SlotLayoutPreview({ runs, items, dieline }: SlotLayoutPreviewProps) {
  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <RunLayoutDiagram
          key={run.run_number}
          runNumber={run.run_number}
          slotAssignments={run.slot_assignments}
          dieline={dieline}
          items={items}
          meters={run.meters}
          frames={run.frames}
          showStats={true}
        />
      ))}
    </div>
  );
}
