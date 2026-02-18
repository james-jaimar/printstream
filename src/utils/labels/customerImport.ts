import * as XLSX from 'xlsx';

export interface ParsedContact {
  name: string;
  email: string; // semicolon-delimited if multiple
  phone: string | null;
  role: string | null;
}

export interface ParsedCompany {
  companyName: string;
  billingAddress: string | null;
  rep: string | null;
  contacts: ParsedContact[];
}

export interface CustomerImportParseResult {
  companies: ParsedCompany[];
  totalRows: number;
  skippedRows: number;
  multiEmailContacts: number;
}

/**
 * Normalize email string: split on ; , or space, trim, rejoin with ;
 */
function normalizeEmails(raw: string): string {
  const emails = raw
    .split(/[;,\s]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0 && e.includes('@'));
  return emails.join(';');
}

/**
 * Combine telephone and mobile into a single phone string
 */
function combinePhone(telephone?: string, mobile?: string): string | null {
  const tel = telephone?.trim() || '';
  const mob = mobile?.trim() || '';
  if (tel && mob && tel !== mob) return `${tel} / ${mob}`;
  return tel || mob || null;
}

/**
 * Find a column value by trying multiple header names (case-insensitive)
 */
function getCol(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().trim() === name.toLowerCase()) {
        const val = row[key];
        if (val !== undefined && val !== null) return String(val).trim();
      }
    }
  }
  return '';
}

/**
 * Parse an Excel file and return grouped company/contact data
 */
export async function parseCustomerExcel(file: File): Promise<CustomerImportParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const companyMap = new Map<string, ParsedCompany>();
  let skippedRows = 0;
  let multiEmailContacts = 0;

  for (const row of rows) {
    const companyName = getCol(row, 'Company');
    if (!companyName) { skippedRows++; continue; }

    const contactName = getCol(row, 'Contact');
    if (!contactName) { skippedRows++; continue; }

    const key = companyName.toLowerCase();

    if (!companyMap.has(key)) {
      const streetAddress = getCol(row, 'Street Address');
      const postAddress = getCol(row, 'Post Address');
      const rep = getCol(row, 'Rep');

      companyMap.set(key, {
        companyName,
        billingAddress: streetAddress || postAddress || null,
        rep: rep || null,
        contacts: [],
      });
    }

    const rawEmail = getCol(row, 'E-mail', 'Email', 'E-Mail');
    const email = rawEmail ? normalizeEmails(rawEmail) : '';
    if (email.includes(';')) multiEmailContacts++;

    const phone = combinePhone(
      getCol(row, 'Telephone', 'Tel'),
      getCol(row, 'Mobile', 'Cell')
    );
    const role = getCol(row, 'Position') || null;

    companyMap.get(key)!.contacts.push({ name: contactName, email, phone, role });
  }

  return {
    companies: Array.from(companyMap.values()),
    totalRows: rows.length,
    skippedRows,
    multiEmailContacts,
  };
}
