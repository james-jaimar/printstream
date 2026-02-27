import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar, Package, User, MapPin, Star, Edit, QrCode, BookOpen, AlertTriangle, Clock, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QRCodeManager } from "./QRCodeManager";
import { BatchStageIndicator } from "./batch/BatchStageIndicator";
import { BatchJobCard } from "./BatchJobCard";
import { BatchContextIndicator } from "./BatchAwareJobCard";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface ProductionJob extends AccessibleJob {
  highlighted?: boolean;
  qr_code_data?: string;
  qr_code_url?: string;
  so_no?: string;
  location?: string;
  due_date_warning_level?: 'green' | 'amber' | 'red' | 'critical';
  internal_completion_date?: string;
  cover_text_detection?: {
    isBookJob: boolean;
    components: Array<{
      type: 'cover' | 'text';
      printing: { wo_qty: number };
    }>;
  } | null;
}

interface ProductionJobCardProps {
  job: ProductionJob;
}

export const ProductionJobCard = ({ job }: ProductionJobCardProps) => {
  const [highlighted, setHighlighted] = useState(job.highlighted || false);
  const [jobData, setJobData] = useState(job);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  // If this is a batch master job, render BatchJobCard instead
  if (job.is_batch_master) {
    return (
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        className={isDragging ? "opacity-50" : ""}
        {...attributes}
        {...listeners}
      >
        <BatchJobCard job={job} />
      </div>
    );
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleToggleHighlight = async (checked: boolean) => {
    setHighlighted(checked);
    
    try {
      const { error } = await supabase
        .from('production_jobs')
        .update({ highlighted: checked })
        .eq('id', job.id);

      if (error) {
        console.error("Error updating highlight:", error);
        toast.error("Failed to update highlight");
        setHighlighted(!checked); // Revert on error
      }
    } catch (error) {
      console.error("Error updating highlight:", error);
      toast.error("Failed to update highlight");
      setHighlighted(!checked); // Revert on error
    }
  };

  const handleQRCodeGenerated = (qrData: string, qrUrl: string) => {
    setJobData(prev => ({
      ...prev,
      qr_code_data: qrData,
      qr_code_url: qrUrl
    }));
  };

  const isOverdue = job.due_date && new Date(job.due_date) < new Date();
  const isDueSoon = job.due_date && !isOverdue && 
    new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // Due within 3 days

  const getCardBorderColor = () => {
    if (highlighted) return "border-yellow-400 bg-yellow-50";
    
    // Due date warning levels take priority over legacy overdue logic
    if (job.due_date_warning_level) {
      switch (job.due_date_warning_level) {
        case 'critical':
          return "border-red-600 bg-red-100";
        case 'red':
          return "border-red-400 bg-red-50";
        case 'amber':
          return "border-amber-400 bg-amber-50";
        case 'green':
        default:
          return "border-gray-200 bg-white";
      }
    }
    
    // Fallback to legacy overdue logic
    if (isOverdue) return "border-red-400 bg-red-50";
    if (isDueSoon) return "border-orange-400 bg-orange-50";
    return "border-gray-200 bg-white";
  };

  const getDueDateWarningIcon = () => {
    if (!job.due_date_warning_level || job.due_date_warning_level === 'green') {
      return <Clock className="h-3 w-3 text-gray-400" />;
    }
    
    const iconProps = {
      'amber': { className: "h-3 w-3 text-amber-500" },
      'red': { className: "h-3 w-3 text-red-500" },
      'critical': { className: "h-3 w-3 text-red-600" }
    };
    
    return <AlertTriangle {...iconProps[job.due_date_warning_level as keyof typeof iconProps]} />;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing ${getCardBorderColor()} ${
        isDragging ? "opacity-50" : ""
      } hover:shadow-md transition-shadow`}
      {...attributes}
      {...listeners}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold text-sm">{job.wo_no}</h4>
              {job.so_no && (
                <p className="text-xs text-gray-500">SO: {job.so_no}</p>
              )}
              {job.reference && (
                <p className="text-xs text-gray-500">Ref: {job.reference}</p>
              )}
              {job.payment_status === 'awaiting_payment' && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0 mt-1">
                  <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                  AWAITING PAYMENT
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {highlighted && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
              <Switch
                checked={highlighted}
                onCheckedChange={handleToggleHighlight}
              />
            </div>
          </div>

          {/* Customer */}
          {job.customer && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-gray-400" />
              <span className="text-xs font-medium truncate">{job.customer}</span>
            </div>
          )}

          {/* Category, Quantity, and Batch Status */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {job.category_name && (
                <Badge variant="secondary" className="text-xs">
                  {job.category_name}
                </Badge>
              )}
              {job.cover_text_detection?.isBookJob && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  Book
                </Badge>
              )}
              <BatchStageIndicator job={job} compact showLabel={false} />
              <BatchContextIndicator job={job} size="sm" showDetails={false} />
            </div>
            {job.qty && (
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-gray-400" />
                <span>{job.qty}</span>
              </div>
            )}
          </div>

          {/* Due Date with Warning Indicator */}
          {job.due_date && (
            <div className="flex items-center gap-2">
              {getDueDateWarningIcon()}
              <div className="flex-1">
                <span className={`text-xs ${
                  job.due_date_warning_level === 'critical' ? "text-red-600 font-medium" :
                  job.due_date_warning_level === 'red' ? "text-red-500 font-medium" :
                  job.due_date_warning_level === 'amber' ? "text-amber-600 font-medium" :
                  isOverdue ? "text-red-600 font-medium" : 
                  isDueSoon ? "text-orange-600 font-medium" : 
                  "text-gray-600"
                }`}>
                  Due: {new Date(job.due_date).toLocaleDateString()}
                </span>
                {job.internal_completion_date && job.due_date_warning_level && job.due_date_warning_level !== 'green' && (
                  <div className="text-xs text-gray-500">
                    Est: {new Date(job.internal_completion_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          {job.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-600 truncate">{job.location}</span>
            </div>
          )}

          {/* QR Code Section */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1">
              {jobData.qr_code_url && (
                <QrCode className="h-3 w-3 text-green-500" />
              )}
              <span className="text-xs text-gray-500">
                {jobData.qr_code_url ? 'QR Generated' : 'No QR Code'}
              </span>
            </div>
            <QRCodeManager 
              job={jobData} 
              onQRCodeGenerated={handleQRCodeGenerated}
              compact={true}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
