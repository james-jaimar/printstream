
import React, { useState } from "react";
import { Settings, Users, Building2, Printer, BarChart3, Wrench, Calendar, Package, Layers, FileSpreadsheet, Mail, GitMerge, Ruler } from "lucide-react";
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
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SectionKey =
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

const GROUPS = ["People & Access", "Production Config", "Hardware & Links", "Data & Tools"];

function AdminSidebar({ activeSection, onSelect }: { activeSection: SectionKey; onSelect: (key: SectionKey) => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        {GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        onClick={() => onSelect(item.key)}
                        isActive={activeSection === item.key}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}

function SectionContent({ activeSection }: { activeSection: SectionKey }) {
  switch (activeSection) {
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

      <SidebarProvider defaultOpen={true} className="min-h-0 flex-1">
        <div className="flex flex-1 min-h-0 w-full">
          <AdminSidebar activeSection={activeSection} onSelect={setActiveSection} />
          <main className="flex-1 overflow-y-auto p-6 pt-2">
            <div className="flex items-center gap-2 mb-4">
              <SidebarTrigger />
              <h2 className="text-xl font-semibold">
                {NAV_ITEMS.find((i) => i.key === activeSection)?.label}
              </h2>
            </div>
            <SectionContent activeSection={activeSection} />
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}
