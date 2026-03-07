import type { ScheduledStageData } from "@/hooks/useScheduleReader";

export interface GroupPreview {
  id: string;
  groupName: string;
  count: number;
  jobs: string[]; // job wo_no array
  originalIndex: number;
}

/** Shared helper: returns a consistent grouping key for paper + size */
export const getStageGroupKey = (stage: ScheduledStageData): string => {
  const paperSpec = stage.paper_display || 'Unknown Paper';
  const paperSize = stage.hp12000_paper_size || 'Unknown Size';
  return `${paperSpec} - ${paperSize}`;
};

/** Shared helper: returns a consistent grouping key for paper only */
export const getStagePaperKey = (stage: ScheduledStageData): string => {
  return stage.paper_display || 'Unknown Paper';
};

// Extract lamination specification from finishing_specifications JSONB
export const extractLaminationSpec = (finishingSpecs: any): string => {
  if (!finishingSpecs || typeof finishingSpecs !== 'object') {
    return 'None';
  }
  
  // Look for keys containing "lamination" (case insensitive)
  for (const [key, value] of Object.entries(finishingSpecs)) {
    if (key.toLowerCase().includes('lamination')) {
      // Return the description from the value object if it exists, otherwise the key
      if (typeof value === 'object' && value && (value as any).description) {
        return (value as any).description;
      }
      return key;
    }
  }
  
  return 'None';
};

// Group stages by paper specifications
export const groupStagesByPaper = (stages: ScheduledStageData[]): { grouped: ScheduledStageData[]; previews: GroupPreview[] } => {
  const groups = new Map<string, ScheduledStageData[]>();
  
  // First, group stages by job_id to handle cover/text relationships
  const jobStagesMap = new Map<string, ScheduledStageData[]>();
  stages.forEach(stage => {
    if (!jobStagesMap.has(stage.job_id)) {
      jobStagesMap.set(stage.job_id, []);
    }
    jobStagesMap.get(stage.job_id)!.push(stage);
  });
  
  // Process each job's stages together to maintain cover/text relationships
  jobStagesMap.forEach((jobStages, jobId) => {
    // Sort stages within job by stage_order to maintain proper sequence
    jobStages.sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
    
    // Group by paper type, but keep cover/text stages together
    const jobPaperGroups = new Map<string, ScheduledStageData[]>();
    jobStages.forEach(stage => {
      const paperSpec = getStagePaperKey(stage);
      if (!jobPaperGroups.has(paperSpec)) {
        jobPaperGroups.set(paperSpec, []);
      }
      jobPaperGroups.get(paperSpec)!.push(stage);
    });
    
    // Add job's paper groups to main groups, maintaining stage order
    jobPaperGroups.forEach((stages, paperSpec) => {
      if (!groups.has(paperSpec)) {
        groups.set(paperSpec, []);
      }
      groups.get(paperSpec)!.push(...stages);
    });
  });
  
  // Sort groups by paper specification name
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  // Create grouped stages array and previews
  const grouped: ScheduledStageData[] = [];
  const previews: GroupPreview[] = [];
  
  sortedGroups.forEach(([paperSpec, groupStages], index) => {
    // Sort stages within group by WO number, then by stage_order
    groupStages.sort((a, b) => {
      const woComparison = a.job_wo_no.localeCompare(b.job_wo_no);
      if (woComparison !== 0) return woComparison;
      return (a.stage_order || 0) - (b.stage_order || 0);
    });
    grouped.push(...groupStages);
    
    // Get unique job WO numbers for preview
    const uniqueJobs = [...new Set(groupStages.map(s => s.job_wo_no))];
    
    previews.push({
      id: `paper-${index}`,
      groupName: paperSpec,
      count: groupStages.length,
      jobs: uniqueJobs,
      originalIndex: index
    });
  });
  
  return { grouped, previews };
};

// Group stages by lamination specifications (requires finishing_specifications to be added to ScheduledStageData)
export const groupStagesByLamination = (stages: ScheduledStageData[], jobSpecs: Map<string, any>): { grouped: ScheduledStageData[]; previews: GroupPreview[] } => {
  const groups = new Map<string, ScheduledStageData[]>();
  
  // First, group stages by job_id to handle cover/text relationships
  const jobStagesMap = new Map<string, ScheduledStageData[]>();
  stages.forEach(stage => {
    if (!jobStagesMap.has(stage.job_id)) {
      jobStagesMap.set(stage.job_id, []);
    }
    jobStagesMap.get(stage.job_id)!.push(stage);
  });
  
  // Process each job's stages together to maintain cover/text relationships
  jobStagesMap.forEach((jobStages, jobId) => {
    // Sort stages within job by stage_order to maintain proper sequence
    jobStages.sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
    
    const jobFinishingSpecs = jobSpecs.get(jobId);
    const laminationSpec = extractLaminationSpec(jobFinishingSpecs);
    
    if (!groups.has(laminationSpec)) {
      groups.set(laminationSpec, []);
    }
    groups.get(laminationSpec)!.push(...jobStages);
  });
  
  // Sort groups by lamination specification name
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  // Create grouped stages array and previews
  const grouped: ScheduledStageData[] = [];
  const previews: GroupPreview[] = [];
  
  sortedGroups.forEach(([laminationSpec, groupStages], index) => {
    // Sort stages within group by WO number, then by stage_order
    groupStages.sort((a, b) => {
      const woComparison = a.job_wo_no.localeCompare(b.job_wo_no);
      if (woComparison !== 0) return woComparison;
      return (a.stage_order || 0) - (b.stage_order || 0);
    });
    grouped.push(...groupStages);
    
    // Get unique job WO numbers for preview
    const uniqueJobs = [...new Set(groupStages.map(s => s.job_wo_no))];
    
    previews.push({
      id: `lamination-${index}`,
      groupName: laminationSpec,
      count: groupStages.length,
      jobs: uniqueJobs,
      originalIndex: index
    });
  });
  
  return { grouped, previews };
};

