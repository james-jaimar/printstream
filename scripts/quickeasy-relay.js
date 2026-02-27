#!/usr/bin/env node
/**
 * QuickEasy Local Relay Script
 * 
 * Runs on your local network, queries Firebird directly (fast!),
 * and POSTs the JSON result to the quickeasy-receive Edge Function.
 * 
 * Prerequisites:
 *   npm install node-firebird
 * 
 * Usage:
 *   node quickeasy-relay.js                          # today's data
 *   node quickeasy-relay.js 2025-01-01 2025-01-31    # date range
 * 
 * Environment variables (set these or edit the defaults below):
 *   FIREBIRD_HOST, FIREBIRD_PORT, FIREBIRD_DATABASE, FIREBIRD_USER, FIREBIRD_PASSWORD
 *   SUPABASE_URL          — e.g. https://kgizusgqexmlfcqfjopk.supabase.co
 *   QUICKEASY_RELAY_SECRET — must match the secret stored in Supabase
 */

const Firebird = require('node-firebird');

const FB_OPTIONS = {
  host: process.env.FIREBIRD_HOST || '10.0.0.100',
  port: parseInt(process.env.FIREBIRD_PORT || '3050', 10),
  database: process.env.FIREBIRD_DATABASE || 'C:/QuickEasy/Data/ABORDATA.FDB',
  user: process.env.FIREBIRD_USER || 'SYSDBA',
  password: process.env.FIREBIRD_PASSWORD || 'masterkey',
  lowercase_keys: false,
  pageSize: 4096,
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kgizusgqexmlfcqfjopk.supabase.co';
const RELAY_SECRET = process.env.QUICKEASY_RELAY_SECRET || 'CHANGE_ME';

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = process.argv[2] || today;
  const endDate = process.argv[3] || today;

  console.log(`[relay] Querying Firebird for ${startDate} → ${endDate}...`);
  const t0 = Date.now();

  const db = await new Promise((resolve, reject) => {
    Firebird.attach(FB_OPTIONS, (err, db) => err ? reject(err) : resolve(db));
  });

  const sql = `SELECT * FROM SP_DIGITAL_PRODUCTION('${startDate}','${endDate}')`;
  const rows = await new Promise((resolve, reject) => {
    db.query(sql, [], (err, res) => err ? reject(err) : resolve(res || []));
  });

  try { db.detach(() => {}); } catch (_) {}
  console.log(`[relay] Got ${rows.length} rows in ${Date.now() - t0}ms`);

  // POST to Supabase
  const url = `${SUPABASE_URL}/functions/v1/quickeasy-receive`;
  console.log(`[relay] POSTing to ${url}...`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-relay-secret': RELAY_SECRET,
    },
    body: JSON.stringify({ startDate, endDate, rows }),
  });

  const result = await resp.json();
  if (!resp.ok) {
    console.error(`[relay] Failed (${resp.status}):`, result);
    process.exit(1);
  }

  console.log(`[relay] Success! runId=${result.runId}, ${result.rowCount} rows stored.`);
}

main().catch((err) => {
  console.error('[relay] Fatal error:', err);
  process.exit(1);
});
