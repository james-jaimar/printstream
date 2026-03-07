import { supabase } from '@/integrations/supabase/client';

/**
 * Auto-resolves HP12000 paper size for job stage instances
 * by looking up the job's paper_weight + paper_type in the paper_size_defaults table.
 * 
 * Priority: exact match (weight+type) first, then weight-only fallback.
 */
export async function autoResolvePaperSize(
  jobId: string,
  logger?: { addDebugInfo: (msg: string) => void }
): Promise<boolean> {
  const log = (msg: string) => {
    if (logger) logger.addDebugInfo(msg);
    else console.log(`[PaperSizeDefaultResolver] ${msg}`);
  };

  // 1. Get the job's resolved paper specs from job_print_specifications
  const { data: jobSpecs } = await supabase
    .from('job_print_specifications')
    .select('specification_category, specification_id')
    .eq('job_id', jobId)
    .eq('job_table_name', 'production_jobs')
    .in('specification_category', ['paper_type', 'paper_weight']);

  if (!jobSpecs || jobSpecs.length === 0) {
    log(`⏭️ No paper specs found in job_print_specifications for job ${jobId}`);
    return false;
  }

  const paperWeightId = jobSpecs.find(s => s.specification_category === 'paper_weight')?.specification_id;
  const paperTypeId = jobSpecs.find(s => s.specification_category === 'paper_type')?.specification_id;

  if (!paperWeightId) {
    log(`⏭️ No paper_weight spec for job ${jobId}, cannot resolve default size`);
    return false;
  }

  // 2. Check for HP12000 stage instances with no paper size assigned
  const { data: stageInstances } = await supabase
    .from('job_stage_instances')
    .select('id, hp12000_paper_size_id')
    .eq('job_id', jobId)
    .eq('job_table_name', 'production_jobs')
    .is('hp12000_paper_size_id', null);

  if (!stageInstances || stageInstances.length === 0) {
    log(`⏭️ No HP12000 stage instances without paper size for job ${jobId}`);
    return false;
  }

  // 3. Look up paper_size_defaults - exact match first (weight + type)
  let defaultSizeId: string | null = null;

  if (paperTypeId) {
    const { data: exactMatch } = await supabase
      .from('paper_size_defaults' as any)
      .select('default_paper_size_id')
      .eq('paper_weight_id', paperWeightId)
      .eq('paper_type_id', paperTypeId)
      .maybeSingle();

    if (exactMatch) {
      defaultSizeId = (exactMatch as any).default_paper_size_id;
      log(`✅ Exact match found (weight+type) → size ${defaultSizeId}`);
    }
  }

  // Fallback: weight-only match (paper_type_id IS NULL)
  if (!defaultSizeId) {
    const { data: weightMatch } = await supabase
      .from('paper_size_defaults' as any)
      .select('default_paper_size_id')
      .eq('paper_weight_id', paperWeightId)
      .is('paper_type_id', null)
      .maybeSingle();

    if (weightMatch) {
      defaultSizeId = (weightMatch as any).default_paper_size_id;
      log(`✅ Weight-only fallback match → size ${defaultSizeId}`);
    }
  }

  if (!defaultSizeId) {
    log(`⏭️ No paper_size_defaults match for weight=${paperWeightId}, type=${paperTypeId}`);
    return false;
  }

  // 4. Update all matching stage instances
  const stageIds = stageInstances.map(s => s.id);
  const { error } = await supabase
    .from('job_stage_instances')
    .update({ hp12000_paper_size_id: defaultSizeId })
    .in('id', stageIds);

  if (error) {
    log(`❌ Failed to set default paper size: ${error.message}`);
    return false;
  }

  log(`✅ Set default paper size ${defaultSizeId} on ${stageIds.length} stage instance(s) for job ${jobId}`);
  return true;
}
