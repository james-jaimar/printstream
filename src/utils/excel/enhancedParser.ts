import * as XLSX from "xlsx";
import type { ParsedJob, ImportStats, ParsedData, MatrixExcelData } from './types';
import type { ExcelImportDebugger } from './debugger';
import { formatExcelDate } from './dateFormatter';
import { formatWONumber } from './woNumberFormatter';
import { createColumnMap } from './columnMapper';
import { parseMatrixExcelFile, parseMatrixDataToJobs } from './matrixParser';
import { EnhancedMappingProcessor } from './enhancedMappingProcessor';
import { EnhancedJobCreator } from './enhancedJobCreator';
import { checkParsedJobsForDuplicates } from '@/utils/jobDeduplication';
import type { ExcelPreviewData, ColumnMapping } from '@/components/tracker/ColumnMappingDialog';
import type { MatrixColumnMapping } from '@/components/tracker/MatrixMappingDialog';

export const parseExcelFileForPreview = async (file: File): Promise<ExcelPreviewData> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  
  if (jsonData.length < 2) {
    throw new Error("Excel file appears to be empty or has no data rows");
  }

  const headers = jsonData[0] as string[];
  const sampleRows = jsonData.slice(1, 6) as any[][]; // Get first 5 data rows for preview
  const totalRows = jsonData.length - 1; // Exclude header row

  return {
    headers,
    sampleRows,
    totalRows
  };
};

// New function for matrix Excel preview
export const parseMatrixExcelFileForPreview = async (file: File, logger: ExcelImportDebugger): Promise<MatrixExcelData> => {
  return await parseMatrixExcelFile(file, logger);
};

// New function for matrix parsing with mapping
export const parseMatrixExcelFileWithMapping = async (
  file: File,
  matrixData: MatrixExcelData,
  mapping: MatrixColumnMapping,
  logger: ExcelImportDebugger,
  availableSpecs: any[] = []
): Promise<ParsedData> => {
  logger.addDebugInfo(`Starting enhanced matrix parsing with mapping for file: ${file.name}`);
  
  // Convert MatrixColumnMapping to a format the matrix parser can use
  const columnMapping = {
    woNo: mapping.woNo,
    customer: mapping.customer,
    reference: mapping.reference,
    date: mapping.date,
    dueDate: mapping.dueDate,
    rep: mapping.rep,
    category: mapping.category,
    location: mapping.location,
    size: mapping.size,
    specification: mapping.specification,
    contact: mapping.contact
  };
  
  // Update matrix data with confirmed mappings
  const updatedMatrixData: MatrixExcelData = {
    ...matrixData,
    groupColumn: mapping.groupColumn,
    workOrderColumn: mapping.woNo,
    descriptionColumn: mapping.descriptionColumn,
    qtyColumn: mapping.qtyColumn,
    woQtyColumn: mapping.woQtyColumn
  };
  
  // Parse using matrix parser
  const jobsResult = await parseMatrixDataToJobs(updatedMatrixData, columnMapping, logger);
  const jobs = jobsResult.jobs;
  
  // Log duplicate information for user feedback
  if (jobsResult.duplicatesSkipped > 0) {
    logger.addWarning(`⚠️ ${jobsResult.duplicatesSkipped} duplicate work orders were automatically skipped`);
    logger.addInfo(`Duplicate WO numbers: ${jobsResult.duplicateJobs.map(j => j.wo_no).join(', ')}`);
  }
  
  // Apply enhanced mapping for paper and delivery specifications
  const enhancedProcessor = new EnhancedMappingProcessor(logger, availableSpecs);
  await enhancedProcessor.initialize(); // CRITICAL: Initialize to load production stages
  
  // Find paper and delivery columns from specification column
  const paperColumnIndex = mapping.specification !== -1 ? mapping.specification : -1;
  
  // FIXED: Extract delivery column from matrix data instead of hardcoded -1
  let deliveryColumnIndex = -1;
  if (matrixData?.detectedGroups?.includes('delivery')) {
    // Find delivery group data in rows
    for (let i = 0; i < matrixData.rows.length; i++) {
      const row = matrixData.rows[i];
      if (matrixData.groupColumn !== -1 && row[matrixData.groupColumn]) {
        const groupName = String(row[matrixData.groupColumn]).toLowerCase();
        if (groupName.includes('delivery')) {
          deliveryColumnIndex = matrixData.descriptionColumn !== -1 ? matrixData.descriptionColumn : -1;
          logger.addDebugInfo(`🎯 Found delivery group - setting deliveryColumnIndex to ${deliveryColumnIndex}`);
          break;
        }
      }
    }
  }
  
  const enhancedResult = await enhancedProcessor.processJobsWithEnhancedMapping(
    jobs,
    paperColumnIndex,
    deliveryColumnIndex,
    matrixData.rows,
    mapping // Pass the user-approved stage mappings from MatrixColumnMapping
  );
  
  const stats: ImportStats = {
    totalRows: matrixData.rows.length,
    processedRows: enhancedResult.jobs.length,
    skippedRows: matrixData.rows.length - enhancedResult.jobs.length,
    invalidWONumbers: 0,
    invalidDates: 0,
    invalidTimingData: 0,
    invalidSpecifications: enhancedResult.unmappedPaperSpecs.length + enhancedResult.unmappedDeliverySpecs.length
  };
  
  logger.addDebugInfo(`Enhanced matrix parsing completed: ${enhancedResult.jobs.length} jobs processed`);
  logger.addDebugInfo(`Paper specs mapped: ${enhancedResult.stats.paperSpecsMapped}, Delivery specs mapped: ${enhancedResult.stats.deliverySpecsMapped}`);
  
  return { 
    jobs: enhancedResult.jobs, 
    stats,
    duplicatesSkipped: jobsResult.duplicatesSkipped,
    duplicateJobs: jobsResult.duplicateJobs
  };
};

