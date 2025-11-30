import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdvanceRequest {
  orderNumbers: string[];
  targetStageName: string;
  advanceMode: 'to' | 'through';
}

interface AdvanceResult {
  woNo: string;
  success: boolean;
  error?: string;
  stagesUpdated?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { orderNumbers, targetStageName, advanceMode }: AdvanceRequest = await req.json();

    console.log(`📋 Bulk Advance Request:`, {
      orderCount: orderNumbers.length,
      targetStageName,
      advanceMode,
    });

    // Get the target production stage
    const { data: targetStage, error: stageError } = await supabase
      .from('production_stages')
      .select('id, order_index')
      .eq('name', targetStageName)
      .single();

    if (stageError || !targetStage) {
      console.error('❌ Target stage not found:', targetStageName);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Stage "${targetStageName}" not found`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Target stage found:`, targetStage);

    const results: AdvanceResult[] = [];
    let processed = 0;
    let failed = 0;

    // Process each order
    for (const woNo of orderNumbers) {
      try {
        console.log(`\n🔄 Processing order: ${woNo}`);

        // Get the job
        const { data: job, error: jobError } = await supabase
          .from('production_jobs')
          .select('id, wo_no')
          .eq('wo_no', woNo)
          .single();

        if (jobError || !job) {
          console.log(`⚠️ Job not found: ${woNo}`);
          results.push({
            woNo,
            success: false,
            error: 'Job not found',
          });
          failed++;
          continue;
        }

        // Get all job stage instances for this job, ordered by stage_order
        const { data: stages, error: stagesError } = await supabase
          .from('job_stage_instances')
          .select('id, production_stage_id, stage_order, status, production_stages(name, order_index)')
          .eq('job_id', job.id)
          .order('stage_order', { ascending: true });

        if (stagesError || !stages || stages.length === 0) {
          console.log(`⚠️ No stages found for job: ${woNo}`);
          results.push({
            woNo,
            success: false,
            error: 'No stages found for this job',
          });
          failed++;
          continue;
        }

        console.log(`📊 Found ${stages.length} stages for ${woNo}`);

        const now = new Date().toISOString();
        const currentUserId = '00000000-0000-0000-0000-000000000000'; // System user
        let stagesUpdated = 0;

        // Process each stage
        for (const stage of stages) {
          const stageData = stage.production_stages as any;
          const stageOrderIndex = stageData?.order_index || 0;

          // SAFETY CHECK: Skip DTP and PROOF stages (order_index <= 2)
          if (stageOrderIndex <= 2) {
            console.log(`⏭️ Skipping ${stageData?.name} (order_index ${stageOrderIndex}) - DTP/PROOF protected`);
            continue;
          }

          const isBeforeTarget = stageOrderIndex < targetStage.order_index;
          const isTargetStage = stage.production_stage_id === targetStage.id;

          if (isBeforeTarget) {
            // Mark all stages before target as completed
            const { error: updateError } = await supabase
              .from('job_stage_instances')
              .update({
                status: 'completed',
                started_at: stage.started_at || now,
                started_by: stage.started_by || currentUserId,
                completed_at: now,
                completed_by: currentUserId,
                updated_at: now,
              })
              .eq('id', stage.id);

            if (updateError) {
              console.error(`❌ Error updating stage ${stage.id}:`, updateError);
            } else {
              console.log(`✅ Marked ${stageData?.name} as completed`);
              stagesUpdated++;
            }
          } else if (isTargetStage) {
            // Handle target stage based on mode
            if (advanceMode === 'to') {
              // Make target stage active
              const { error: updateError } = await supabase
                .from('job_stage_instances')
                .update({
                  status: 'active',
                  started_at: now,
                  started_by: currentUserId,
                  updated_at: now,
                })
                .eq('id', stage.id);

              if (updateError) {
                console.error(`❌ Error activating target stage:`, updateError);
              } else {
                console.log(`✅ Activated target stage: ${stageData?.name}`);
                stagesUpdated++;
              }
            } else {
              // Mark target stage as completed
              const { error: updateError } = await supabase
                .from('job_stage_instances')
                .update({
                  status: 'completed',
                  started_at: stage.started_at || now,
                  started_by: stage.started_by || currentUserId,
                  completed_at: now,
                  completed_by: currentUserId,
                  updated_at: now,
                })
                .eq('id', stage.id);

              if (updateError) {
                console.error(`❌ Error completing target stage:`, updateError);
              } else {
                console.log(`✅ Completed target stage: ${stageData?.name}`);
                stagesUpdated++;
              }
            }
          }
          // Stages after target are left untouched
        }

        results.push({
          woNo,
          success: true,
          stagesUpdated,
        });
        processed++;
        console.log(`✅ Successfully processed ${woNo} (${stagesUpdated} stages updated)`);

        // Add delay to allow triggers to fire
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`❌ Error processing ${woNo}:`, error);
        results.push({
          woNo,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    const response = {
      processed,
      failed,
      total: orderNumbers.length,
      results,
      message: `Processed ${processed} jobs, ${failed} failed`,
    };

    console.log(`\n📊 Final Results:`, response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
