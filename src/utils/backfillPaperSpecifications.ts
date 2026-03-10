import { supabase } from '@/integrations/supabase/client';
import { autoResolvePaperSpecifications } from '@/services/PaperSpecAutoResolver';

/**
 * Backfill paper specifications for production jobs that have specs in JSONB
 * but not in the job_print_specifications table.
 * Uses paginated fetches and the same auto-resolver as job creation.
 */
export async function backfillPaperSpecifications(options?: { forceResolve?: boolean }) {
  const forceResolve = options?.forceResolve ?? false;
  const results = {
    total: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    unmapped: 0,
    unmappedKeys: [] as string[],
    errors: [] as Array<{ jobId: string; woNo: string; error: string }>
  };

  try {
    console.log('🔍 Fetching production jobs with paper specifications (paginated)...');

    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    const allJobs: Array<{ id: string; wo_no: string; paper_specifications: any }> = [];

    // Paginate to get ALL jobs beyond Supabase 1000-row limit
    while (hasMore) {
      const { data: jobs, error } = await supabase
        .from('production_jobs')
        .select('id, wo_no, paper_specifications')
        .not('paper_specifications', 'is', null)
        .not('status', 'in', '("Completed","Cancelled","cancelled","completed","archived")')
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!jobs || jobs.length === 0) break;

      allJobs.push(...jobs);
      hasMore = jobs.length === batchSize;
      offset += batchSize;
    }

    if (allJobs.length === 0) {
      console.log('No jobs found with paper specifications');
      return results;
    }

    results.total = allJobs.length;
    console.log(`Found ${allJobs.length} jobs with paper specifications`);

    for (const job of allJobs) {
      try {
        // In force mode, delete existing paper specs so they can be re-resolved
        if (forceResolve) {
          await supabase
            .from('job_print_specifications')
            .delete()
            .eq('job_id', job.id)
            .eq('job_table_name', 'production_jobs')
            .in('specification_category', ['paper_type', 'paper_weight']);
        }

        const resolved = await autoResolvePaperSpecifications(
          job.id,
          job.paper_specifications as Record<string, any>
        );

        if (resolved) {
          console.log(`✅ Resolved specs for ${job.wo_no}`);
          results.processed++;
        } else {
          // Check if skipped (already had specs) or unmapped
          const specs = job.paper_specifications as Record<string, any>;
          const keys = specs ? Object.keys(specs) : [];

          if (keys.length > 0) {
            // Could be skipped (already exists) or unmapped — check
            const { data: existing } = await supabase
              .from('job_print_specifications')
              .select('id')
              .eq('job_id', job.id)
              .eq('job_table_name', 'production_jobs')
              .in('specification_category', ['paper_type', 'paper_weight'])
              .limit(1);

            if (existing && existing.length > 0) {
              results.skipped++;
            } else {
              results.unmapped++;
              for (const key of keys) {
                if (!results.unmappedKeys.includes(key)) {
                  results.unmappedKeys.push(key);
                }
              }
            }
          } else {
            results.skipped++;
          }
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing job ${job.wo_no}:`, errorMessage);
        results.failed++;
        results.errors.push({ jobId: job.id, woNo: job.wo_no, error: errorMessage });
      }
    }

    console.log('\n📊 Backfill Summary:');
    console.log(`Total: ${results.total} | Processed: ${results.processed} | Skipped: ${results.skipped} | Failed: ${results.failed} | Unmapped: ${results.unmapped}`);

    if (results.unmappedKeys.length > 0) {
      console.log('\n⚠️  Unmapped keys:', results.unmappedKeys);
    }

    return results;
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    throw error;
  }
}

export async function runBackfillNow() {
  console.log('🚀 Starting paper specification backfill...');
  const results = await backfillPaperSpecifications();
  console.log('✅ Backfill complete!');
  return results;
}
