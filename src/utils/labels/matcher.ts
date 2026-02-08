/**
 * Dieline and Substrate Matcher
 * Intelligent matching of Excel data to existing dielines and substrates
 */

import type { LabelDieline, LabelStock } from '@/types/labels';
import type { ParsedLabelOrder, DielineMatch, SubstrateMatch } from './types';

// Substrate type aliases for fuzzy matching
const SUBSTRATE_ALIASES: Record<string, string[]> = {
  'Paper': ['paper', 'uncoated', 'offset', 'vellum', 'kraft'],
  'PP': ['pp', 'polypropylene', 'bopp', 'opp'],
  'PE': ['pe', 'polyethylene', 'ldpe', 'hdpe'],
  'PET': ['pet', 'polyester', 'mylar'],
  'Vinyl': ['vinyl', 'pvc', 'polymeric', 'cast', 'calendered']
};

// Finish aliases for fuzzy matching
const FINISH_ALIASES: Record<string, string[]> = {
  'Gloss': ['gloss', 'glossy', 'shiny', 'high gloss'],
  'Matt': ['matt', 'matte', 'satin', 'silk'],
  'Uncoated': ['uncoated', 'natural', 'plain']
};

/**
 * Match a parsed order to existing dielines based on dimensions
 */
export function matchDieline(
  order: ParsedLabelOrder,
  availableDielines: LabelDieline[]
): DielineMatch | null {
  if (!order.label_width_mm || !order.label_height_mm) {
    return null;
  }
  
  const targetWidth = order.label_width_mm;
  const targetHeight = order.label_height_mm;
  const targetRollWidth = order.roll_width_mm;
  
  let bestMatch: DielineMatch | null = null;
  let bestScore = 0;
  
  for (const dieline of availableDielines) {
    if (!dieline.is_active) continue;
    
    let score = 0;
    const reasons: string[] = [];
    
    // Exact dimension match (highest confidence)
    if (dieline.label_width_mm === targetWidth && dieline.label_height_mm === targetHeight) {
      score += 50;
      reasons.push('Exact label size match');
    } 
    // Close dimension match (within 2mm tolerance)
    else if (
      Math.abs(dieline.label_width_mm - targetWidth) <= 2 &&
      Math.abs(dieline.label_height_mm - targetHeight) <= 2
    ) {
      score += 30;
      reasons.push('Close label size match (±2mm)');
    } else {
      continue; // Skip if dimensions don't match at all
    }
    
    // Roll width match
    if (targetRollWidth && dieline.roll_width_mm === targetRollWidth) {
      score += 30;
      reasons.push('Roll width match');
    } else if (targetRollWidth && dieline.roll_width_mm >= targetRollWidth) {
      score += 15;
      reasons.push('Compatible roll width');
    }
    
    // Prefer non-custom dielines
    if (!dieline.is_custom) {
      score += 10;
      reasons.push('Standard dieline');
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        dieline_id: dieline.id,
        dieline_name: dieline.name,
        confidence: Math.min(100, score),
        match_reason: reasons.join('; ')
      };
    }
  }
  
  return bestMatch;
}

/**
 * Match a parsed order to existing substrates based on type and finish
 */
export function matchSubstrate(
  order: ParsedLabelOrder,
  availableSubstrates: LabelStock[]
): SubstrateMatch | null {
  if (!order.substrate_type) {
    return null;
  }
  
  const targetType = order.substrate_type.toLowerCase();
  const targetFinish = order.substrate_finish?.toLowerCase();
  const targetRollWidth = order.roll_width_mm;
  
  let bestMatch: SubstrateMatch | null = null;
  let bestScore = 0;
  
  for (const substrate of availableSubstrates) {
    if (!substrate.is_active) continue;
    
    let score = 0;
    const reasons: string[] = [];
    
    // Check substrate type match
    const typeAliases = SUBSTRATE_ALIASES[substrate.substrate_type] || [];
    const typeMatches = typeAliases.some(alias => targetType.includes(alias));
    
    if (typeMatches || substrate.substrate_type.toLowerCase() === targetType) {
      score += 40;
      reasons.push(`Substrate type: ${substrate.substrate_type}`);
    } else if (substrate.name.toLowerCase().includes(targetType)) {
      score += 25;
      reasons.push(`Name contains: ${targetType}`);
    } else {
      continue; // Skip if substrate type doesn't match
    }
    
    // Check finish match
    if (targetFinish) {
      const finishAliases = FINISH_ALIASES[substrate.finish] || [];
      const finishMatches = finishAliases.some(alias => targetFinish.includes(alias));
      
      if (finishMatches || substrate.finish.toLowerCase() === targetFinish) {
        score += 30;
        reasons.push(`Finish: ${substrate.finish}`);
      }
    }
    
    // Check roll width compatibility
    if (targetRollWidth && substrate.width_mm >= targetRollWidth) {
      if (substrate.width_mm === targetRollWidth) {
        score += 20;
        reasons.push('Exact width match');
      } else {
        score += 10;
        reasons.push('Width compatible');
      }
    }
    
    // Prefer substrates with stock available
    if (substrate.current_stock_meters > 0) {
      score += 5;
      reasons.push('In stock');
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        substrate_id: substrate.id,
        substrate_name: substrate.name,
        confidence: Math.min(100, score),
        match_reason: reasons.join('; ')
      };
    }
  }
  
  return bestMatch;
}

/**
 * Suggest a new dieline creation if no match found
 */
export function suggestDielineCreation(order: ParsedLabelOrder): Partial<LabelDieline> | null {
  if (!order.label_width_mm || !order.label_height_mm) {
    return null;
  }
  
  // Calculate columns based on roll width
  const rollWidth = order.roll_width_mm || 250;
  const gap = 2; // Default 2mm gap
  const columnsAcross = Math.floor(rollWidth / (order.label_width_mm + gap));
  
  return {
    name: `${order.label_width_mm}x${order.label_height_mm}mm (${order.customer_name})`,
    roll_width_mm: rollWidth,
    label_width_mm: order.label_width_mm,
    label_height_mm: order.label_height_mm,
    columns_across: Math.max(1, columnsAcross),
    rows_around: 1,
    horizontal_gap_mm: gap,
    vertical_gap_mm: gap,
    is_custom: true
  };
}
