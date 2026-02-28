

# Proof Reminder Interval Control

## Overview

Add a configurable "Reminder Interval" setting to the **Proof Links** tab in Tracker Admin, allowing you to set how many business hours must pass before a reminder is sent (e.g. 4, 8, 24 hours). The edge function will read this setting at runtime instead of using a hardcoded 24-hour threshold.

## What You'll See

A new settings card at the top of the Proof Links tab with:
- A number input for "Reminder interval (business hours)" -- defaulting to 24
- A number input for "Max reminders" -- defaulting to 5
- A Save button that persists to the `app_settings` table
- Helper text explaining that 8 business hours = 1 working day

## Technical Detail

### 1. Database: Store settings in `app_settings`

Insert a new row into the existing `app_settings` table using `setting_type = 'proof_reminder'`:
- `product_type = 'reminder_interval_hours'`, `sla_target_days` repurposed to store the hour value (e.g. 8)
- `product_type = 'max_reminders'`, `sla_target_days` stores the max count (e.g. 5)

This reuses the existing table without any schema changes. The `sla_target_days` column is just an integer -- works fine for storing hours or counts.

### 2. Frontend: Add settings UI to `ProofLinkManagement.tsx`

Add a collapsible settings section above the proof links table with:
- Input for reminder interval (business hours)
- Input for max reminders
- Save button that upserts to `app_settings` with `setting_type = 'proof_reminder'`
- Load on mount from `app_settings`

### 3. Edge Function: Read settings dynamically

Update `supabase/functions/proof-reminder/index.ts` to:
- Query `app_settings` where `setting_type = 'proof_reminder'` at the start of each run
- Use the `reminder_interval_hours` value instead of the hardcoded `24`
- Use the `max_reminders` value instead of the hardcoded `MAX_REMINDERS = 5`
- Fall back to defaults (24h, 5 max) if no settings exist

### Files to Modify
1. `src/components/admin/ProofLinkManagement.tsx` -- add settings UI section
2. `supabase/functions/proof-reminder/index.ts` -- read settings from DB instead of hardcoded values

No database migration needed -- reuses the existing `app_settings` table.