export const getAutoDetectedMapping = (headers: string[], logger: ExcelImportDebugger): ColumnMapping => {
  return createColumnMap(headers, logger);
};

const safeGetCellValue = (row: any[], index: number): any => {
  if (index === -1 || !row || index >= row.length) return '';
  const value = row[index];
  return value === null || value === undefined ? '' : value;
};

// Function to normalize status values - filter out unwanted statuses from MIS system
const normalizeStatus = (statusValue: any, logger: ExcelImportDebugger): string => {
  const rawStatus = String(statusValue || "").trim();
  
  // Filter out "Production" status as it's just a MIS marker with no value
  if (rawStatus.toLowerCase() === 'production') {
    logger.addDebugInfo(`Filtering out "Production" status - using default "Pre-Press"`);
    return "Pre-Press";
  }
  
  // Return the status as-is if it's not the filtered value
  return rawStatus || "Pre-Press";
};

export const parseExcelFileWithMapping = async (
  file: File, 
  mapping: ColumnMapping, 
  logger: ExcelImportDebugger,
  availableSpecs: any[] = []
): Promise<ParsedData> => {
  logger.addDebugInfo(`Starting to process file: ${file.name} with custom mapping`);
  
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get the range to understand the data structure
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  logger.addDebugInfo(`Sheet range: ${range.s.r} to ${range.e.r} rows, ${range.s.c} to ${range.e.c} columns`);
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  logger.addDebugInfo(`Raw data rows: ${jsonData.length}`);
  
  if (jsonData.length < 2) {
    throw new Error("Excel file appears to be empty or has no data rows");
  }

  // Get headers from first row
  const headers = jsonData[0] as string[];
  logger.addDebugInfo(`Headers found: ${JSON.stringify(headers)}`);
  logger.addDebugInfo(`Using custom mapping: ${JSON.stringify(mapping)}`);

  // Process data rows
  let dataRows = jsonData.slice(1) as any[][];
  
  const stats: ImportStats = {
    totalRows: dataRows.length,
    processedRows: 0,
    skippedRows: 0,
    invalidWONumbers: 0,
    invalidDates: 0,
    invalidTimingData: 0,
    invalidSpecifications: 0
  };

  const mapped: ParsedJob[] = [];

  dataRows.forEach((row, index) => {
    logger.addDebugInfo(`Processing row ${index + 2}: ${JSON.stringify(row.slice(0, 12))}`);
    
    const woNo = formatWONumber(safeGetCellValue(row, mapping.woNo), logger);
    
    // Only skip if WO number is completely missing - allow other fields to be blank
    if (!woNo) {
      logger.addDebugInfo(`Skipping row ${index + 2}: Missing WO Number`);
      stats.skippedRows++;
      stats.invalidWONumbers++;
      return;
    }

    // Process dates with validation - allow empty dates
    const dateValue = safeGetCellValue(row, mapping.date);
    const dueDateValue = safeGetCellValue(row, mapping.dueDate);
    
    const formattedDate = formatExcelDate(dateValue, logger);
    const formattedDueDate = formatExcelDate(dueDateValue, logger);
    
    // Only log as error if there was a value but it couldn't be parsed
    if (!formattedDate && dateValue && String(dateValue).trim() !== '') {
      logger.addDebugInfo(`Warning: Invalid date in row ${index + 2}: "${dateValue}"`);
      stats.invalidDates++;
    }
    if (!formattedDueDate && dueDateValue && String(dueDateValue).trim() !== '') {
      logger.addDebugInfo(`Warning: Invalid due date in row ${index + 2}: "${dueDateValue}"`);
      stats.invalidDates++;
    }

    // Safely extract other fields with fallbacks using custom mapping
    const statusValue = safeGetCellValue(row, mapping.status);
    const repValue = safeGetCellValue(row, mapping.rep);
    const categoryValue = safeGetCellValue(row, mapping.category);
    const customerValue = safeGetCellValue(row, mapping.customer);
    const referenceValue = safeGetCellValue(row, mapping.reference);
    const qtyValue = safeGetCellValue(row, mapping.qty);
    const locationValue = safeGetCellValue(row, mapping.location);
    
    // Extract timing and specification fields
    const estimatedHoursValue = safeGetCellValue(row, mapping.estimatedHours);
    const setupTimeValue = safeGetCellValue(row, mapping.setupTime);
    const runningSpeedValue = safeGetCellValue(row, mapping.runningSpeed);
    const speedUnitValue = safeGetCellValue(row, mapping.speedUnit);
    const specificationsValue = safeGetCellValue(row, mapping.specifications);
    const paperWeightValue = safeGetCellValue(row, mapping.paperWeight);
    const paperTypeValue = safeGetCellValue(row, mapping.paperType);
    const laminationValue = safeGetCellValue(row, mapping.lamination);

    // Parse timing values with validation
    let estimatedHours: number | null = null;
    let setupTimeMinutes: number | null = null;
    let runningSpeed: number | null = null;
    
    if (estimatedHoursValue && String(estimatedHoursValue).trim() !== '') {
      const parsed = parseFloat(String(estimatedHoursValue));
      if (!isNaN(parsed)) {
        estimatedHours = parsed;
      } else {
        logger.addDebugInfo(`Warning: Invalid estimated hours in row ${index + 2}: "${estimatedHoursValue}"`);
        stats.invalidTimingData++;
      }
    }
    
    if (setupTimeValue && String(setupTimeValue).trim() !== '') {
      const parsed = parseInt(String(setupTimeValue).replace(/[^0-9]/g, ''));
      if (!isNaN(parsed)) {
        setupTimeMinutes = parsed;
      } else {
        logger.addDebugInfo(`Warning: Invalid setup time in row ${index + 2}: "${setupTimeValue}"`);
        stats.invalidTimingData++;
      }
    }
    
    if (runningSpeedValue && String(runningSpeedValue).trim() !== '') {
      const parsed = parseFloat(String(runningSpeedValue).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed)) {
        runningSpeed = parsed;
      } else {
        logger.addDebugInfo(`Warning: Invalid running speed in row ${index + 2}: "${runningSpeedValue}"`);
        stats.invalidTimingData++;
      }
    }

    // Use the new status normalization function
    const normalizedStatus = normalizeStatus(statusValue, logger);

    const job: ParsedJob = {
      wo_no: woNo,
      status: normalizedStatus,
      date: formattedDate,
      rep: String(repValue || "").trim(),
      category: String(categoryValue || "").trim(),
      customer: String(customerValue || "").trim(),
      reference: String(referenceValue || "").trim(),
      qty: parseInt(String(qtyValue || "0").replace(/[^0-9]/g, '')) || 0,
      due_date: formattedDueDate,
      location: String(locationValue || "").trim(),
      // New timing and specification fields
      estimated_hours: estimatedHours,
      setup_time_minutes: setupTimeMinutes,
      running_speed: runningSpeed,
      speed_unit: String(speedUnitValue || "").trim() || null,
      specifications: String(specificationsValue || "").trim() || null,
      paper_weight: String(paperWeightValue || "").trim() || null,
      paper_type: String(paperTypeValue || "").trim() || null,
      lamination: String(laminationValue || "").trim() || null,
      // Preserve original Excel row data and index for row mapping
      _originalExcelRow: row,
      _originalRowIndex: index + 1 // +1 because we sliced headers
    };

    logger.addDebugInfo(`Mapped job: ${JSON.stringify(job)}`);
    mapped.push(job);
    stats.processedRows++;
  });

  // Apply enhanced mapping for paper and delivery specifications
  const enhancedProcessor = new EnhancedMappingProcessor(logger, availableSpecs);
  await enhancedProcessor.initialize(); // CRITICAL: Initialize to load production stages
  
  // CRITICAL FIX: Extract user-approved stage mappings BEFORE processing
  const userApprovedStageMappings: Record<string, number> = {};
  Object.entries(mapping).forEach(([key, value]) => {
    if (key.startsWith('stage_') && typeof value === 'number' && value !== -1) {
      const stageId = key.replace('stage_', '');
      userApprovedStageMappings[stageId] = value;
    }
  });
  
  logger.addDebugInfo(`🎯 EXTRACTED USER-APPROVED STAGE MAPPINGS: ${Object.keys(userApprovedStageMappings).length} mappings`);
  Object.entries(userApprovedStageMappings).forEach(([stageId, columnIndex]) => {
    logger.addDebugInfo(`   - Stage ${stageId} -> Column ${columnIndex}`);
  });

  // Process with enhanced mapping, passing user-approved stage mappings
  const enhancedResult = await enhancedProcessor.processJobsWithEnhancedMapping(
    mapped,
    mapping.paperType || -1,
    mapping.delivery || -1,
    dataRows,
    mapping // Pass the entire mapping object to preserve user-approved stage mappings
  );
  
  // CRITICAL: Add user-approved mappings to the result
  enhancedResult.userApprovedStageMappings = userApprovedStageMappings;

  // Update stats with enhanced mapping results
  stats.invalidSpecifications = enhancedResult.unmappedPaperSpecs.length + enhancedResult.unmappedDeliverySpecs.length;

  logger.addDebugInfo(`Enhanced import completed: ${stats.processedRows} processed, ${stats.skippedRows} skipped, ${stats.invalidDates} invalid dates, ${stats.invalidTimingData} invalid timing data`);
  logger.addDebugInfo(`Paper specs mapped: ${enhancedResult.stats.paperSpecsMapped}, Delivery specs mapped: ${enhancedResult.stats.deliverySpecsMapped}`);

  // Check for duplicates against existing database
  const duplicateCheck = await checkParsedJobsForDuplicates(enhancedResult.jobs);
  const filteredJobs = duplicateCheck.newJobs as ParsedJob[];
  const duplicatesSkipped = duplicateCheck.duplicates.length;
  const duplicateJobs = duplicateCheck.duplicates as ParsedJob[];

  if (duplicatesSkipped > 0) {
    logger.addWarning(`⚠️ Skipped ${duplicatesSkipped} duplicate WO numbers already in database`);
    logger.addInfo(`Duplicate WO numbers: ${duplicateJobs.map(j => j.wo_no).join(', ')}`);
    stats.processedRows -= duplicatesSkipped;
    stats.skippedRows += duplicatesSkipped;
  }

  return { jobs: filteredJobs, stats, duplicatesSkipped, duplicateJobs };
};

