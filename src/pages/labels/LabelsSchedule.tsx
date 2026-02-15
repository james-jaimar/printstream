import { LabelScheduleBoard } from '@/components/labels/schedule';

export default function LabelsSchedule() {
  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="px-6 py-4">
        <h1 className="text-2xl font-bold">Production Schedule</h1>
        <p className="text-muted-foreground">
          Drag orders from the sidebar to schedule them on specific days
        </p>
      </div>

      <div className="flex-1 overflow-hidden">
        <LabelScheduleBoard />
      </div>
    </div>
  );
}
