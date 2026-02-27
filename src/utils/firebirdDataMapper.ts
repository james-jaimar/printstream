/**
 * Converts Firebird SP_DIGITAL_PRODUCTION rows into MatrixExcelData format
 * so they can be fed into the existing matrix parser pipeline.
 * 
 * Also applies the Pre-press qty fix: any row with Group="Pre-press" and qty=0 → qty=1
 */

import type { MatrixExcelData } from './excel/types';

export interface FirebirdRow {
  WOID: number | string;
  WODATE: string | null;
  COMPANY: string | null;
  CONTACT: string | null;
  REFERENCE: string | null;
  SIZE: string | null;
  ITEM_TYPE: string | null;
  GROUPS: string | null;
  DESCRIPTION: string | null;
  PROVIDER: string | null;
  QTY: number | string | null;
  WO_QTY: number | string | null;
  EMAIL: string | null;
}

/**
 * Map Firebird SP columns to the same structure as our matrix Excel files.
 * 
 * The matrix parser expects:
 *   headers[] and rows[][] with column indices for group, workOrder, description, qty, woQty
 * 
 * SP columns → Excel-equivalent headers:
 *   WOID → WO, WODATE → Date, COMPANY → Customer, CONTACT → Contact, 
 *   REFERENCE → Reference, SIZE → Size, ITEM_TYPE → Item Type,
 *   GROUPS → Groups, DESCRIPTION → Description, PROVIDER → Provider,
 *   QTY → Qty, WO_QTY → WO Qty, EMAIL → Email
 */
export function firebirdRowsToMatrixData(rows: FirebirdRow[]): MatrixExcelData {
  const headers = [
    'WO',        // 0 → workOrderColumn
    'Date',      // 1
    'Customer',  // 2
    'Contact',   // 3
    'Reference', // 4
    'Size',      // 5
    'Item Type', // 6
    'Groups',    // 7 → groupColumn
    'Description', // 8 → descriptionColumn
    'Provider',  // 9
    'Qty',       // 10 → qtyColumn
    'WO Qty',    // 11 → woQtyColumn
    'Email',     // 12
  ];

  // Detect unique groups
  const groupSet = new Set<string>();

  const matrixRows = rows.map(r => {
    const group = (r.GROUPS || '').trim();
    if (group) groupSet.add(group);

    // Pre-press qty fix: force qty to 1 if group is pre-press and qty is 0
    let qty = parseFloat(String(r.QTY ?? 0));
    const isPrepress = /pre-?press/i.test(group);
    if (isPrepress && qty === 0) {
      qty = 1;
    }

    return [
      String(r.WOID ?? ''),           // 0 WO
      r.WODATE ?? '',                  // 1 Date
      (r.COMPANY ?? '').trim(),        // 2 Customer
      (r.CONTACT ?? '').trim(),        // 3 Contact
      (r.REFERENCE ?? '').trim(),      // 4 Reference
      (r.SIZE ?? '').trim(),           // 5 Size
      (r.ITEM_TYPE ?? '').trim(),      // 6 Item Type
      group,                           // 7 Groups
      (r.DESCRIPTION ?? '').trim(),    // 8 Description
      (r.PROVIDER ?? '').trim(),       // 9 Provider
      String(qty),                     // 10 Qty
      String(r.WO_QTY ?? 0),          // 11 WO Qty
      (r.EMAIL ?? '').trim(),          // 12 Email
    ];
  });

  return {
    headers,
    rows: matrixRows,
    groupColumn: 7,
    workOrderColumn: 0,
    descriptionColumn: 8,
    qtyColumn: 10,
    woQtyColumn: 11,
    detectedGroups: Array.from(groupSet),
  };
}
