import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Play, CheckCircle, MoreVertical, ArrowRight, Calendar, User, Package } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { DieCuttingJob, DieCuttingMachine } from '@/hooks/tracker/useDieCuttingMachines';
import { cn } from '@/lib/utils';

interface DieCuttingJobCardProps {
  job: DieCuttingJob;
  machines: DieCuttingMachine[];
  onJobClick: () => void;
  onAssignToMachine: (machineId: string | null) => void;
  onStart: () => void;
  onComplete: () => void;
  viewMode: 'card' | 'list';
}

export const DieCuttingJobCard: React.FC<DieCuttingJobCardProps> = ({
  job,
  machines,
  onJobClick,
  onAssignToMachine,
  onStart,
  onComplete,
  viewMode
}) => {
  const isActive = job.status === 'active';
  const isPending = job.status === 'pending' || job.status === 'queued';
  
  const dueDate = job.due_date ? new Date(job.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  if (viewMode === 'list') {
    return (
      <div 
        className={cn(
          "flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors hover:bg-muted/50",
          isActive && "border-green-500 bg-green-50 dark:bg-green-950/30",
          isOverdue && "border-destructive/50"
        )}
        onClick={onJobClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-sm">{job.wo_no}</span>
            {isActive && <Badge variant="default" className="text-xs bg-green-600">Active</Badge>}
            {isOverdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
            {isDueToday && <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">Due Today</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {job.customer || 'No customer'}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {isPending && (
            <Button size="sm" variant="outline" onClick={(e) => handleAction(e, onStart)}>
              <Play className="h-3 w-3" />
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="default" className="bg-green-600" onClick={(e) => handleAction(e, onComplete)}>
              <CheckCircle className="h-3 w-3" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to Machine</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssignToMachine(null)}>
                Unassigned
              </DropdownMenuItem>
              {machines.map(machine => (
                <DropdownMenuItem 
                  key={machine.id} 
                  onClick={() => onAssignToMachine(machine.id)}
                  disabled={job.allocated_machine_id === machine.id}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {machine.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Card view
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isActive && "border-green-500 border-2 bg-green-50 dark:bg-green-950/30",
        isOverdue && "border-destructive"
      )}
      onClick={onJobClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono font-bold text-sm">{job.wo_no}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
              {job.customer || 'No customer'}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to Machine</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssignToMachine(null)}>
                Unassigned
              </DropdownMenuItem>
              {machines.map(machine => (
                <DropdownMenuItem 
                  key={machine.id} 
                  onClick={() => onAssignToMachine(machine.id)}
                  disabled={job.allocated_machine_id === machine.id}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {machine.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Category */}
        {job.category_name && (
          <Badge 
            variant="secondary" 
            className="text-xs"
            style={{ 
              backgroundColor: job.category_color ? `${job.category_color}20` : undefined,
              color: job.category_color || undefined,
              borderColor: job.category_color || undefined
            }}
          >
            {job.category_name}
          </Badge>
        )}

        {/* Details */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {job.qty && (
            <div className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              <span>{job.qty.toLocaleString()}</span>
            </div>
          )}
          {dueDate && (
            <div className={cn(
              "flex items-center gap-1",
              isOverdue && "text-destructive",
              isDueToday && "text-orange-600"
            )}>
              <Calendar className="h-3 w-3" />
              <span>{format(dueDate, 'MMM d')}</span>
            </div>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1 flex-wrap">
          {isActive && (
            <Badge variant="default" className="text-xs bg-green-600">
              Active
            </Badge>
          )}
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">
              Overdue
            </Badge>
          )}
          {isDueToday && !isOverdue && (
            <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
              Due Today
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {isPending && (
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 h-8"
              onClick={(e) => handleAction(e, onStart)}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          {isActive && (
            <Button 
              size="sm" 
              variant="default" 
              className="flex-1 h-8 bg-green-600 hover:bg-green-700"
              onClick={(e) => handleAction(e, onComplete)}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
