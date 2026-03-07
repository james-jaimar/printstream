

import { supabase } from '@/integrations/supabase/client';
import type { ParsedJob } from '@/utils/excel/types';
import type { ExcelImportDebugger } from '@/utils/excel/debugger';
import { generateQRCodeData, generateQRCodeImage } from '@/utils/qrCodeGenerator';
import { autoResolvePaperSpecifications } from '@/services/PaperSpecAutoResolver';
import { autoResolvePaperSize } from '@/services/PaperSizeDefaultResolver';

export interface DirectJobResult {
  success: boolean;
  createdJobs: any[];
  failedJobs: { job: ParsedJob; error: string }[];
  stats: {
    total: number;
    successful: number;
    failed: number;
  };
}

export class DirectJobCreator {
  constructor(
    private logger: ExcelImportDebugger,
    private userId: string,
    private generateQRCodes: boolean = true
  ) {}

  /**
   * Directly create production jobs with all specifications from Excel data
   * Preserves cover/text logic and paper mapping from the existing system
   */
  async createJobsFromMappings(
    preparedResult: any
  ): Promise<DirectJobResult> {
    const result: DirectJobResult = {
      success: true,
      createdJobs: [],
      failedJobs: [],
      stats: {
        total: Object.keys(preparedResult.categoryAssignments || {}).length,
        successful: 0,
        failed: 0
      }
    };

    this.logger.addDebugInfo(`Creating ${result.stats.total} jobs directly from prepared mappings`);

    // Process each prepared job
    for (const [woNo, assignment] of Object.entries(preparedResult.categoryAssignments || {})) {
      try {
        const originalJob = (assignment as any).originalJob;
        if (!originalJob) {
          throw new Error(`No original job data found for ${woNo}`);
        }

        // LOGGING: Track job data before creation
        this.logger.addDebugInfo(`[QUANTITY LOG] DirectJobCreator - Processing job ${woNo}: base qty=${originalJob.qty}`);
        if (originalJob.printing_specifications) {
          Object.entries(originalJob.printing_specifications).forEach(([key, spec]: [string, any]) => {
            this.logger.addDebugInfo(`[QUANTITY LOG] DirectJobCreator - Input printing spec[${key}]: qty=${spec.qty}, wo_qty=${spec.wo_qty}`);
          });
        }
        if (originalJob.operation_quantities) {
          Object.entries(originalJob.operation_quantities).forEach(([key, op]: [string, any]) => {
            this.logger.addDebugInfo(`[QUANTITY LOG] DirectJobCreator - Input operation[${key}]: operation_qty=${op.operation_qty}, total_wo_qty=${op.total_wo_qty}`);
          });
        }

        // Create the job directly
        const createdJob = await this.createSingleJob(originalJob, preparedResult.rowMappings[woNo] || []);
        result.createdJobs.push(createdJob);
        result.stats.successful++;
        
        this.logger.addDebugInfo(`Successfully created job ${woNo}`);
      } catch (error) {
        this.logger.addDebugInfo(`Failed to create job ${woNo}: ${error}`);
        const originalJob = (preparedResult.categoryAssignments[woNo] as any)?.originalJob;
        result.failedJobs.push({
          job: originalJob || { wo_no: woNo } as ParsedJob,
          error: error instanceof Error ? error.message : String(error)
        });
        result.stats.failed++;
      }
    }

    result.success = result.stats.failed === 0;
    this.logger.addDebugInfo(`Direct job creation completed: ${result.stats.successful}/${result.stats.total} successful`);

    return result;
  }

