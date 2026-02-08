/**
 * Label Import Service
 * Handles importing parsed label data into Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import type { LabelDieline, LabelStock, CreateLabelOrderInput, CreateLabelItemInput } from '@/types/labels';
import type { ParsedLabelOrder, ParsedLabelData, LabelImportStats, LabelImportOptions } from './types';
import { matchDieline, matchSubstrate } from './matcher';

interface ImportResult {
  success: boolean;
  stats: LabelImportStats;
  createdOrderIds: string[];
  errors: string[];
}

/**
 * Generate next order number in sequence
 */
async function generateOrderNumber(): Promise<string> {
  const today = new Date();
  const prefix = `LBL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  // Get latest order number with this prefix
  const { data: latestOrder } = await supabase
    .from('label_orders')
    .select('order_number')
    .like('order_number', `${prefix}%`)
    .order('order_number', { ascending: false })
    .limit(1)
    .single();
  
  let nextNumber = 1;
  if (latestOrder?.order_number) {
    const match = latestOrder.order_number.match(/-(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  
  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Check for duplicate orders by WO number
 */
async function checkDuplicates(woNumbers: string[]): Promise<Set<string>> {
  const { data } = await supabase
    .from('label_orders')
    .select('quickeasy_wo_no')
    .in('quickeasy_wo_no', woNumbers);
  
  return new Set((data || []).map(o => o.quickeasy_wo_no).filter(Boolean));
}

/**
 * Import a single order with its items
 */
async function importOrder(
  order: ParsedLabelOrder,
  dielines: LabelDieline[],
  substrates: LabelStock[],
  options: LabelImportOptions
): Promise<{ orderId: string | null; itemsCreated: number; error?: string }> {
  try {
    // Auto-match dieline if enabled
    let dielineId: string | null = null;
    if (options.autoMatchDielines) {
      const dielineMatch = matchDieline(order, dielines);
      if (dielineMatch && dielineMatch.confidence >= 50) {
        dielineId = dielineMatch.dieline_id;
      }
    }
    
    // Auto-match substrate if enabled
    let substrateId: string | null = null;
    if (options.autoMatchSubstrates) {
      const substrateMatch = matchSubstrate(order, substrates);
      if (substrateMatch && substrateMatch.confidence >= 50) {
        substrateId = substrateMatch.substrate_id;
      }
    }
    
    // Generate order number
    const orderNumber = await generateOrderNumber();
    
    // Calculate total labels
    const totalLabels = order.items.reduce((sum, item) => sum + item.quantity, 0);
    
    // Create order
    const { data: createdOrder, error: orderError } = await supabase
      .from('label_orders')
      .insert({
        order_number: orderNumber,
        quickeasy_wo_no: order.wo_no,
        customer_name: order.customer_name,
        contact_name: order.contact_name || null,
        contact_email: order.contact_email || null,
        due_date: order.due_date || null,
        dieline_id: dielineId,
        substrate_id: substrateId,
        roll_width_mm: order.roll_width_mm || null,
        total_label_count: totalLabels,
        notes: order.raw_notes || null,
        status: 'quote'
      })
      .select()
      .single();
    
    if (orderError || !createdOrder) {
      throw new Error(orderError?.message || 'Failed to create order');
    }
    
    // Create items
    const itemsToInsert = order.items.map((item, index) => ({
      order_id: createdOrder.id,
      item_number: index + 1,
      name: item.name,
      quantity: item.quantity,
      width_mm: item.width_mm || order.label_width_mm || null,
      height_mm: item.height_mm || order.label_height_mm || null,
      notes: item.notes || null,
      preflight_status: 'pending'
    }));
    
    const { error: itemsError } = await supabase
      .from('label_items')
      .insert(itemsToInsert);
    
    if (itemsError) {
      // Rollback: delete the order if items failed
      await supabase.from('label_orders').delete().eq('id', createdOrder.id);
      throw new Error(`Failed to create items: ${itemsError.message}`);
    }
    
    return { orderId: createdOrder.id, itemsCreated: order.items.length };
  } catch (error) {
    return { 
      orderId: null, 
      itemsCreated: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Main import function - imports all parsed orders
 */
export async function importLabelOrders(
  parsedData: ParsedLabelData,
  options: LabelImportOptions = {}
): Promise<ImportResult> {
  const { autoMatchDielines = true, autoMatchSubstrates = true, skipDuplicates = true } = options;
  
  const stats: LabelImportStats = {
    ...parsedData.stats,
    ordersCreated: 0,
    itemsCreated: 0,
    errors: [],
    warnings: [],
    matchedDielines: 0,
    matchedSubstrates: 0
  };
  
  const createdOrderIds: string[] = [];
  
  // Fetch available dielines and substrates for matching
  let dielines: LabelDieline[] = [];
  let substrates: LabelStock[] = [];
  
  if (autoMatchDielines) {
    const { data } = await supabase
      .from('label_dielines')
      .select('*')
      .eq('is_active', true);
    dielines = (data || []) as LabelDieline[];
  }
  
  if (autoMatchSubstrates) {
    const { data } = await supabase
      .from('label_stock')
      .select('*')
      .eq('is_active', true);
    substrates = (data || []) as LabelStock[];
  }
  
  // Check for duplicates if enabled
  let existingWoNumbers = new Set<string>();
  if (skipDuplicates) {
    const woNumbers = parsedData.orders.map(o => o.wo_no);
    existingWoNumbers = await checkDuplicates(woNumbers);
  }
  
  // Process each order
  for (const order of parsedData.orders) {
    // Skip duplicates
    if (skipDuplicates && existingWoNumbers.has(order.wo_no)) {
      stats.warnings.push(`Skipped duplicate WO: ${order.wo_no}`);
      stats.skippedRows++;
      continue;
    }
    
    const result = await importOrder(order, dielines, substrates, options);
    
    if (result.orderId) {
      createdOrderIds.push(result.orderId);
      stats.ordersCreated++;
      stats.itemsCreated += result.itemsCreated;
    } else if (result.error) {
      stats.errors.push(`${order.wo_no}: ${result.error}`);
    }
  }
  
  return {
    success: stats.errors.length === 0,
    stats,
    createdOrderIds,
    errors: stats.errors
  };
}
