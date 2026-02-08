import { LabelScheduleBoard } from '@/components/labels/schedule';
import type { ScheduleRunDetails } from '@/hooks/labels/useLabelSchedule';

export default function LabelsSchedule() {
  const handleRunClick = (run: ScheduleRunDetails) => {
    // TODO: Open run details modal
    console.log('Run clicked:', run);
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-2xl font-bold">Production Schedule</h1>
        <p className="text-muted-foreground">
          Drag runs from the sidebar to schedule them on specific days
        </p>
      </div>

      {/* Schedule Board */}
      <div className="flex-1 overflow-hidden">
        <LabelScheduleBoard onRunClick={handleRunClick} />
      </div>
    </div>
  );
}