/**
 * Phase 4: Enhanced workflow-aware parsing and mapping preparation (no database saves)
 */
export const parseAndPrepareProductionReadyJobs = async (
  file: File,
  mapping: ColumnMapping,
  logger: ExcelImportDebugger,
  userId: string,
  generateQRCodes: boolean = true,
  availableSpecs: any[] = []
): Promise<any> => {
  logger.addDebugInfo(`Starting Phase 4 enhanced job preparation for file: ${file.name}`);
  
  // Step 1: Parse Excel with enhanced mapping and extract raw data
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  
  const headers = jsonData[0] as string[];
  const dataRows = jsonData.slice(1) as any[][];
  
  // CRITICAL FIX: Extract user-approved stage mappings BEFORE processing  
  const userApprovedStageMappings: Array<{groupName: string, mappedStageId: string, mappedStageName: string, category: string}> = [];
  
  // Convert column mapping format to user-approved format
  // For now, this will be empty since we don't have stage info in the column mapping
  // The real user mappings come from the dialog
  
  logger.addDebugInfo(`🎯 PREPARE PHASE - USER-APPROVED STAGE MAPPINGS: ${userApprovedStageMappings.length} mappings (will be provided by dialog)`);
  userApprovedStageMappings.forEach((mapping) => {
    logger.addDebugInfo(`   - Group "${mapping.groupName}" -> Stage ${mapping.mappedStageId} (${mapping.mappedStageName}) [${mapping.category}]`);
  });

  // Get enhanced result with user-approved stage mappings FIRST
  const enhancedProcessor = new EnhancedMappingProcessor(logger, availableSpecs);
  await enhancedProcessor.initialize();
  const parseResult = await parseExcelFileWithMapping(file, mapping, logger, availableSpecs);
  const { jobs } = parseResult;
  
  // Step 2: Process jobs with enhanced mapping
  const enhancedResult = await enhancedProcessor.processJobsWithEnhancedMapping(
    jobs,
    -1, // paper column not relevant here
    -1, // delivery column not relevant here
    dataRows,
    mapping // Pass the entire mapping object to preserve user stage mappings
  );
  
  // CRITICAL: User-approved mappings will be passed directly to job creator
  // No need to assign to enhancedResult since they use different formats
  
  logger.addDebugInfo(`ENHANCED RESULT: Found ${userApprovedStageMappings.length} user-approved stage mappings`);
  
  // Step 3: Create enhanced job creator with Excel data
  const jobCreator = new EnhancedJobCreator(logger, userId, generateQRCodes);
  await jobCreator.initialize();
  
  // Step 4: Prepare jobs with mappings AND user-approved stage mappings
  const result = await jobCreator.prepareEnhancedJobsWithExcelData(
    enhancedResult.jobs, // Use jobs with applied user mappings
    headers, 
    dataRows,
    userApprovedStageMappings // Pass user-approved mappings to job creator
  );
  
  // CRITICAL: Preserve user-approved mappings in final result
  result.userApprovedStageMappings = userApprovedStageMappings;
  
  logger.addDebugInfo(`Phase 4 enhanced job preparation completed: ${result.stats.total} jobs prepared for review`);
  
  // Propagate duplicate info from parse phase
  result.duplicatesSkipped = parseResult.duplicatesSkipped || 0;
  result.duplicateJobs = parseResult.duplicateJobs || [];
  
  return result;
};

