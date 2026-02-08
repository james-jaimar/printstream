/**
 * Column Mapper for Quickeasy Label Exports
 * Maps Excel columns to label data fields
 */

import type { LabelColumnMap } from './types';

interface Logger {
  addDebugInfo: (message: string) => void;
}

const findColumnIndex = (headers: string[], possibleNames: string[], logger: Logger): number => {
  const headerLower = headers.map(h => String(h || '').toLowerCase().trim());
  
  for (const name of possibleNames) {
    const index = headerLower.findIndex(h => h.includes(name.toLowerCase()));
    if (index !== -1) {
      logger.addDebugInfo(`Found column "${name}" at index ${index} (header: "${headers[index]}")`);
      return index;
    }
  }
  
  return -1;
};

export const createLabelColumnMap = (headers: string[], logger: Logger): LabelColumnMap => {
  return {
    // Order identification
    woNo: findColumnIndex(headers, ['wo no', 'work order', 'wo number', 'job no', 'job number'], logger),
    customer: findColumnIndex(headers, ['customer', 'client', 'company'], logger),
    contact: findColumnIndex(headers, ['contact', 'contact name', 'attn'], logger),
    email: findColumnIndex(headers, ['email', 'e-mail', 'contact email'], logger),
    dueDate: findColumnIndex(headers, ['due date', 'due', 'delivery date', 'required date'], logger),
    
    // Item details
    itemName: findColumnIndex(headers, ['item', 'item name', 'description', 'product', 'label name'], logger),
    quantity: findColumnIndex(headers, ['qty', 'quantity', 'order qty', 'labels'], logger),
    
    // Label specifications
    labelWidth: findColumnIndex(headers, ['label width', 'width', 'label w', 'w mm'], logger),
    labelHeight: findColumnIndex(headers, ['label height', 'height', 'label h', 'h mm'], logger),
    rollWidth: findColumnIndex(headers, ['roll width', 'web width', 'roll', 'material width'], logger),
    
    // Material
    substrate: findColumnIndex(headers, ['substrate', 'material', 'stock', 'paper', 'film'], logger),
    finish: findColumnIndex(headers, ['finish', 'coating', 'lamination', 'surface'], logger),
    
    // Additional info
    notes: findColumnIndex(headers, ['notes', 'remarks', 'comments', 'special instructions'], logger),
    artworkRef: findColumnIndex(headers, ['artwork', 'art ref', 'file', 'artwork reference', 'pdf'], logger)
  };
};

export const safeGetCellValue = (row: any[], index: number): any => {
  if (index === -1 || !row || index >= row.length) return '';
  const value = row[index];
  return value === null || value === undefined ? '' : value;
};
