/** Hook for reading scheduled job stages (read-only) */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parsePaperSpecsFromNotes, formatPaperDisplay } from "@/utils/paperSpecUtils";

/* ------------------------- types ------------------------- */

export interface ScheduledStageData {
  id: string;
  job_id: string;
  job_wo_no: string;
  job_customer?: string;  // customer name for search
  job_due_date?: string | null;  // Schedule-aware due date (last stage + 1 working day)
  job_original_committed_due_date?: string | null;  // Original committed date from approval
  production_stage_id: string;
  stage_name: string;
  stage_order: number;
  estimated_duration_minutes: number; // used as "minutes" to render the chip
  start_hhmm: string;         // formatted for display (factory-local)
  end_hhmm: string;           // formatted for display (factory-local)
  status: string;
  stage_color?: string;
  paper_type?: string;
  paper_weight?: string;
  paper_display?: string;     // combined display format like "230gsm FBB"
  hp12000_paper_size_name?: string;  // HP12000 paper size name (e.g., "A3+ Large", "A4+ Small")
  hp12000_paper_size?: string;       // Extracted size only (Large/Small)
  is_split_job?: boolean;     // true if this stage is part of a cross-day split job
  split_job_part?: number;    // which part of the split (1, 2, etc.)
  split_job_total_parts?: number; // total parts in the split
  // helper flag to style carry-overs if you want (optional)
  // is_carry?: boolean;
}

export interface TimeSlotData {
  time_slot: string; // "08:00", "09:00", ...
  scheduled_stages: ScheduledStageData[];
}

export interface ScheduleDayData {
  date: string;      // "YYYY-MM-DD" (factory-local date)
  day_name: string;  // "Monday", etc.
  time_slots: TimeSlotData[];
  total_stages: number;
  total_minutes: number;
}

/* ---------------------- tz + helpers --------------------- */

const FACTORY_TZ =
  import.meta.env.NEXT_PUBLIC_FACTORY_TZ ||
  "UTC";

// First shift for carry-overs (08:00)
const FIRST_SHIFT_HH = 8;
const FIRST_SHIFT_MM = 0;