/**
 * Phase 4: Enhanced workflow-aware parsing and job creation
 */
export const parseAndCreateProductionReadyJobs = async (
  file: File,
  mapping: ColumnMapping,
  logger: ExcelImportDebugger,
  userId: string,
  generateQRCodes: boolean = true,
  availableSpecs: any[] = []
): Promise<any> => {
  logger.addDebugInfo(`Starting Phase 4 enhanced job creation for file: ${file.name}`);
  
  // Step 1: Parse Excel with enhanced mapping and extract raw data
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  
  const headers = jsonData[0] as string[];
  const dataRows = jsonData.slice(1) as any[][];
  
  const { jobs } = await parseExcelFileWithMapping(file, mapping, logger, availableSpecs); // duplicates already filtered
  
  // Step 2: Create enhanced job creator with Excel data
  const jobCreator = new EnhancedJobCreator(logger, userId, generateQRCodes);
  await jobCreator.initialize();
  
  // Step 3: Create production-ready jobs with workflows, passing Excel data
  const result = await jobCreator.createEnhancedJobsWithExcelData(jobs, headers, dataRows);
  
  logger.addDebugInfo(`Phase 4 enhanced job creation completed: ${result.stats.successful}/${result.stats.total} jobs created`);
  
  return result;
};

/**
 * Phase 4: Enhanced matrix parsing and preparation (no database saves)
 */
