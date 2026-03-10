/**
 * Paper List Dialog
 * Aggregates paper requirements for a selected day from the schedule.
 */
import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleDayData } from "@/hooks/useScheduleReader";

interface PaperListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleDays: ScheduleDayData[];
}

interface PaperGroup {
  key: string;
  paperType: string;
  paperWeight: string;
  paperSize: string;
  jobCount: number;
  totalQty: number;
  workOrders: string[];
}

/** Printing stage names (case-insensitive match) */
const PRINTING_STAGE_KEYWORDS = [
  "hp 12000", "hp12000", "7900", "t250", "print", "hp indigo",
  "digital print", "litho", "offset",
];

function isPrintingStage(stageName: string): boolean {
  const lower = stageName.toLowerCase();
  return PRINTING_STAGE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function PaperListDialog({
  open,
  onOpenChange,
  scheduleDays,
}: PaperListDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");

  const paperGroups = useMemo<PaperGroup[]>(() => {
    const day = scheduleDays.find((d) => d.date === selectedDate);
    if (!day) return [];

    const map = new Map<string, PaperGroup>();

    day.time_slots.forEach((slot) => {
      slot.scheduled_stages
        .filter((s) => isPrintingStage(s.stage_name))
        .forEach((stage) => {
          const pType = stage.paper_type || "Unknown";
          const pWeight = stage.paper_weight || "Unknown";
          const pSize = stage.hp12000_paper_size || stage.hp12000_paper_size_name || "—";
          const key = `${pType}||${pWeight}||${pSize}`;

          const existing = map.get(key);
          const wo = stage.job_wo_no || "N/A";

          if (existing) {
            existing.jobCount += 1;
            existing.totalQty += stage.quantity || 0;
            if (!existing.workOrders.includes(wo)) existing.workOrders.push(wo);
          } else {
            map.set(key, {
              key,
              paperType: pType,
              paperWeight: pWeight,
              paperSize: pSize,
              jobCount: 1,
              totalQty: stage.quantity || 0,
              workOrders: [wo],
            });
          }
        });
    });

    return Array.from(map.values()).sort((a, b) =>
      `${a.paperWeight} ${a.paperType}`.localeCompare(`${b.paperWeight} ${b.paperType}`)
    );
  }, [scheduleDays, selectedDate]);

  const copyToClipboard = () => {
    if (!paperGroups.length) return;
    const day = scheduleDays.find((d) => d.date === selectedDate);
    const header = `Paper List — ${day?.day_name} ${selectedDate}\n${"─".repeat(50)}`;
    const rows = paperGroups.map(
      (g) =>
        `${g.paperWeight} ${g.paperType} (${g.paperSize})  ×${g.jobCount} jobs  Qty: ${g.totalQty}\n  WOs: ${g.workOrders.join(", ")}`
    );
    const text = [header, ...rows].join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success("Paper list copied to clipboard");
  };

  const printList = () => {
    const day = scheduleDays.find((d) => d.date === selectedDate);
    const w = window.open("", "_blank", "width=700,height=500");
    if (!w) return;
    w.document.write(`<html><head><title>Paper List – ${selectedDate}</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#f5f5f5}</style></head><body>
      <h2>Paper List — ${day?.day_name} ${selectedDate}</h2>
      <table><thead><tr><th>Paper</th><th>Size</th><th>Jobs</th><th>Est. Minutes</th><th>Work Orders</th></tr></thead><tbody>`);
    paperGroups.forEach((g) => {
      w.document.write(
        `<tr><td>${g.paperWeight} ${g.paperType}</td><td>${g.paperSize}</td><td>${g.jobCount}</td><td>${g.totalMinutes}</td><td>${g.workOrders.join(", ")}</td></tr>`
      );
    });
    w.document.write("</tbody></table></body></html>");
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Paper List</DialogTitle>
          <DialogDescription>
            Select a day to see the aggregated paper requirements for all printing stages.
          </DialogDescription>
        </DialogHeader>

        {/* Day selector */}
        <div className="flex items-center gap-3">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Choose a day…" />
            </SelectTrigger>
            <SelectContent>
              {scheduleDays.map((day) => (
                <SelectItem key={day.date} value={day.date}>
                  {day.day_name} — {day.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {paperGroups.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={printList}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {!selectedDate && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Choose a day above to generate the paper list.
            </p>
          )}

          {selectedDate && paperGroups.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No printing stages found for this day.
            </p>
          )}

          {paperGroups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paper</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead className="text-right">Est. Min</TableHead>
                  <TableHead>Work Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paperGroups.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="font-medium">
                      {g.paperWeight} {g.paperType}
                    </TableCell>
                    <TableCell>{g.paperSize}</TableCell>
                    <TableCell className="text-right">{g.jobCount}</TableCell>
                    <TableCell className="text-right">{g.totalMinutes}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {g.workOrders.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