// Build a factory-local part map for a given Date
function partsInFactory(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: FACTORY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => fmt.find((p) => p.type === t)?.value!;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${month}-${day}`,
    timeKey: `${hour}:00`,
    minutesOfDay: +hour * 60 + +minute,
  };
}

// Render a factory-local ISO-like string (no trailing Z) for display
function factoryLocalISO(dateKey: string, hh: number, mm: number) {
  const h = String(hh).padStart(2, "0");
  const m = String(mm).padStart(2, "0");
  return `${dateKey}T${h}:${m}:00`;
}

// Compute preferred minutes for a stage instance
function pickPlannedMinutes(row: any) {
  const sched = row.scheduled_minutes ?? null;
  const est = row.estimated_duration_minutes ?? 0;
  const setup = row.setup_time_minutes ?? 0;
  const actual = row.actual_duration_minutes ?? 0;
  const diff =
    row.scheduled_start_at && row.scheduled_end_at
      ? Math.max(
          0,
          Math.round(
            (new Date(row.scheduled_end_at).getTime() -
              new Date(row.scheduled_start_at).getTime()) / 60000
          )
        )
      : 0;

  if (typeof sched === "number" && sched > 0) return sched;
  if (est + setup > 0) return est + setup;
  if (est > 0) return est;
  if (actual > 0) return actual;
  return diff || 60; // last-resort default
}

/* ------------------------ hook --------------------------- */

export function useScheduleReader() {
  const [scheduleDays, setScheduleDays] = useState<ScheduleDayData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1) Pull scheduled stage instances (+ minute fields we need + HP12000 paper size)
      const { data: stageInstances, error: stagesError } = await supabase
        .from("job_stage_instances")
        .select(
          `
          id,
          job_id,
          production_stage_id,
          stage_order,
          estimated_duration_minutes,
          setup_time_minutes,
          actual_duration_minutes,
          scheduled_minutes,
          scheduled_start_at,
          scheduled_end_at,
          status,
          job_table_name,
          notes,
          stage_specification_id,
          hp12000_paper_size_id,
          is_split_job,
          split_job_part,
          split_job_total_parts,
          stage_specifications(
            id,
            description
          ),
          hp12000_paper_sizes(
            id,
            name,
            dimensions
          )
        `
        )
        .not("scheduled_start_at", "is", null)
        .not("scheduled_end_at", "is", null)
        .not("status", "eq", "completed")
        .order("scheduled_start_at", { ascending: true });

      if (stagesError) {
        console.error("Error fetching scheduled stages:", stagesError);
        toast.error("Failed to fetch scheduled stages");
        return;
      }

      if (!stageInstances || stageInstances.length === 0) {
        setScheduleDays([]);
        toast.success("No scheduled stages found");
        return;
      }

      // 2) get unique lookups
      const stageIds = [...new Set(stageInstances.map((s) => s.production_stage_id))];
      const jobIds = [...new Set(stageInstances.map((s) => s.job_id))];

      // 3) stage lookup
      const { data: productionStages, error: stagesLookupError } = await supabase
        .from("production_stages")
        .select("id, name, color")
        .in("id", stageIds);

      if (stagesLookupError) {
        console.error("Error fetching production stages:", stagesLookupError);
      }

      // 4) job lookup (include due date fields)
      const { data: productionJobs, error: jobsError } = await supabase
        .from("production_jobs")
        .select("id, wo_no, customer, finishing_specifications, due_date, original_committed_due_date")
        .in("id", jobIds);

      if (jobsError) {
        console.error("Error fetching production jobs:", jobsError);
      }

      // 4b) Fetch job print specifications for all jobs to get mapped paper values
      const { data: jobSpecs, error: jobSpecsError } = await supabase
        .from("job_print_specifications")
        .select(`
          job_id,
          specification_category,
          print_specifications (
            id,
            name,
            display_name,
            category
          )
        `)
        .in("job_id", jobIds)
        .eq("job_table_name", "production_jobs")
        .in("specification_category", ["paper_type", "paper_weight"]);

      if (jobSpecsError) {
        console.error("Error fetching job print specifications:", jobSpecsError);
      }

      // Build a map of job_id -> { paper_type, paper_weight }
      const jobPaperMap = new Map<string, { paper_type?: string; paper_weight?: string }>();
      if (jobSpecs) {
        for (const spec of jobSpecs) {
          if (!jobPaperMap.has(spec.job_id)) {
            jobPaperMap.set(spec.job_id, {});
          }
          const jobPaper = jobPaperMap.get(spec.job_id)!;
          if (spec.specification_category === "paper_type" && spec.print_specifications) {
            jobPaper.paper_type = (spec.print_specifications as any).display_name;
          } else if (spec.specification_category === "paper_weight" && spec.print_specifications) {
            jobPaper.paper_weight = (spec.print_specifications as any).display_name;
          }
        }
      }

      // 5) Helper function to determine stage type
      const getStageType = (stageName: string) => {
        const name = stageName.toLowerCase();
        if (name.includes('printing') || name.includes('print') || name.includes('hp') || 
            name.includes('xerox') || name.includes('t250') || name.includes('7900') || 
            name.includes('12000') || name.includes('envelope printing') || 
            name.includes('large format')) {
          return 'printing';
        }
        if (name.includes('laminating')) {
          return 'laminating';
        }
        if (name.includes('uv varnish') || name.includes('uv varnishing')) {
          return 'uv_varnish';
        }
        return 'other';
      };

      // Helper function to extract paper size from HP12000 paper size name
      const extractPaperSize = (paperSizeName: string): string | undefined => {
        if (!paperSizeName) return undefined;
        const name = paperSizeName.toLowerCase();
        if (name.includes('large')) return 'Large';
        if (name.includes('small')) return 'Small';
        return undefined;
      };
      
      // Helper function to extract UV varnish specs from finishing_specifications JSONB
      const extractUVVarnishSpec = (finishingSpecs: any): string | undefined => {
        if (!finishingSpecs || typeof finishingSpecs !== 'object') return undefined;
        
        // Look for keys containing "uv varnish" (case insensitive)
        for (const [key, value] of Object.entries(finishingSpecs)) {
          if (key.toLowerCase().includes('uv varnish')) {
            // Return the key name itself (e.g., "Overall gloss UV varnish 1 side")
            // or the description from the value object if it exists
            if (typeof value === 'object' && value && (value as any).description) {
              return (value as any).description;
            }
            return key;
          }
        }
        return undefined;
      };
      
      // Helper function to extract lamination specs from finishing_specifications JSONB
      const extractLaminationSpec = (finishingSpecs: any): string | undefined => {
        if (!finishingSpecs || typeof finishingSpecs !== 'object') return undefined;
        
        // Look for keys containing "lamination" (case insensitive)
        for (const [key, value] of Object.entries(finishingSpecs)) {
          if (key.toLowerCase().includes('lamination')) {
            // Return the key name itself or the description from the value object if it exists
            if (typeof value === 'object' && value && (value as any).description) {
              return (value as any).description;
            }
            return key;
          }
        }
        return undefined;
      };
      
      // No job-level paper spec fetching needed - extract from individual stage notes

      // 6) maps
      const stageMap = new Map((productionStages || []).map((s) => [s.id, s]));
      const jobMap = new Map((productionJobs || []).map((j) => [j.id, j]));

      // 7) Group by factory-local date + hour slots
      const scheduleMap = new Map<string, Map<string, ScheduledStageData[]>>();
      const timeSlots = [
        "08:00",
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
      ];

      for (const row of stageInstances) {
        const start = new Date(row.scheduled_start_at);
        const end = new Date(row.scheduled_end_at);

        const startP = partsInFactory(start);
        const endP = partsInFactory(end);

        const stage = stageMap.get(row.production_stage_id);
        const job = jobMap.get(row.job_id);
        
        // Extract specifications using the same logic as SubSpecificationBadge
        const stageType = stage ? getStageType(stage.name) : 'other';
        
        let displaySpec = undefined;
        let paperSpecs = null;
        
        // Extract HP12000 paper size information
        const hp12000PaperSizeName = row.hp12000_paper_sizes?.name;
        const hp12000PaperSize = hp12000PaperSizeName ? extractPaperSize(hp12000PaperSizeName) : undefined;
        
        // Priority 1: For printing stages, use MAPPED specs from job_print_specifications
        if (stageType === 'printing') {
          const jobPaper = jobPaperMap.get(row.job_id);
          if (jobPaper?.paper_type || jobPaper?.paper_weight) {
            // Use mapped values for consistent grouping
            const weight = jobPaper.paper_weight || '';
            const type = jobPaper.paper_type || '';
            displaySpec = weight && type ? `${weight} ${type}` : (weight || type);
            paperSpecs = {
              paper_type: jobPaper.paper_type,
              paper_weight: jobPaper.paper_weight
            };
          }
          // Fallback: parse from notes if no mapped specs found
          else if (row.notes?.toLowerCase().includes('paper:')) {
            const parsedPaper = parsePaperSpecsFromNotes(row.notes);
            if (parsedPaper.fullPaperSpec) {
              displaySpec = formatPaperDisplay(parsedPaper);
              paperSpecs = {
                paper_type: parsedPaper.paperType,
                paper_weight: parsedPaper.paperWeight
              };
            }
          }
        }
        // Priority 2: stage_specifications.description (for non-printing stages or printing without paper specs)
        if (!displaySpec && row.stage_specifications?.description) {
          displaySpec = row.stage_specifications.description;
        }
        // Priority 3: Custom notes (if notes exist)
        else if (!displaySpec && row.notes) {
          displaySpec = `Custom: ${row.notes}`;
        }
        // Priority 4: Extract from JSONB fields (for UV varnish stages without stage specs)
        else if (!displaySpec && stageType === 'uv_varnish' && job?.finishing_specifications) {
          displaySpec = extractUVVarnishSpec(job.finishing_specifications);
        }

        // total planned minutes
        const planned = pickPlannedMinutes(row);

        // Build a function to push a card into scheduleMap
        const pushCard = (
          dateKey: string,
          slotKey: string,
          minutes: number,
          dispStartISO: string,
          dispEndISO: string,
          isCarry = false
        ) => {
          if (!scheduleMap.has(dateKey)) scheduleMap.set(dateKey, new Map());
          const dayMap = scheduleMap.get(dateKey)!;
          if (!dayMap.has(slotKey)) dayMap.set(slotKey, []);

          dayMap.get(slotKey)!.push({
            id: row.id + (isCarry ? "-carry" : ""),
            job_id: row.job_id,
            job_wo_no: job?.wo_no || "Unknown",
            job_customer: job?.customer || undefined,
            job_due_date: job?.due_date || null,
            job_original_committed_due_date: job?.original_committed_due_date || null,
            production_stage_id: row.production_stage_id,
            stage_name: stage?.name || "Unknown Stage",
            stage_order: row.stage_order,
            estimated_duration_minutes: Math.max(0, minutes),
            start_hhmm: dispStartISO,
            end_hhmm: dispEndISO,
            status: row.status,
            stage_color: stage?.color || "#6B7280",
            paper_type: paperSpecs?.paper_type,
            paper_weight: paperSpecs?.paper_weight,
            paper_display: displaySpec,
            hp12000_paper_size_name: hp12000PaperSizeName,
            hp12000_paper_size: hp12000PaperSize,
            is_split_job: row.is_split_job || false,
            split_job_part: row.split_job_part || undefined,
            split_job_total_parts: row.split_job_total_parts || undefined,
            // is_carry: isCarry,
          });
        };

        // Single-day slot (factory-local)
        if (startP.dateKey === endP.dateKey) {
          const minutes = planned; // all minutes on the same day
          pushCard(
            startP.dateKey,
            startP.timeKey,
            minutes,
            factoryLocalISO(startP.dateKey, +startP.hour, +startP.minute),
            factoryLocalISO(endP.dateKey, +endP.hour, +endP.minute),
            false
          );
        } else {
          // Cross-midnight: split into two segments.
          // Carry starts at next day's first shift; carry minutes = end - 08:00
          const carryStartMin = FIRST_SHIFT_HH * 60 + FIRST_SHIFT_MM;
          const carryMinutes = Math.max(0, endP.minutesOfDay - carryStartMin);

          // Remaining minutes stay on the starting day
          const firstDayMinutes = Math.max(0, planned - carryMinutes);

          // 1) First segment (original day, keep original start; end at 23:59 conceptually)
          pushCard(
            startP.dateKey,
            startP.timeKey,
            firstDayMinutes,
            factoryLocalISO(startP.dateKey, +startP.hour, +startP.minute),
            // Display the real end, because your card shows a time range; the minutes chip still reflects firstDayMinutes
            factoryLocalISO(endP.dateKey, +endP.hour, +endP.minute),
            false
          );

          // 2) Carry segment (next day 08:00 -> real end)
          pushCard(
            endP.dateKey,
            "08:00",
            carryMinutes,
            factoryLocalISO(endP.dateKey, FIRST_SHIFT_HH, FIRST_SHIFT_MM),
            factoryLocalISO(endP.dateKey, +endP.hour, +endP.minute),
            true
          );
        }
      }

      // 7) Convert to array format
      const days: ScheduleDayData[] = [];

      scheduleMap.forEach((dayMap, dateKey) => {
        // keep your fixed slots order
        const timeSlotData: TimeSlotData[] = timeSlots.map((slot) => ({
          time_slot: slot,
          scheduled_stages: dayMap.get(slot) || [],
        }));

        const flat = Array.from(dayMap.values()).flat();
        const totalStages = flat.length;
        const totalMinutes = flat.reduce(
          (sum, s) => sum + (s.estimated_duration_minutes || 0),
          0
        );

        // Build a Date from the factory-local date for the label
        const [yy, mm, dd] = dateKey.split("-").map((n) => +n);
        const labelDate = new Date(yy, mm - 1, dd, 12, 0, 0); // midday to avoid DST edge

        days.push({
          date: dateKey,
          day_name: labelDate.toLocaleDateString("en-GB", { weekday: "long" }),
          time_slots: timeSlotData,
          total_stages: totalStages,
          total_minutes: totalMinutes,
        });
      });

      days.sort((a, b) => a.date.localeCompare(b.date));

      setScheduleDays(days);
      toast.success(
        `Loaded schedule with ${stageInstances.length} stages across ${days.length} days`
      );
    } catch (error) {
      console.error("Error in fetchSchedule:", error);
      toast.error("Failed to fetch schedule data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Canonical path: UI -> Edge Function -> DB wrapper
  const triggerReschedule = useCallback(async () => {
    try {
      console.log("🔄 Triggering reschedule via edge function: simple-scheduler...");
      const { data, error } = await supabase.functions.invoke('simple-scheduler', {
        body: {
          commit: true,
          proposed: false,
          onlyIfUnset: false,
          nuclear: true,
          wipeAll: true
        }
      });
      if (error) {
        console.error("Error triggering reschedule:", error);
        toast.error("Failed to trigger reschedule");
        return false;
      }
      const result: any = (data as any) || {};
      const wroteSlots = result?.scheduled ?? result?.applied?.wrote_slots ?? 0;
      const updatedJsi = result?.applied?.updated ?? result?.jobs_considered ?? 0;
      const violations = Array.isArray(result?.violations) ? result.violations.length : 0;
      console.log("✅ Reschedule complete via edge function:", result);
      toast.success(`Rescheduled: ${updatedJsi} stages, ${wroteSlots} slots${violations ? `, ${violations} notes` : ''}`);

      // Refresh after a moment
      setTimeout(() => {
        fetchSchedule();
      }, 1500);
      return true;
    } catch (error) {
      console.error("Error triggering reschedule:", error);
      toast.error("Failed to trigger reschedule");
      return false;
    }
  }, [fetchSchedule]);

  return {
    scheduleDays,
    isLoading,
    fetchSchedule,
    triggerReschedule,
  };
}
