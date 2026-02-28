

# Automated Proof Reminder Emails

## Overview

Build an automated system that sends reminder emails to clients who haven't responded to proof approval requests. Reminders are sent every 24 business hours (skipping weekends and public holidays), using the existing `is_working_day()` function already in the database.

## How It Works

1. A **pg_cron job** runs every hour during business hours (Mon-Fri, 8AM-5PM SAST)
2. It calls a new **edge function** (`proof-reminder`) that:
   - Finds all `proof_links` that are still pending (not used, not expired, not invalidated)
   - Checks if 24+ business hours have passed since the last email (initial send or last reminder)
   - Sends a branded reminder email via Resend using the existing email template
   - Updates tracking columns so we know when the last reminder was sent and how many have gone out
3. The reminder email uses the same branded template but with a "Reminder" subject line and slightly different copy emphasising the job won't be scheduled until approved

## What Gets Built

### 1. Database Migration
- Add `last_reminder_sent_at` (timestamptz) and `reminder_count` (integer, default 0) columns to `proof_links`
- Add `proof_reminder_enabled` (boolean, default true) to a settings table or keep it simple with a hard-coded default (we can make it configurable later)

### 2. New Edge Function: `proof-reminder`
- Queries `proof_links` for rows where:
  - `is_used = false` (not yet responded)
  - `expires_at > now()` (not expired)
  - `invalidated_at IS NULL` (not manually invalidated)
  - Last contact was 24+ business hours ago (using `is_working_day()` to skip weekends/holidays)
- For each qualifying link, sends a reminder email via Resend with the existing branded template
- Updates `last_reminder_sent_at` and increments `reminder_count`
- Returns a summary of how many reminders were sent

### 3. Cron Job (pg_cron + pg_net)
- Scheduled to run hourly on weekdays during business hours
- Calls the `proof-reminder` edge function via HTTP
- This ensures reminders only fire during working hours

## Technical Details

### Business Day Calculation
The function will use the existing `is_working_day()` database function to determine if a day counts. The logic:
- Take `COALESCE(last_reminder_sent_at, email_sent_at)` as the baseline
- Count forward through calendar days, only counting working days
- If 1+ full business day has elapsed, the proof is due for a reminder

### Email Content
- Subject: `Reminder: Proof Awaiting Your Approval - WO {wo_no}`
- Uses the existing `generateBrandedEmail()` template with `isReminder: true`
- Includes a note: "Your job will not be scheduled for production until the proof is approved"
- Shows how many days the proof has been waiting

### Safeguards
- Maximum 5 reminders per proof link (configurable) to avoid spamming
- Only sends during business hours (controlled by cron schedule)
- Respects the existing `invalidated_at` field for manually stopped proofs
- Edge function is idempotent -- safe to call multiple times

### Files to Create/Modify
1. **New migration**: Add `last_reminder_sent_at` and `reminder_count` to `proof_links`
2. **New edge function**: `supabase/functions/proof-reminder/index.ts`
3. **Update config**: Add `proof-reminder` to `supabase/config.toml` with `verify_jwt = false`
4. **Cron job**: SQL insert to set up the hourly pg_cron schedule (via read-query, not migration)