// Determine if a stage is a printing stage
export const isPrintingStage = (stageName: string): boolean => {
  const name = stageName.toLowerCase();
  return name.includes('printing') || name.includes('print') || name.includes('hp') || 
         name.includes('xerox') || name.includes('t250') || name.includes('7900') || 
         name.includes('12000') || name.includes('envelope printing') || 
         name.includes('large format');
};

// Determine if a stage is a laminating stage
export const isLaminatingStage = (stageName: string): boolean => {
  const name = stageName.toLowerCase();
  return name.includes('lamination') || name.includes('laminating') || name.includes('laminate');
};

// Determine if a stage is an HP12000 stage
export const isHP12000Stage = (stageName: string): boolean => {
  const name = stageName.toLowerCase();
  return name.includes('hp12000') || name.includes('hp 12000');
};

// Group HP12000 stages by paper specifications AND paper size (Large/Small)
export const groupStagesByPaperAndSize = (stages: ScheduledStageData[]): { grouped: ScheduledStageData[]; previews: GroupPreview[] } => {
  const groups = new Map<string, ScheduledStageData[]>();
  
  // First, group stages by job_id to handle cover/text relationships
  const jobStagesMap = new Map<string, ScheduledStageData[]>();
  stages.forEach(stage => {
    if (!jobStagesMap.has(stage.job_id)) {
      jobStagesMap.set(stage.job_id, []);
    }
    jobStagesMap.get(stage.job_id)!.push(stage);
  });
  
  // Process each job's stages together to maintain cover/text relationships
  jobStagesMap.forEach((jobStages, jobId) => {
    // Sort stages within job by stage_order to maintain proper sequence
    jobStages.sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
    
    // Group by paper type + paper size combination using shared helper
    const jobPaperGroups = new Map<string, ScheduledStageData[]>();
    jobStages.forEach(stage => {
      const combinedSpec = getStageGroupKey(stage);
      
      if (!jobPaperGroups.has(combinedSpec)) {
        jobPaperGroups.set(combinedSpec, []);
      }
      jobPaperGroups.get(combinedSpec)!.push(stage);
    });
    
    // Add job's paper groups to main groups, maintaining stage order
    jobPaperGroups.forEach((stages, combinedSpec) => {
      if (!groups.has(combinedSpec)) {
        groups.set(combinedSpec, []);
      }
      groups.get(combinedSpec)!.push(...stages);
    });
  });
  
  // Sort groups by paper specification name, then by size (Large before Small)
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    const aParts = a.split(' - ');
    const bParts = b.split(' - ');
    const paperComparison = aParts[0].localeCompare(bParts[0]);
    if (paperComparison !== 0) return paperComparison;
    
    // Within same paper type, sort by size (Large before Small)
    const aSize = aParts[1] || '';
    const bSize = bParts[1] || '';
    if (aSize === 'Large' && bSize === 'Small') return -1;
    if (aSize === 'Small' && bSize === 'Large') return 1;
    return aSize.localeCompare(bSize);
  });
  
  // Create grouped stages array and previews
  const grouped: ScheduledStageData[] = [];
  const previews: GroupPreview[] = [];
  
  sortedGroups.forEach(([combinedSpec, groupStages], index) => {
    // Sort stages within group by WO number, then by stage_order
    groupStages.sort((a, b) => {
      const woComparison = a.job_wo_no.localeCompare(b.job_wo_no);
      if (woComparison !== 0) return woComparison;
      return (a.stage_order || 0) - (b.stage_order || 0);
    });
    grouped.push(...groupStages);
    
    // Get unique job WO numbers for preview
    const uniqueJobs = [...new Set(groupStages.map(s => s.job_wo_no))];
    
    previews.push({
      id: `paper-size-${index}`,
      groupName: combinedSpec,
      count: groupStages.length,
      jobs: uniqueJobs,
      originalIndex: index
    });
  });
  
  return { grouped, previews };
};
