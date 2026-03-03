import React from "react";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { useScheduleReader } from "@/hooks/useScheduleReader";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import { useReadOnly } from "@/contexts/ReadOnlyContext";
import { toast } from "sonner";
import { getSchedulingValidation } from "@/utils/scheduler";

export default function ScheduleBoardPage() {
  const { scheduleDays, isLoading, fetchSchedule, triggerReschedule } = useScheduleReader();
  const { isAdmin } = useUserRole();
  const { isReadOnly } = useReadOnly();

  const handleRefresh = async () => {
    await fetchSchedule();
  };

  const handleReschedule = async () => {
    if (isReadOnly) return;
    try {
      toast.message("Rebuilding schedule with parallel-aware scheduler…");

      const ok = await triggerReschedule();
      if (!ok) return;

      await fetchSchedule();
      
      const validationResults = await getSchedulingValidation();
      
      if (validationResults.length > 0) {
        toast.message(
          `✅ Parallel scheduler ran. ${validationResults.length} precedence notes (normal for cover/text stages)`,
          {
            description: "Click on any job to see 'Why scheduled here?' details"
          }
        );
        console.log('Parallel processing validation info:', validationResults);
      } else {
        toast.success(`✅ Perfect schedule: 0 validation notes`);
      }
    } catch (e: any) {
      console.error("Reschedule failed:", e);
      toast.error(`Reschedule failed: ${e?.message ?? e}`);
    }
  };

  return (
    <ScheduleBoard
      scheduleDays={scheduleDays}
      isLoading={isLoading}
      onRefresh={handleRefresh}
      onReschedule={isReadOnly ? undefined : handleReschedule}
      isAdminUser={isReadOnly ? false : isAdmin}
    />
  );
}
