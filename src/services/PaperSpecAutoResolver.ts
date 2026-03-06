import { supabase } from '@/integrations/supabase/client';

/**
 * Auto-resolves paper specifications from the production_jobs.paper_specifications JSONB
 * by looking up excel_import_mappings and saving resolved IDs to job_print_specifications.
 * 
 * This fills the gap where neither DirectJobCreator nor enhancedJobCreator
 * automatically resolve mappings unless userApprovedMappings are present.
 */
export async function autoResolvePaperSpecifications(
  jobId: string,
  paperSpecifications: Record<string, any> | null | undefined,
  logger?: { addDebugInfo: (msg: string) => void }
): Promise<boolean> {
  const log = (msg: string) => {
    if (logger) logger.addDebugInfo(msg);
    else console.log(`[PaperSpecAutoResolver] ${msg}`);
  };

  if (!paperSpecifications || typeof paperSpecifications !== 'object') {
    log(`⏭️ No paper_specifications JSONB for job ${jobId}`);
    return false;
  }

  // Check if job_print_specifications already has paper entries — don't overwrite
  const { data: existing } = await supabase
    .from('job_print_specifications')
    .select('id')
    .eq('job_id', jobId)
    .eq('job_table_name', 'production_jobs')
    .in('specification_category', ['paper_type', 'paper_weight'])
    .limit(1);

  if (existing && existing.length > 0) {
    log(`⏭️ Job ${jobId} already has paper specs in job_print_specifications, skipping auto-resolve`);
    return false;
  }

  const keys = Object.keys(paperSpecifications);
  if (keys.length === 0) {
    log(`⏭️ paper_specifications JSONB is empty for job ${jobId}`);
    return false;
  }

  log(`🔍 Auto-resolving paper specs for job ${jobId} from ${keys.length} JSONB key(s)`);

  for (const rawKey of keys) {
    // Try exact match first
    let { data: mapping } = await supabase
      .from('excel_import_mappings')
      .select('paper_type_specification_id, paper_weight_specification_id')
      .eq('excel_text', rawKey)
      .eq('mapping_type', 'paper_specification')
      .maybeSingle();

    // Try normalized spacing if exact match fails
    if (!mapping) {
      const normalized = rawKey.replace(/\s*,\s*/g, ', ');
      const { data: normalizedMapping } = await supabase
        .from('excel_import_mappings')
        .select('paper_type_specification_id, paper_weight_specification_id')
        .ilike('excel_text', normalized)
        .eq('mapping_type', 'paper_specification')
        .maybeSingle();
      if (normalizedMapping) mapping = normalizedMapping;
    }

    if (!mapping || (!mapping.paper_type_specification_id && !mapping.paper_weight_specification_id)) {
      log(`⚠️ No excel_import_mapping found for key: "${rawKey}"`);
      continue;
    }

    log(`✅ Found mapping for "${rawKey}"`);

    const specsToInsert: Array<{
      job_id: string;
      job_table_name: string;
      specification_category: string;
      specification_id: string;
    }> = [];

    if (mapping.paper_type_specification_id) {
      specsToInsert.push({
        job_id: jobId,
        job_table_name: 'production_jobs',
        specification_category: 'paper_type',
        specification_id: mapping.paper_type_specification_id
      });
      log(`  → paper_type: ${mapping.paper_type_specification_id}`);
    }

    if (mapping.paper_weight_specification_id) {
      specsToInsert.push({
        job_id: jobId,
        job_table_name: 'production_jobs',
        specification_category: 'paper_weight',
        specification_id: mapping.paper_weight_specification_id
      });
      log(`  → paper_weight: ${mapping.paper_weight_specification_id}`);
    }

    if (specsToInsert.length > 0) {
      const { error } = await supabase
        .from('job_print_specifications')
        .insert(specsToInsert);

      if (error) {
        log(`❌ Error inserting paper specs: ${error.message}`);
        return false;
      }

      log(`✅ Auto-resolved and saved ${specsToInsert.length} paper spec(s) for job ${jobId}`);
      return true; // Found and saved from first matching key
    }
  }

  return false;
}
