import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source using local package (CDN was returning 404 for v4.x)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Generate a thumbnail from a PDF file
 * @param file - The PDF file to generate thumbnail from
 * @param maxWidth - Maximum width of the thumbnail (default 300px)
 * @returns Data URL of the thumbnail image
 */
export async function generatePdfThumbnail(
  file: File,
  maxWidth: number = 300
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;
  
  return canvas.toDataURL('image/png');
}

/**
 * Generate a thumbnail from a PDF URL
 * @param url - The URL of the PDF
 * @param maxWidth - Maximum width of the thumbnail (default 300px)
 * @returns Data URL of the thumbnail image
 */
export async function generatePdfThumbnailFromUrl(
  url: string,
  maxWidth: number = 300
): Promise<string> {
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;
  
  return canvas.toDataURL('image/png');
}

/**
 * Convert a data URL to a Blob
 * @param dataUrl - The data URL to convert
 * @returns Blob object
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

/**
 * Get PDF page dimensions in mm (MediaBox only - client-side fallback)
 * Note: For accurate TrimBox/BleedBox, use the VPS page-boxes endpoint
 * @param file - The PDF file
 * @returns Object with width and height in mm
 */
export async function getPdfDimensionsMm(file: File): Promise<{ width_mm: number; height_mm: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  
  // PDF units are in points (1 pt = 1/72 inch, 1 inch = 25.4mm)
  const PT_TO_MM = 25.4 / 72;
  
  return {
    width_mm: viewport.width * PT_TO_MM,
    height_mm: viewport.height * PT_TO_MM,
  };
}

/**
 * Validation result from PDF dimension check
 */
export interface ValidationResult {
  status: 'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop';
  preflightStatus: 'passed' | 'warnings' | 'failed';
  issues: string[];
  actual_width_mm: number;
  actual_height_mm: number;
  expected_width_mm: number;
  expected_height_mm: number;
  can_auto_crop: boolean;
  // Which box was used for validation
  box_used?: 'trimbox' | 'mediabox' | 'client';
}

/**
 * Validate PDF dimensions against expected dieline specs
 * Now supports TrimBox-based validation when available
 * @param actualWidth - Actual PDF width in mm (from TrimBox or MediaBox)
 * @param actualHeight - Actual PDF height in mm (from TrimBox or MediaBox)
 * @param expectedTrimWidth - Expected trim width in mm
 * @param expectedTrimHeight - Expected trim height in mm
 * @param bleedLeft - Left bleed in mm
 * @param bleedRight - Right bleed in mm
 * @param bleedTop - Top bleed in mm
 * @param bleedBottom - Bottom bleed in mm
 * @param toleranceMm - Tolerance in mm (default 1.0)
 * @param isTrimBox - Whether the dimensions are from TrimBox (true) or MediaBox (false)
 * @returns ValidationResult with status and issues
 */
export function validatePdfDimensions(
  actualWidth: number,
  actualHeight: number,
  expectedTrimWidth: number,
  expectedTrimHeight: number,
  bleedLeft: number = 1.5,
  bleedRight: number = 1.5,
  bleedTop: number = 1.5,
  bleedBottom: number = 1.5,
  toleranceMm: number = 1.0,
  isTrimBox: boolean = false
): ValidationResult {
  const expectedWidthWithBleed = expectedTrimWidth + bleedLeft + bleedRight;
  const expectedHeightWithBleed = expectedTrimHeight + bleedTop + bleedBottom;
  
  const issues: string[] = [];
  let status: ValidationResult['status'] = 'passed';
  let can_auto_crop = false;

  // If dimensions are from TrimBox, compare directly to trim size
  if (isTrimBox) {
    const widthDiff = actualWidth - expectedTrimWidth;
    const heightDiff = actualHeight - expectedTrimHeight;
    
    // Check if TrimBox matches expected trim size (within tolerance)
    if (Math.abs(widthDiff) <= toleranceMm && Math.abs(heightDiff) <= toleranceMm) {
      status = 'passed';
      // TrimBox matches - artwork has correct trim size
    } else if (widthDiff > toleranceMm || heightDiff > toleranceMm) {
      status = 'too_large';
      issues.push(`TrimBox is ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm`);
      issues.push(`Expected ${expectedTrimWidth.toFixed(1)}×${expectedTrimHeight.toFixed(1)}mm`);
      issues.push('Trim area is larger than dieline specification');
    } else {
      status = 'too_small';
      issues.push(`TrimBox is ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm`);
      issues.push(`Expected ${expectedTrimWidth.toFixed(1)}×${expectedTrimHeight.toFixed(1)}mm`);
      issues.push('Trim area is smaller than dieline specification');
    }
    
    return {
      status,
      preflightStatus: status === 'passed' ? 'passed' : 'failed',
      issues,
      actual_width_mm: actualWidth,
      actual_height_mm: actualHeight,
      expected_width_mm: expectedTrimWidth,
      expected_height_mm: expectedTrimHeight,
      can_auto_crop,
      box_used: 'trimbox',
    };
  }

  // Original MediaBox validation logic (with bleed calculations)
  const widthDiff = actualWidth - expectedWidthWithBleed;
  const heightDiff = actualHeight - expectedHeightWithBleed;
  
  const widthDiffFromTrim = actualWidth - expectedTrimWidth;
  const heightDiffFromTrim = actualHeight - expectedTrimHeight;

  // Check if it matches with bleed (within tolerance)
  if (Math.abs(widthDiff) <= toleranceMm && Math.abs(heightDiff) <= toleranceMm) {
    status = 'passed';
  }
  // Check if it matches trim size exactly (no bleed)
  else if (Math.abs(widthDiffFromTrim) <= toleranceMm && Math.abs(heightDiffFromTrim) <= toleranceMm) {
    status = 'no_bleed';
    issues.push(`PDF is ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm (trim size only, no bleed)`);
    issues.push(`Expected ${expectedWidthWithBleed.toFixed(1)}×${expectedHeightWithBleed.toFixed(1)}mm with bleed`);
  }
  // Check if too large but can be cropped
  else if (widthDiff > toleranceMm || heightDiff > toleranceMm) {
    if (widthDiff <= 10 && heightDiff <= 10) {
      status = 'needs_crop';
      can_auto_crop = true;
      issues.push(`PDF is ${(widthDiff).toFixed(1)}mm wider and ${(heightDiff).toFixed(1)}mm taller than expected`);
      issues.push('Can be auto-cropped to fit');
    } else {
      status = 'too_large';
      issues.push(`PDF is ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm`);
      issues.push(`Expected ${expectedWidthWithBleed.toFixed(1)}×${expectedHeightWithBleed.toFixed(1)}mm`);
      issues.push('Too large to auto-crop safely');
    }
  }
  // Too small
  else {
    status = 'too_small';
    issues.push(`PDF is ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm`);
    issues.push(`Expected ${expectedWidthWithBleed.toFixed(1)}×${expectedHeightWithBleed.toFixed(1)}mm with bleed`);
    issues.push('Artwork is too small');
  }

  // Map status to preflight status
  const preflightStatus: ValidationResult['preflightStatus'] = 
    status === 'passed' ? 'passed' :
    status === 'needs_crop' || status === 'no_bleed' ? 'warnings' :
    'failed';

  return {
    status,
    preflightStatus,
    issues,
    actual_width_mm: actualWidth,
    actual_height_mm: actualHeight,
    expected_width_mm: expectedWidthWithBleed,
    expected_height_mm: expectedHeightWithBleed,
    can_auto_crop,
    box_used: 'mediabox',
  };
}
