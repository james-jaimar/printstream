
import React, { useState } from "react";
import { Settings, Users, Building2, Printer, BarChart3, Wrench, Calendar, Package, Layers, FileSpreadsheet, Mail, GitMerge, Ruler, PanelLeft, HeartPulse } from "lucide-react";
import { ProductionStagesManagement } from "@/components/tracker/admin/ProductionStagesManagement";
import { CategoriesManagement } from "@/components/tracker/admin/CategoriesManagement";
import { UserGroupsManagement } from "@/components/tracker/admin/UserGroupsManagement";
import { PrintersManagement } from "@/components/tracker/admin/PrintersManagement";
import { WorkflowDiagnosticsPanel } from "@/components/tracker/diagnostics/WorkflowDiagnosticsPanel";
import { AdminStagePermissionsManager } from "@/components/tracker/admin/AdminStagePermissionsManager";
import PublicHolidaysManagement from "@/components/tracker/admin/PublicHolidaysManagement";
import { PrintSpecificationsManagement } from "@/components/admin/PrintSpecificationsManagement";
import { BatchAllocationManagement } from "@/components/admin/BatchAllocationManagement";
import { ProofLinkManagement } from "@/components/admin/ProofLinkManagement";
import ExcelMapping from "@/pages/admin/ExcelMapping";
import { QueueMergeGroupsManagement } from "@/components/tracker/admin/QueueMergeGroupsManagement";
import { PaperSizeDefaultsManager } from "@/components/settings/PaperSizeDefaultsManager";
import { ScheduleHealthCard } from "@/components/tracker/admin/ScheduleHealthCard";
import { PremiumUserManagement } from "@/components/users/PremiumUserManagement";
import { UserManagementProvider } from "@/contexts/UserManagementContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type SectionKey =
  | "schedule-health"
  | "users"
  | "excel-mapping"
  | "workflow-diagnostics"
  | "stages"
  | "categories"
  | "specifications"
  | "batch-allocation"
  | "holidays"
  | "permissions"
  | "user-groups"
  | "printers"
  | "proof-links"
  | "queue-merging"
  | "paper-sizes";

interface NavEntry {
  key: SectionKey;
  label: string;
  icon: React.ElementType;
  group: string;
}

const NAV_ITEMS: NavEntry[] = [
  { key: "schedule-health", label: "Schedule Health", icon: HeartPulse, group: "Overview" },
  { key: "users", label: "Users", icon: Users, group: "People & Access" },
  { key: "permissions", label: "Permissions", icon: Users, group: "People & Access" },
  { key: "user-groups", label: "User Groups", icon: Building2, group: "People & Access" },
  { key: "stages", label: "Stages", icon: Settings, group: "Production Config" },
  { key: "categories", label: "Categories", icon: BarChart3, group: "Production Config" },
  { key: "specifications", label: "Specifications", icon: Layers, group: "Production Config" },
  { key: "batch-allocation", label: "Batching", icon: Package, group: "Production Config" },
  { key: "queue-merging", label: "Queue Merging", icon: GitMerge, group: "Production Config" },
  { key: "paper-sizes", label: "Paper Sizes", icon: Ruler, group: "Production Config" },
  { key: "printers", label: "Printers", icon: Printer, group: "Hardware & Links" },
  { key: "proof-links", label: "Proof Links", icon: Mail, group: "Hardware & Links" },
  { key: "excel-mapping", label: "Excel Mapping", icon: FileSpreadsheet, group: "Data & Tools" },
  { key: "holidays", label: "Holidays", icon: Calendar, group: "Data & Tools" },
  { key: "workflow-diagnostics", label: "Diagnostics", icon: Wrench, group: "Data & Tools" },
];

const GROUPS = ["Overview", "People & Access", "Production Config", "Hardware & Links", "Data & Tools"];

function SectionContent({ activeSection }: { activeSection: SectionKey }) {
  switch (activeSection) {
    case "schedule-health":
      return <ScheduleHealthCard />;
    case "users":
      return <UserManagementProvider><PremiumUserManagement /></UserManagementProvider>;
    case "excel-mapping":
      return <ExcelMapping />;
    case "workflow-diagnostics":
      return <WorkflowDiagnosticsPanel />;
    case "stages":
      return <ProductionStagesManagement />;
    case "categories":
      return <CategoriesManagement />;
    case "specifications":
      return <PrintSpecificationsManagement />;
    case "batch-allocation":
      return <BatchAllocationManagement />;
    case "holidays":
      return <PublicHolidaysManagement />;
    case "permissions":
      return <AdminStagePermissionsManager />;
    case "user-groups":
      return <UserGroupsManagement />;
    case "printers":
      return <PrintersManagement />;
    case "proof-links":
      return <ProofLinkManagement />;
    case "queue-merging":
      return <QueueMergeGroupsManagement />;
    case "paper-sizes":
      return <PaperSizeDefaultsManager />;
    default:
      return null;
  }
}

export default function TrackerAdmin() {
  const [activeSection, setActiveSection] = useState<SectionKey>("users");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4">
        <h1 className="text-3xl font-bold">Production Tracker Admin</h1>
        <p className="text-muted-foreground">
          Manage production stages, categories, permissions, specifications, and system diagnostics
        </p>
        <div className="mt-4">
          <ScheduleHealthCard />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <TooltipProvider delayDuration={0}>
          <aside
            className={cn(
              "border-r border-border bg-muted/30 overflow-y-auto transition-all duration-200 shrink-0",
              collapsed ? "w-14" : "w-56"
            )}
          >
            <div className="p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex justify-center"
              >
                <PanelLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
              </Button>
            </div>

            {GROUPS.map((group) => {
              const items = NAV_ITEMS.filter((i) => i.group === group);
              return (
                <div key={group} className="mb-2">
                  {!collapsed && (
                    <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </div>
                  )}
                  {collapsed && <div className="mx-2 my-1 border-t border-border" />}
                  <div className="px-2 space-y-0.5">
                    {items.map((item) => {
                      const isActive = activeSection === item.key;
                      const button = (
                        <button
                          key={item.key}
                          onClick={() => setActiveSection(item.key)}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-accent hover:text-accent-foreground",
                            collapsed && "justify-center px-0"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.label}</span>}
                        </button>
                      );

                      if (collapsed) {
                        return (
                          <Tooltip key={item.key}>
                            <TooltipTrigger asChild>{button}</TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        );
                      }
                      return button;
                    })}
                  </div>
                </div>
              );
            })}
          </aside>
        </TooltipProvider>

        <main className="flex-1 overflow-y-auto p-6 pt-2">
          <h2 className="text-xl font-semibold mb-4">
            {NAV_ITEMS.find((i) => i.key === activeSection)?.label}
          </h2>
          <SectionContent activeSection={activeSection} />
        </main>
      </div>
    </div>
  );
}