export const parseMatrixAndPrepareProductionReadyJobs = async (
  file: File,
  matrixData: MatrixExcelData,
  mapping: MatrixColumnMapping,
  logger: ExcelImportDebugger,
  userId: string,
  generateQRCodes: boolean = true,
  availableSpecs: any[] = []
): Promise<any> => {
  logger.addDebugInfo(`Starting Phase 4 enhanced matrix job preparation for file: ${file.name}`);
  
  // Step 1: Parse matrix Excel with enhanced mapping
  const parseResult = await parseMatrixExcelFileWithMapping(file, matrixData, mapping, logger, availableSpecs);
  const jobs = parseResult.jobs;
  
  // Step 2: Create enhanced job creator with matrix data
  const jobCreator = new EnhancedJobCreator(logger, userId, generateQRCodes);
  await jobCreator.initialize();
  
  // Step 3: Prepare jobs with mappings but DON'T save to database yet
  const result = await jobCreator.prepareEnhancedJobsWithExcelData(
    jobs, 
    matrixData.headers, 
    matrixData.rows
  );
  
  logger.addDebugInfo(`Phase 4 enhanced matrix job preparation completed: ${result.stats.total} jobs prepared for review`);
  
  // Add duplicate information to the result
  result.duplicatesSkipped = parseResult.duplicatesSkipped;
  result.duplicateJobs = parseResult.duplicateJobs;
  
  return result;
};

