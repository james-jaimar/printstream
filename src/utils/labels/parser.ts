/**
 * Quickeasy Label Excel Parser
 * Parses Excel files exported from Quickeasy MIS for label orders
 */

import * as XLSX from "xlsx";
import type { ParsedLabelOrder, ParsedLabelItem, ParsedLabelData, LabelImportStats } from './types';
import { createLabelColumnMap, safeGetCellValue } from './columnMapper';
import { ExcelImportDebugger } from '../excel/debugger';

// Parse date from various Excel formats
const formatLabelDate = (dateValue: any): string | null => {
  if (!dateValue) return null;
  
  // Handle Excel serial date numbers
  if (typeof dateValue === 'number') {
    const date = XLSX.SSF.parse_date_code(dateValue);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }
  
  // Handle string dates
  const dateStr = String(dateValue).trim();
  
  // Try various date formats
  const datePatterns = [
    /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
  ];
  
  for (const pattern of datePatterns) {
    const match = dateStr.match(pattern);
    if (match) {
      // Handle different patterns
      if (pattern === datePatterns[0]) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      } else {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
    }
  }
  
  return null;
};

// Parse dimension value (handles "50mm", "50", etc.)
const parseDimension = (value: any): number | undefined => {
  if (!value) return undefined;
  const str = String(value).replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
};

// Generate WO number if not present
const generateWoNo = (customer: string, index: number): string => {
  const prefix = customer.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `LBL-${prefix}-${datePart}-${String(index + 1).padStart(3, '0')}`;
};

export const parseLabelExcelFile = async (
  file: File, 
  logger: ExcelImportDebugger
): Promise<ParsedLabelData> => {
  logger.addDebugInfo(`Starting label Excel import: ${file.name}`);
  
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  logger.addDebugInfo(`Sheet range: ${range.s.r} to ${range.e.r} rows`);
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  
  if (jsonData.length < 2) {
    throw new Error("Excel file appears to be empty or has no data rows");
  }
  
  const headers = jsonData[0] as string[];
  logger.addDebugInfo(`Headers: ${JSON.stringify(headers)}`);
  
  const columnMap = createLabelColumnMap(headers, logger);
  logger.addDebugInfo(`Column mapping: ${JSON.stringify(columnMap)}`);
  
  const dataRows = jsonData.slice(1) as any[][];
  
  const stats: LabelImportStats = {
    totalRows: dataRows.length,
    ordersCreated: 0,
    itemsCreated: 0,
    skippedRows: 0,
    errors: [],
    warnings: [],
    matchedDielines: 0,
    matchedSubstrates: 0
  };
  
  // Group rows by WO number (or by customer if no WO)
  const orderMap = new Map<string, ParsedLabelOrder>();
  
  dataRows.forEach((row, index) => {
    // Skip empty rows
    if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
      stats.skippedRows++;
      return;
    }
    
    const customer = String(safeGetCellValue(row, columnMap.customer) || '').trim();
    const itemName = String(safeGetCellValue(row, columnMap.itemName) || '').trim();
    
    // Must have at least customer or item name
    if (!customer && !itemName) {
      logger.addDebugInfo(`Skipping row ${index + 2}: No customer or item name`);
      stats.skippedRows++;
      return;
    }
    
    // Get or generate WO number
    let woNo = String(safeGetCellValue(row, columnMap.woNo) || '').trim();
    if (!woNo) {
      woNo = generateWoNo(customer || 'UNKNOWN', index);
      logger.addDebugInfo(`Generated WO number for row ${index + 2}: ${woNo}`);
    }
    
    // Parse item data
    const quantity = parseInt(String(safeGetCellValue(row, columnMap.quantity) || '0').replace(/[^0-9]/g, '')) || 1;
    
    const item: ParsedLabelItem = {
      name: itemName || `Item ${index + 1}`,
      quantity,
      width_mm: parseDimension(safeGetCellValue(row, columnMap.labelWidth)),
      height_mm: parseDimension(safeGetCellValue(row, columnMap.labelHeight)),
      artwork_reference: String(safeGetCellValue(row, columnMap.artworkRef) || '').trim() || undefined,
      notes: String(safeGetCellValue(row, columnMap.notes) || '').trim() || undefined
    };
    
    // Check if order exists
    if (orderMap.has(woNo)) {
      // Add item to existing order
      const existingOrder = orderMap.get(woNo)!;
      existingOrder.items.push(item);
      stats.itemsCreated++;
    } else {
      // Create new order
      const order: ParsedLabelOrder = {
        wo_no: woNo,
        customer_name: customer || 'Unknown Customer',
        contact_name: String(safeGetCellValue(row, columnMap.contact) || '').trim() || undefined,
        contact_email: String(safeGetCellValue(row, columnMap.email) || '').trim() || undefined,
        due_date: formatLabelDate(safeGetCellValue(row, columnMap.dueDate)) || undefined,
        label_width_mm: parseDimension(safeGetCellValue(row, columnMap.labelWidth)),
        label_height_mm: parseDimension(safeGetCellValue(row, columnMap.labelHeight)),
        roll_width_mm: parseDimension(safeGetCellValue(row, columnMap.rollWidth)),
        substrate_type: String(safeGetCellValue(row, columnMap.substrate) || '').trim() || undefined,
        substrate_finish: String(safeGetCellValue(row, columnMap.finish) || '').trim() || undefined,
        items: [item],
        raw_notes: String(safeGetCellValue(row, columnMap.notes) || '').trim() || undefined
      };
      
      orderMap.set(woNo, order);
      stats.ordersCreated++;
      stats.itemsCreated++;
    }
  });
  
  const orders = Array.from(orderMap.values());
  
  logger.addDebugInfo(`Label import completed: ${stats.ordersCreated} orders, ${stats.itemsCreated} items`);
  
  return { orders, stats };
};