  private async createSingleJob(originalJob: ParsedJob, rowMappings: any[]): Promise<any> {
    // LOGGING: Track job data at creation
    this.logger.addDebugInfo(`[QUANTITY LOG] createSingleJob - Input job qty: ${originalJob.qty}`);
    
    // Build job data preserving all specifications
    const jobData = {
      wo_no: originalJob.wo_no,
      customer: originalJob.customer || 'Imported Customer',
      reference: originalJob.reference || '',
      qty: originalJob.qty || 1,
      due_date: originalJob.due_date,
      user_id: this.userId,
      status: 'Pre-Press',
      has_custom_workflow: true,
      // Preserve all specifications from Excel parsing
      paper_specifications: originalJob.paper_specifications || {},
      printing_specifications: originalJob.printing_specifications || {},
      finishing_specifications: originalJob.finishing_specifications || {},
      prepress_specifications: originalJob.prepress_specifications || {},
      delivery_specifications: originalJob.delivery_specifications || {},
      operation_quantities: originalJob.operation_quantities || {},
      // Add QR code if enabled (will be updated with actual job_id after creation)
      qr_code_data: this.generateQRCodes ? JSON.stringify({
        wo_no: originalJob.wo_no,
        customer: originalJob.customer || 'Imported Customer',
        temporary: true
      }) : null
    };

    // LOGGING: Track jobData before database insertion
    this.logger.addDebugInfo(`[QUANTITY LOG] createSingleJob - jobData qty before DB insert: ${jobData.qty}`);

    // Insert job into database
    const { data: insertedJob, error: insertError } = await supabase
      .from('production_jobs')
      .insert(jobData)
      .select()
      .single();

    let finalJob = insertedJob;

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        this.logger.addDebugInfo(`Job ${originalJob.wo_no} already exists, updating...`);
        
        const { data: updatedJob, error: updateError } = await supabase
          .from('production_jobs')
          .update({
            ...jobData,
            updated_at: new Date().toISOString()
          })
          .eq('wo_no', originalJob.wo_no)
          .eq('user_id', this.userId)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Failed to update existing job: ${updateError.message}`);
        }
        
        finalJob = updatedJob;
      } else {
        throw new Error(`Database insertion failed: ${insertError.message}`);
      }
    }

    if (!finalJob) {
      throw new Error('Job creation returned no data');
    }

    // LOGGING: Track finalJob after database operation
    this.logger.addDebugInfo(`[QUANTITY LOG] createSingleJob - finalJob qty after DB operation: ${finalJob.qty}`);

    // Initialize custom workflow from row mappings
    await this.initializeWorkflowFromMappings(finalJob, rowMappings);

    // Auto-resolve paper specifications from JSONB via excel_import_mappings
    await autoResolvePaperSpecifications(finalJob.id, finalJob.paper_specifications as Record<string, any> | null, this.logger);

    // Auto-resolve HP12000 paper size from paper_size_defaults
    await autoResolvePaperSize(finalJob.id, this.logger);

    // Generate QR code image if enabled
    if (this.generateQRCodes && finalJob.qr_code_data) {
      try {
        // Update QR code with actual job ID
        const qrCodeData = generateQRCodeData({
          wo_no: finalJob.wo_no,
          job_id: finalJob.id,
          customer: finalJob.customer,
          due_date: finalJob.due_date
        });
        
        const qrCodeUrl = await generateQRCodeImage(qrCodeData);
        
        await supabase
          .from('production_jobs')
          .update({ 
            qr_code_data: qrCodeData,
            qr_code_url: qrCodeUrl 
          })
          .eq('id', finalJob.id);
        
        finalJob.qr_code_data = qrCodeData;
        finalJob.qr_code_url = qrCodeUrl;
      } catch (qrError) {
        this.logger.addDebugInfo(`Warning: QR code generation failed for ${originalJob.wo_no}: ${qrError}`);
      }
    }

    return finalJob;
  }

  private async initializeWorkflowFromMappings(job: any, rowMappings: any[]): Promise<void> {
    if (!rowMappings || rowMappings.length === 0) {
      this.logger.addDebugInfo(`No row mappings found for job ${job.wo_no}, skipping workflow initialization`);
      return;
    }

    this.logger.addDebugInfo(`[QUANTITY LOG] initializeWorkflowFromMappings - Job ${job.wo_no} has ${rowMappings.length} row mappings`);
    
    // LOGGING: Track input mappings
    rowMappings.forEach((mapping, index) => {
      this.logger.addDebugInfo(`[QUANTITY LOG] Input mapping[${index}]: stage="${mapping.mappedStageName}", qty=${mapping.qty}, mappedStageId=${mapping.mappedStageId}`);
    });

    this.logger.addDebugInfo(`Initializing workflow for job ${job.wo_no} with ${rowMappings.length} row mappings - TRUSTING Excel parser`);
    
    // TRUST the Excel parser - it has already done all validation and mapping
    // Only use mappings that have mappedStageId (Excel parser's verified results)
    const validMappings = rowMappings.filter(mapping => mapping.mappedStageId);

    this.logger.addDebugInfo(`Excel parser provided ${validMappings.length} validated mappings with stage IDs`);

    if (validMappings.length === 0) {
      this.logger.addDebugInfo(`No mappings with mappedStageId found - Excel parser should have provided these`);
      return;
    }

    // Pre-process mappings for cover/text logic only
    const processedMappings = this.preprocessMappingsForUniqueStages(validMappings);
    
    // Get unique stage IDs - Excel parser has already validated these exist
    const stageIds = [...new Set(processedMappings.map(m => m.mappedStageId))];
    
    this.logger.addDebugInfo(`Using ${stageIds.length} unique stage IDs from Excel parser: ${stageIds.join(', ')}`);
    
    // Single lookup for stage metadata only (we trust the IDs are valid)
    const { data: stageData, error: stageError } = await supabase
      .from('production_stages')
      .select('id, name, order_index, running_speed_per_hour, make_ready_time_minutes, speed_unit')
      .in('id', stageIds);

    if (stageError) {
      throw new Error(`Failed to fetch stage metadata: ${stageError.message}`);
    }

    if (!stageData || stageData.length !== stageIds.length) {
      this.logger.addDebugInfo(`Warning: Expected ${stageIds.length} stages, found ${stageData?.length || 0}`);
    }
    
    this.logger.addDebugInfo(`Retrieved metadata for ${stageData?.length || 0} stages`);

    // Create lookup maps
    const stageOrderMap = new Map(stageData?.map(stage => [stage.id, stage.order_index]) || []);
    const stageDataMap = new Map(stageData?.map(stage => [stage.id, stage]) || []);
    
    // Create stages manually instead of using RPC to support multiple instances of same stage
    await this.createCustomStageInstances(job, processedMappings, stageOrderMap, stageDataMap);

    // Set all stages to pending (override any default behavior)
    await supabase
      .from('job_stage_instances')
      .update({ 
        status: 'pending',
        started_at: null,
        started_by: null
      })
      .eq('job_id', job.id)
      .eq('job_table_name', 'production_jobs');

    // Add job print specifications and timing calculations for each stage
    await this.addStageSpecifications(job, processedMappings, stageDataMap);
  }

  /**
   * Pre-process row mappings to apply corrected cover/text detection logic
   * and prepare for multiple printing stage instances
   */
  private preprocessMappingsForUniqueStages(mappings: any[]): any[] {
    // LOGGING: Track preprocessing input
    this.logger.addDebugInfo(`[QUANTITY LOG] preprocessMappingsForUniqueStages - Input mappings: ${JSON.stringify(mappings.map(m => ({stage: m.mappedStageName, qty: m.qty})))}`);
    
    // Group mappings by stage name to detect multiple printing stages
    const stageGroups = new Map<string, any[]>();
    
    for (const mapping of mappings) {
      const stageName = mapping.mappedStageName || 'unknown';
      if (!stageGroups.has(stageName)) {
        stageGroups.set(stageName, []);
      }
      stageGroups.get(stageName)!.push(mapping);
    }

    const processedMappings: any[] = [];

    for (const [stageName, stageGroup] of stageGroups.entries()) {
      if (stageGroup.length > 1 && stageName.toLowerCase().includes('printing')) {
        // Multiple printing stages - apply cover/text logic
        this.logger.addDebugInfo(`[QUANTITY LOG] Found ${stageGroup.length} instances of ${stageName}, applying cover/text logic`);
        
        // Sort by quantity: smallest = cover, largest = text (corrected logic)
        const sortedByQty = [...stageGroup].sort((a, b) => (a.qty || 0) - (b.qty || 0));
        this.logger.addDebugInfo(`[QUANTITY LOG] Sorted printing stages by qty: ${JSON.stringify(sortedByQty.map(s => ({qty: s.qty, desc: s.description})))}`);
        
        sortedByQty.forEach((mapping, index) => {
          const isCover = index === 0; // Smallest quantity = Cover
          const isText = index === sortedByQty.length - 1; // Largest quantity = Text
          const partType = isCover ? 'Cover' : isText ? 'Text' : `Part ${index + 1}`;
          
          const processedMapping = {
            ...mapping,
            mappedStageName: `${stageName} (${partType})`,
            partType: partType,
            originalStageId: mapping.mappedStageId, // Keep reference to original
            stageInstanceIndex: index // For creating multiple instances
          };
          
          processedMappings.push(processedMapping);
          
          this.logger.addDebugInfo(`[QUANTITY LOG] Prepared stage: ${stageName} (${partType}) with qty: ${mapping.qty}`);
        });
      } else {
        // Non-printing stage - keep all mappings to preserve all stage instances
        stageGroup.forEach((mapping, index) => {
          const processedMapping = {
            ...mapping,
            originalStageId: mapping.mappedStageId,
            stageInstanceIndex: index
          };
          processedMappings.push(processedMapping);
        });
      }
    }

    // LOGGING: Track preprocessing output
    this.logger.addDebugInfo(`[QUANTITY LOG] preprocessMappingsForUniqueStages - Output mappings: ${JSON.stringify(processedMappings.map(m => ({stage: m.mappedStageName, qty: m.qty, partType: m.partType})))}`);

    return processedMappings;
  }

  /**
   * Create stage instances manually to support multiple instances of the same stage
   */
  private async createCustomStageInstances(job: any, mappings: any[], stageOrderMap: Map<string, number>, stageDataMap: Map<string, any>): Promise<void> {
    // Sort mappings by stage order and instance index
    const sortedMappings = mappings.sort((a, b) => {
      const aOrder = stageOrderMap.get(a.originalStageId || a.mappedStageId) || 0;
      const bOrder = stageOrderMap.get(b.originalStageId || b.mappedStageId) || 0;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // If same stage, sort by instance index
      return (a.stageInstanceIndex || 0) - (b.stageInstanceIndex || 0);
    });

    this.logger.addDebugInfo(`Creating ${sortedMappings.length} stage instances for job ${job.wo_no}`);

    for (let i = 0; i < sortedMappings.length; i++) {
      const mapping = sortedMappings[i];
      const stageId = mapping.originalStageId || mapping.mappedStageId;
      const stageName = mapping.mappedStageName || 'Unknown';
      
      // CRITICAL FIX 1: DTP and Proof stages always get qty=1
      let actualQuantity = mapping.qty || null;
      if (stageName.toLowerCase().includes('dtp') || stageName.toLowerCase().includes('proof')) {
        actualQuantity = 1;
        this.logger.addDebugInfo(`[DTP/PROOF] Hardcoded quantity=1 for ${stageName}`);
      }
      
      this.logger.addDebugInfo(`[QUANTITY LOG] Creating stage instance with quantity: ${actualQuantity} for mapping: ${JSON.stringify({
        mappedStageName: mapping.mappedStageName,
        qty: mapping.qty,
        partType: mapping.partType
      })}`);
      
      const { data: insertedStage, error } = await supabase
        .from('job_stage_instances')
        .insert({
          job_id: job.id,
          job_table_name: 'production_jobs',
          category_id: null, // Custom workflow
          production_stage_id: stageId,
          stage_order: i + 1, // Sequential order
          status: 'pending',
          quantity: actualQuantity, // FIXED: Use actual quantity from mapping
          part_type: mapping.partType?.toLowerCase() || null,
          part_name: mapping.partType || null
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create stage instance for ${mapping.mappedStageName}: ${error.message}`);
      }

      this.logger.addDebugInfo(`[QUANTITY LOG] Created stage instance: ${mapping.mappedStageName} (order: ${i + 1}, qty: ${actualQuantity})`);

      // CRITICAL FIX 2: Calculate duration immediately if we have timing data
      if (insertedStage && actualQuantity && actualQuantity > 0) {
        const stageData = stageDataMap.get(stageId);
        if (stageData?.running_speed_per_hour && stageData.running_speed_per_hour > 0) {
          try {
            const { data: calculatedDuration } = await supabase.rpc('calculate_stage_duration', {
              p_quantity: actualQuantity,
              p_running_speed_per_hour: stageData.running_speed_per_hour,
              p_make_ready_time_minutes: stageData.make_ready_time_minutes || 10,
              p_speed_unit: stageData.speed_unit || 'sheets_per_hour'
            });
            
            if (calculatedDuration && typeof calculatedDuration === 'number') {
              await supabase
                .from('job_stage_instances')
                .update({ estimated_duration_minutes: calculatedDuration })
                .eq('id', insertedStage.id);
              
              this.logger.addDebugInfo(`[DURATION] Calculated ${calculatedDuration} mins for ${stageName} (qty: ${actualQuantity})`);
            }
          } catch (calcError) {
            this.logger.addDebugInfo(`[DURATION] Calculation failed for ${stageName}: ${calcError}`);
          }
        }
      }
    }
  }

  private async addStageSpecifications(job: any, rowMappings: any[], stageDataMap: Map<string, any>): Promise<void> {
    for (const mapping of rowMappings) {
      if (!mapping.mappedStageId) continue;

      // LOGGING: Track mapping data being processed
      this.logger.addDebugInfo(`[QUANTITY LOG] addStageSpecifications - Processing mapping: stage="${mapping.mappedStageName}", qty=${mapping.qty}, paperSpec="${mapping.paperSpecification}"`);

      // Use original stage ID for looking up stage data
      const lookupStageId = mapping.originalStageId || mapping.mappedStageId;
      const stageData = stageDataMap.get(lookupStageId);
      
      // Add paper specifications if available
      if (mapping.paperSpecification && typeof mapping.paperSpecification === 'string') {
        // Look up paper specification by name or try to find simplified mapping
        let paperSpec = null;
        
        // First try exact match
        const { data: exactMatch } = await supabase
          .from('print_specifications')
          .select('id')
          .eq('category', 'paper')
          .ilike('name', mapping.paperSpecification)
          .single();

        if (exactMatch) {
          paperSpec = exactMatch;
        } else {
          // Try to find using simplified mapping (e.g., "Gloss 250gsm" from "HI-Q Titan (Gloss), 250gsm")
          const simplifiedSpec = this.simplifyPaperSpecification(mapping.paperSpecification);
          if (simplifiedSpec !== mapping.paperSpecification) {
            const { data: simplifiedMatch } = await supabase
              .from('print_specifications')
              .select('id')
              .ilike('name', `%${simplifiedSpec}%`)
              .eq('category', 'paper')
              .single();
            
            if (simplifiedMatch) {
              paperSpec = simplifiedMatch;
              this.logger.addDebugInfo(`Found paper spec using simplified mapping: "${mapping.paperSpecification}" -> "${simplifiedSpec}"`);
            }
          }
        }

        if (paperSpec) {
          const { error: specError } = await supabase
            .from('job_print_specifications')
            .insert({
              job_id: job.id,
              job_table_name: 'production_jobs',
              specification_id: paperSpec.id,
              specification_category: 'paper'
            });

          if (specError) {
            this.logger.addDebugInfo(`Warning: Failed to add paper spec for ${job.wo_no}: ${specError.message}`);
          } else {
            this.logger.addDebugInfo(`Added paper specification: ${mapping.paperSpecification} for ${mapping.partType || 'unknown part'}`);
          }
        } else {
          this.logger.addDebugInfo(`Warning: Could not find paper specification for: ${mapping.paperSpecification}`);
        }
      }

      // Calculate timing using stage data and quantity - FIXED: Use actual mapping quantity
      let estimatedDuration = null;
      const mappingQuantity = mapping.qty; // Use actual quantity from mapping
      
      // CRITICAL FIX 3: Fallback to production_stage timing if no specification
      if (mappingQuantity && mappingQuantity > 0 && stageData) {
        if (stageData.running_speed_per_hour && stageData.running_speed_per_hour > 0) {
          const { data: calculatedDuration, error: durationError } = await supabase.rpc('calculate_stage_duration', {
            p_quantity: mappingQuantity,
            p_running_speed_per_hour: stageData.running_speed_per_hour,
            p_make_ready_time_minutes: stageData.make_ready_time_minutes || 10,
            p_speed_unit: stageData.speed_unit || 'sheets_per_hour'
          });

          if (!durationError && calculatedDuration && typeof calculatedDuration === 'number') {
            estimatedDuration = calculatedDuration;
            this.logger.addDebugInfo(`[FALLBACK DURATION] Calculated ${calculatedDuration} mins from production_stage config for ${mapping.mappedStageName}`);
          }
        } else {
          this.logger.addDebugInfo(`[FALLBACK DURATION] No timing config for ${mapping.mappedStageName}, trigger will apply 60min default`);
        }
      }

      // Update stage instance with quantity, timing, and part type information
      const updateData: any = {
        quantity: mappingQuantity || null, // FIXED: Use actual mapping quantity
        part_type: mapping.partType || null,
      };

      if (estimatedDuration) {
        updateData.estimated_duration_minutes = estimatedDuration;
      }

      // LOGGING: Track update data before database operation
      this.logger.addDebugInfo(`[QUANTITY LOG] addStageSpecifications - Updating stage instance with: ${JSON.stringify({
        quantity: updateData.quantity,
        part_type: updateData.part_type,
        estimated_duration_minutes: updateData.estimated_duration_minutes
      })}`);

      // Update stage instance - find by stage ID and part type for multi-instance stages
      let updateQuery = supabase
        .from('job_stage_instances')
        .update(updateData)
        .eq('job_id', job.id)
        .eq('production_stage_id', lookupStageId);

      // If this is a multi-instance stage (has part_type), match by part_type as well
      if (mapping.partType) {
        updateQuery = updateQuery.eq('part_type', mapping.partType);
      }

      const { error } = await updateQuery;

      if (error) {
        this.logger.addDebugInfo(`Warning: Failed to update stage specifications for ${job.wo_no}, stage ${mapping.mappedStageName}: ${error.message}`);
      } else {
        this.logger.addDebugInfo(`[QUANTITY LOG] Updated stage ${mapping.mappedStageName} with qty: ${mappingQuantity}, part: ${mapping.partType}, duration: ${estimatedDuration}min`);
      }
    }
  }

  /**
   * Simplify paper specification name for better matching
   * e.g., "HI-Q Titan (Gloss), 250gsm, White, 640x915" -> "Gloss 250gsm"
   */
  private simplifyPaperSpecification(fullSpec: string): string {
    // Extract finish type (Gloss, Matt, Satin, etc.)
    const finishMatch = fullSpec.match(/\((.*?)\)/);
    const finish = finishMatch?.[1] || '';
    
    // Extract weight (250gsm, 300gsm, etc.)
    const weightMatch = fullSpec.match(/(\d+gsm)/i);
    const weight = weightMatch?.[1] || '';
    
    if (finish && weight) {
      return `${finish} ${weight}`;
    }
    
    return fullSpec; // Return original if we can't simplify
  }
}
