import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Settings,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Play
} from "lucide-react";
import type { ScheduleDayData } from "@/hooks/useScheduleReader";
import { useProductionStages } from "@/hooks/tracker/useProductionStages";

interface ScheduleProductionSidebarProps {
  scheduleDays: ScheduleDayData[];
  selectedStageId?: string | null;
  selectedStageName?: string | null;
  onStageSelect: (stageId: string | null, stageName: string | null) => void;
}

export const ScheduleProductionSidebar: React.FC<ScheduleProductionSidebarProps> = ({ 
  scheduleDays,
  selectedStageId,
  selectedStageName,
  onStageSelect
}) => {
  const { stages: allStages, isLoading: stagesLoading } = useProductionStages();

  // Get stages that have scheduled work and exclude DTP/Proof/Batch stages
  const availableStages = React.useMemo(() => {
    const scheduledStageIds = new Set<string>();
    
    // Collect all production stage IDs that have scheduled work
    scheduleDays.forEach(day => {
      day.time_slots?.forEach(slot => {
        slot.scheduled_stages?.forEach(stage => {
          // Get the production stage ID from the scheduled stage data
          const stageData = allStages.find(s => s.name === stage.stage_name);
          if (stageData) {
            scheduledStageIds.add(stageData.id);
          }
        });
      });
    });
    
    // Filter out stages that shouldn't be shown in schedule (DTP, Proof, Batch Allocation)
    const excludedStageNames = ['DTP', 'Proof', 'Batch Allocation'];
    
    return allStages.filter(stage => 
      scheduledStageIds.has(stage.id) && 
      !excludedStageNames.some(excluded => stage.name.toLowerCase().includes(excluded.toLowerCase()))
    ).sort((a, b) => a.order_index - b.order_index);
  }, [scheduleDays, allStages]);

  const getStageJobCount = (stageId: string) => {
    const stage = allStages.find(s => s.id === stageId);
    if (!stage) return 0;
    
    const uniqueJobIds = new Set<string>();
    scheduleDays.forEach(day => {
      day.time_slots?.forEach(slot => {
        slot.scheduled_stages?.forEach(scheduledStage => {
          if (scheduledStage.stage_name === stage.name) {
            uniqueJobIds.add(scheduledStage.job_id);
          }
        });
      });
    });
    return uniqueJobIds.size;
  };

  const getTotalScheduledJobs = () => {
    const uniqueJobIds = new Set<string>();
    scheduleDays.forEach(day => {
      day.time_slots?.forEach(slot => {
        slot.scheduled_stages?.forEach(stage => {
          uniqueJobIds.add(stage.job_id);
        });
      });
    });
    return uniqueJobIds.size;
  };

  const handleStageClick = (stageId: string, stageName: string) => {
    console.log('Sidebar stage clicked:', { stageId, stageName, selectedStageId, selectedStageName });
    
    if (selectedStageId === stageId) {
      // Clicking the same stage - deselect it
      onStageSelect(null, null);
    } else {
      // Select the new stage
      onStageSelect(stageId, stageName);
    }
  };

  const handleAllJobsClick = () => {
    console.log('All jobs clicked');
    onStageSelect(null, null);
  };

  const getJobCountByStatus = (status: string) => {
    const uniqueJobIds = new Set<string>();
    scheduleDays.forEach(day => {
      day.time_slots?.forEach(slot => {
        slot.scheduled_stages?.forEach(stage => {
          const matches = (() => {
            switch (status) {
              case 'pending': return stage.status === 'pending';
              case 'active': return stage.status === 'active';
              case 'completed': return stage.status === 'completed';
              default: return false;
            }
          })();
          if (matches) uniqueJobIds.add(stage.job_id);
        });
      });
    });
    return uniqueJobIds.size;
  };

  return (
    <div className="w-full overflow-y-auto p-4">
      {/* Schedule Overview */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Schedule Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Working Days:</span>
            <Badge variant="secondary">{scheduleDays.length}</Badge>
          </div>
          <div className="flex justify-between text-xs">
            <span>Total Jobs:</span>
            <Badge variant="secondary">{getTotalScheduledJobs()}</Badge>
          </div>
          <div className="flex justify-between text-xs">
            <span>Total Hours:</span>
            <Badge variant="secondary">
              {Math.floor(scheduleDays.reduce((total, day) => total + day.total_minutes, 0) / 60)}h
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Production Stages */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Scheduled Stages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Button 
            variant={!selectedStageId ? "default" : "ghost"} 
            size="sm" 
            className="w-full justify-start text-xs h-8"
            onClick={handleAllJobsClick}
          >
            All Scheduled Jobs
            <Badge variant="secondary" className="ml-auto text-xs">
              {getTotalScheduledJobs()}
            </Badge>
          </Button>
          {availableStages.map(stage => {
            const jobCount = getStageJobCount(stage.id);
            const isSelected = selectedStageId === stage.id;
            return (
              <Button 
                key={stage.id}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className="w-full justify-start text-xs h-8"
                onClick={() => handleStageClick(stage.id, stage.name)}
              >
                <div 
                  className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="truncate flex-1 text-left">
                  {stage.name}
                </span>
                <Badge variant="secondary" className="ml-auto text-xs font-bold">
                  {jobCount}
                </Badge>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      {/* Status Overview */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Status Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {[
            { id: 'pending', label: 'Pending', icon: Clock, color: 'text-yellow-500' },
            { id: 'active', label: 'In Progress', icon: Play, color: 'text-blue-500' },
            { id: 'completed', label: 'Completed', icon: CheckCircle, color: 'text-green-500' }
          ].map(status => (
            <Button 
              key={status.id}
              variant="ghost" 
              size="sm" 
              className="w-full justify-start text-xs h-8"
            >
              <status.icon className={`h-3 w-3 mr-2 ${status.color}`} />
              <span className="flex-1 text-left">{status.label}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {getJobCountByStatus(status.id)}
              </Badge>
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Stage Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Stage Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Plus className="h-3 w-3 mr-2" />
            Add Stage
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Settings className="h-3 w-3 mr-2" />
            Configure Workflow
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};