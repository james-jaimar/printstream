import { LabelScheduleBoard } from '@/components/labels/schedule';

export default function LabelsSchedule() {
  return (
    <div className="h-[calc(100vh-40px)] flex flex-col">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Production Schedule</h1>
        <p className="text-sm text-slate-500">
          Drag orders from the sidebar to schedule them on specific days
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-4 sm:px-6 lg:px-8 pb-4">
        <div className="h-full rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur overflow-hidden">
          <LabelScheduleBoard />
        </div>
      </div>
    </div>
  );
}