/**
 * Phase 4: Enhanced matrix parsing and job creation
 */
export const parseMatrixAndCreateProductionReadyJobs = async (
  file: File,
  matrixData: MatrixExcelData,
  mapping: MatrixColumnMapping,
  logger: ExcelImportDebugger,
  userId: string,
  generateQRCodes: boolean = true,
  availableSpecs: any[] = []
): Promise<any> => {
  logger.addDebugInfo(`Starting Phase 4 enhanced matrix job creation for file: ${file.name}`);
  
  // Step 1: Parse matrix Excel with enhanced mapping
  const { jobs } = await parseMatrixExcelFileWithMapping(file, matrixData, mapping, logger, availableSpecs);
  
  // Step 2: Create enhanced job creator with matrix data
  const jobCreator = new EnhancedJobCreator(logger, userId, generateQRCodes);
  await jobCreator.initialize();
  
  // Step 3: Create production-ready jobs with workflows, passing matrix data
  const result = await jobCreator.createEnhancedJobsWithExcelData(
    jobs, 
    matrixData.headers, 
    matrixData.rows
  );
  
  logger.addDebugInfo(`Phase 4 enhanced matrix job creation completed: ${result.stats.successful}/${result.stats.total} jobs created`);
  
  return result;
};

/**
 * Finalize production-ready jobs by saving them to the database
 */
export const finalizeProductionReadyJobs = async (
  preparedResult: any,
  logger: ExcelImportDebugger,
  currentUserId: string,
  userApprovedMappings?: Array<{groupName: string, mappedStageId: string, mappedStageName: string, category: string}>
): Promise<any> => {
  logger.addDebugInfo(`Finalizing ${preparedResult.stats.total} prepared jobs for user ${currentUserId}`);
  
  if (userApprovedMappings && userApprovedMappings.length > 0) {
    logger.addDebugInfo(`User provided ${userApprovedMappings.length} approved stage mappings`);
  }
  
  // Use the EnhancedJobCreator's finalize method with current authenticated user ID
  const jobCreator = new EnhancedJobCreator(logger, currentUserId, preparedResult.generateQRCodes);
  await jobCreator.initialize();
  
  const finalResult = await jobCreator.finalizeJobs(preparedResult, userApprovedMappings);
  
  logger.addDebugInfo(`Finalization completed: ${finalResult.stats.successful}/${finalResult.stats.total} jobs saved`);
  
  return finalResult;
};