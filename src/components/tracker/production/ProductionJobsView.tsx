
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";
import { EnhancedProductionJobCard } from "./EnhancedProductionJobCard";
import { SpecificationFilter, SpecificationFilters } from "../common/SpecificationFilter";
import { useUnifiedBatchWorkflow } from "@/hooks/batch/useUnifiedBatchWorkflow";
import ColumnViewToggle from "@/components/tracker/multistage-kanban/ColumnViewToggle";
import { ProductionJobsList } from "./ProductionJobsList";

interface ProductionJobsViewProps {
  jobs: AccessibleJob[];
  selectedStage?: string | null;
  isLoading: boolean;
  onJobClick: (job: AccessibleJob) => void;
  onStageAction: (jobId: string, stageId: string, action: 'start' | 'complete' | 'qr-scan') => void;
  onAssignParts?: (job: AccessibleJob) => void;
  disableSpecifications?: boolean;
}

export const ProductionJobsView: React.FC<ProductionJobsViewProps> = ({
  jobs,
  selectedStage,
  isLoading,
  onJobClick,
  onStageAction,
  onAssignParts,
  disableSpecifications = false
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [specFilters, setSpecFilters] = useState<SpecificationFilters>({});
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const { completeBatchProcessing, isProcessing } = useUnifiedBatchWorkflow();

  // Extract available specifications for filtering
  const availableSpecs = {
    sizes: [],
    paperTypes: [],
    paperWeights: [],
    laminations: []
  };

  // Filter jobs based on search and specifications
  const filteredJobs = jobs.filter(job => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        job.wo_no?.toLowerCase().includes(searchLower) ||
        job.customer?.toLowerCase().includes(searchLower) ||
        job.reference?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Specification filters would go here
    // For now, just return true as we'd need to integrate with job specifications

    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading jobs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search jobs, customers, references..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <SpecificationFilter
          onFilterChange={setSpecFilters}
          availableSpecs={availableSpecs}
        />
      </div>

      {/* Jobs Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {selectedStage ? `${selectedStage} Stage` : 'All Jobs'} ({filteredJobs.length})
        </h3>
        <div className="flex items-center gap-4">
          {selectedStage && (
            <p className="text-sm text-gray-600">
              Jobs currently in the {selectedStage} production stage
            </p>
          )}
          <ColumnViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Jobs Grid */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg font-medium mb-2">No jobs found</p>
          <p className="text-sm">
            {searchTerm || Object.keys(specFilters).length > 0 
              ? 'Try adjusting your search terms or filters.' 
              : selectedStage 
                ? `No jobs found for ${selectedStage} stage` 
                : 'No jobs found'
            }
          </p>
        </div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => (
            <EnhancedProductionJobCard
              key={job.job_id}
              job={job}
              contextStageName={selectedStage}
              onJobClick={onJobClick}
              onStageAction={onStageAction}
              onAssignParts={onAssignParts}
              showDetails={true}
              disableSpecifications={disableSpecifications}
            />
          ))}
        </div>
      ) : (
        <ProductionJobsList
          jobs={filteredJobs}
          contextStageName={selectedStage}
          onJobClick={onJobClick}
          onStageAction={onStageAction}
          onAssignParts={onAssignParts}
          disableSpecifications={disableSpecifications}
        />
      )}
    </div>
  );
};
