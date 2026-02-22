import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  pdf_url: string;
  expected_trim_width_mm: number;
  expected_trim_height_mm: number;
  expected_bleed_left_mm?: number;
  expected_bleed_right_mm?: number;
  expected_bleed_top_mm?: number;
  expected_bleed_bottom_mm?: number;
  tolerance_mm?: number;
}

interface PdfDimensions {
  mediabox_width_mm: number;
  mediabox_height_mm: number;
  trimbox_width_mm: number | null;
  trimbox_height_mm: number | null;
  bleedbox_width_mm: number | null;
  bleedbox_height_mm: number | null;
}

type ValidationStatus = 'passed' | 'no_bleed' | 'too_large' | 'too_small' | 'needs_crop';

interface ValidationResult {
  status: ValidationStatus;
  issues: string[];
  can_auto_crop: boolean;
  crop_amount_mm: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null;
}

interface AnalysisResponse {
  success: boolean;
  dimensions?: PdfDimensions;
  validation?: ValidationResult;
  thumbnail_url?: string;
  error?: string;
}

const VPS_API_URL = 'https://pdf-api.jaimar.dev';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AnalysisRequest = await req.json();
    const {
      pdf_url,
      expected_trim_width_mm,
      expected_trim_height_mm,
      expected_bleed_left_mm = 1.5,
      expected_bleed_right_mm = 1.5,
      expected_bleed_top_mm = 1.5,
      expected_bleed_bottom_mm = 1.5,
      tolerance_mm = 1.0,
    } = body;

    if (!pdf_url || !expected_trim_width_mm || !expected_trim_height_mm) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expected full artwork size with bleed
    const expectedWidth = expected_trim_width_mm + expected_bleed_left_mm + expected_bleed_right_mm;
    const expectedHeight = expected_trim_height_mm + expected_bleed_top_mm + expected_bleed_bottom_mm;

    // Get PDF API key from secrets
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: secretData } = await supabase
      .from('_app_secrets')
      .select('value')
      .eq('key', 'VPS_PDF_API_KEY')
      .single();

    const apiKey = secretData?.value || Deno.env.get('VPS_PDF_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'VPS_PDF_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to call VPS API for PDF analysis, but handle failures gracefully
    let dimensions: PdfDimensions | null = null;
    let thumbnailUrl: string | undefined;
    let vpsAvailable = false;

    try {
      const vpsResponse = await fetch(`${VPS_API_URL}/analyze-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ pdf_url }),
      });

      if (vpsResponse.ok) {
        const vpsData = await vpsResponse.json();
        vpsAvailable = true;
        
        // Extract dimensions from VPS response (convert points to mm: 1 pt = 0.3528mm)
        const PT_TO_MM = 0.3528;
        dimensions = {
          mediabox_width_mm: (vpsData.mediabox?.width || 0) * PT_TO_MM,
          mediabox_height_mm: (vpsData.mediabox?.height || 0) * PT_TO_MM,
          trimbox_width_mm: vpsData.trimbox ? vpsData.trimbox.width * PT_TO_MM : null,
          trimbox_height_mm: vpsData.trimbox ? vpsData.trimbox.height * PT_TO_MM : null,
          bleedbox_width_mm: vpsData.bleedbox ? vpsData.bleedbox.width * PT_TO_MM : null,
          bleedbox_height_mm: vpsData.bleedbox ? vpsData.bleedbox.height * PT_TO_MM : null,
        };
        thumbnailUrl = vpsData.thumbnail_url;
      } else {
        console.warn('VPS API returned error, continuing without server-side analysis');
      }
    } catch (vpsError) {
      console.warn('VPS API unavailable, continuing without server-side analysis:', vpsError);
    }

    // If VPS is unavailable, return a pending status so client can handle it
    if (!dimensions) {
      const response: AnalysisResponse = {
        success: true,
        dimensions: {
          mediabox_width_mm: 0,
          mediabox_height_mm: 0,
          trimbox_width_mm: null,
          trimbox_height_mm: null,
          bleedbox_width_mm: null,
          bleedbox_height_mm: null,
        },
        validation: {
          status: 'pending' as ValidationStatus,
          issues: ['PDF analysis pending - dimensions will be validated client-side'],
          can_auto_crop: false,
          crop_amount_mm: null,
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  // Use actual PDF size (prefer bleedbox > mediabox for actual size)
  const actualWidth = dimensions.bleedbox_width_mm || dimensions.mediabox_width_mm;
  const actualHeight = dimensions.bleedbox_height_mm || dimensions.mediabox_height_mm;

  // Detect crop marks scenario: MediaBox >> BleedBox (or TrimBox)
  const targetBoxWidth = dimensions.bleedbox_width_mm || dimensions.trimbox_width_mm;
  const targetBoxHeight = dimensions.bleedbox_height_mm || dimensions.trimbox_height_mm;
  const hasCropMarks = targetBoxWidth && targetBoxHeight &&
    (dimensions.mediabox_width_mm - targetBoxWidth > 2) &&
    (dimensions.mediabox_height_mm - targetBoxHeight > 2);

  if (hasCropMarks) {
    // PDF has crop marks — flag for auto-crop to bleed
    const cropLeft = (dimensions.mediabox_width_mm - targetBoxWidth) / 2;
    const cropRight = cropLeft;
    const cropTop = (dimensions.mediabox_height_mm - targetBoxHeight) / 2;
    const cropBottom = cropTop;

    const cropValidation: ValidationResult = {
      status: 'needs_crop',
      issues: [
        `PDF has crop marks — MediaBox is ${dimensions.mediabox_width_mm.toFixed(1)}×${dimensions.mediabox_height_mm.toFixed(1)}mm`,
        `Will crop to BleedBox: ${targetBoxWidth.toFixed(1)}×${targetBoxHeight.toFixed(1)}mm`,
        `Removing ${cropLeft.toFixed(1)}mm from each side`,
      ],
      can_auto_crop: true,
      crop_amount_mm: { left: cropLeft, right: cropRight, top: cropTop, bottom: cropBottom },
    };

    const response: AnalysisResponse = {
      success: true,
      dimensions,
      validation: cropValidation,
      thumbnail_url: thumbnailUrl,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate dimensions
  const validation = validateDimensions(
      actualWidth,
      actualHeight,
      expected_trim_width_mm,
      expected_trim_height_mm,
      expectedWidth,
      expectedHeight,
      tolerance_mm
    );

    const response: AnalysisResponse = {
      success: true,
      dimensions,
      validation,
      thumbnail_url: thumbnailUrl,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error analyzing PDF:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function validateDimensions(
  actualWidth: number,
  actualHeight: number,
  trimWidth: number,
  trimHeight: number,
  expectedWidth: number,
  expectedHeight: number,
  tolerance: number
): ValidationResult {
  const issues: string[] = [];
  let status: ValidationStatus = 'passed';
  let canAutoCrop = false;
  let cropAmount: ValidationResult['crop_amount_mm'] = null;

  const widthDiff = Math.abs(actualWidth - expectedWidth);
  const heightDiff = Math.abs(actualHeight - expectedHeight);
  
  // Check if PDF matches trim size exactly (no bleed)
  const matchesTrimExactly = 
    Math.abs(actualWidth - trimWidth) < 0.5 && 
    Math.abs(actualHeight - trimHeight) < 0.5;

  if (matchesTrimExactly) {
    status = 'no_bleed';
    issues.push(`No bleed detected - PDF matches trim size exactly (${trimWidth}×${trimHeight}mm)`);
    issues.push(`Expected artwork with bleed: ${expectedWidth.toFixed(1)}×${expectedHeight.toFixed(1)}mm`);
    return { status, issues, can_auto_crop: false, crop_amount_mm: null };
  }

  // Check if PDF is too small
  if (actualWidth < trimWidth - 0.5 || actualHeight < trimHeight - 0.5) {
    status = 'too_small';
    issues.push(`PDF is too small (${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm)`);
    issues.push(`Minimum size with trim: ${trimWidth}×${trimHeight}mm`);
    return { status, issues, can_auto_crop: false, crop_amount_mm: null };
  }

  // Check if PDF is correct size (within tolerance)
  if (widthDiff <= 0.5 && heightDiff <= 0.5) {
    status = 'passed';
    issues.push('PDF dimensions are correct');
    return { status, issues, can_auto_crop: false, crop_amount_mm: null };
  }

  // Check if PDF is slightly larger but within auto-crop tolerance
  const isLarger = actualWidth > expectedWidth || actualHeight > expectedHeight;
  const withinCropTolerance = widthDiff <= tolerance && heightDiff <= tolerance;

  if (isLarger && withinCropTolerance) {
    status = 'needs_crop';
    canAutoCrop = true;
    
    const excessWidth = actualWidth - expectedWidth;
    const excessHeight = actualHeight - expectedHeight;
    
    cropAmount = {
      left: excessWidth / 2,
      right: excessWidth / 2,
      top: excessHeight / 2,
      bottom: excessHeight / 2,
    };

    issues.push(`PDF is slightly larger than expected (${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm)`);
    issues.push(`Will auto-crop ${excessWidth.toFixed(1)}mm width and ${excessHeight.toFixed(1)}mm height`);
    return { status, issues, can_auto_crop: canAutoCrop, crop_amount_mm: cropAmount };
  }

  // PDF is too large
  if (isLarger) {
    status = 'too_large';
    issues.push(`PDF is too large (${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm)`);
    issues.push(`Expected: ${expectedWidth.toFixed(1)}×${expectedHeight.toFixed(1)}mm`);
    issues.push(`Exceeds tolerance of ${tolerance}mm - cannot auto-crop`);
    return { status, issues, can_auto_crop: false, crop_amount_mm: null };
  }

  // Default case - dimensions don't match
  status = 'needs_crop';
  issues.push(`PDF dimensions need adjustment`);
  issues.push(`Actual: ${actualWidth.toFixed(1)}×${actualHeight.toFixed(1)}mm`);
  issues.push(`Expected: ${expectedWidth.toFixed(1)}×${expectedHeight.toFixed(1)}mm`);
  
  return { status, issues, can_auto_crop: false, crop_amount_mm: null };
}
