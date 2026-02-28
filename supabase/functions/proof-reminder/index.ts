import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)

const LOGO_URL = 'https://printstream.impressweb.co.za/impress-logo-colour.png';
const PRODUCTION_DOMAIN = 'https://printstream.impressweb.co.za';
const MAX_REMINDERS = 5;

// Branded reminder email template (matches handle-proof-approval template)
const generateReminderEmail = (params: {
  clientName: string;
  woNumber: string;
  proofUrl: string;
  daysSinceProof: number;
  reminderNumber: number;
}) => {
  const { clientName, woNumber, proofUrl, daysSinceProof, reminderNumber } = params;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reminder: Proof Awaiting Approval</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
              <!-- Header with brand color -->
              <tr>
                <td style="background-color: #00B8D4; padding: 30px 40px; text-align: center;">
                  <img src="${LOGO_URL}" alt="Impress Print Logo" style="height: 50px; width: auto; display: block; margin: 0 auto 10px;" />
                  <h1 style="color: #ffffff; font-size: 22px; font-weight: 500; margin: 0; padding: 0;">
                    Online Approval System
                  </h1>
                </td>
              </tr>
              
              <!-- Main content -->
              <tr>
                <td style="padding: 40px 40px 30px 40px;">
                  <h2 style="color: #1a1a1a; font-size: 22px; font-weight: 600; margin: 0 0 20px 0;">
                    Reminder: Your proof is awaiting approval
                  </h2>
                  
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Hello ${clientName},
                  </p>
                  
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    This is a friendly reminder that your proof for Work Order <strong>${woNumber}</strong> has been waiting for your approval for <strong>${daysSinceProof} business day${daysSinceProof !== 1 ? 's' : ''}</strong>.
                  </p>

                  <!-- Important notice -->
                  <div style="background-color: #FFF3CD; border-left: 4px solid #FFC107; padding: 16px 20px; margin: 0 0 25px 0;">
                    <p style="color: #856404; font-size: 15px; line-height: 1.6; margin: 0; font-weight: 500;">
                      ⚠️ Please note: Your job will not be scheduled for production until the proof is approved.
                    </p>
                  </div>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${proofUrl}" style="background-color: #00B8D4; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                          Review &amp; Approve Proof
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                    Or copy and paste this link into your browser:
                  </p>
                  <p style="color: #00B8D4; font-size: 14px; line-height: 1.6; margin: 5px 0 25px 0; word-break: break-all;">
                    <a href="${proofUrl}" style="color: #00B8D4; text-decoration: none;">${proofUrl}</a>
                  </p>

                  <div style="background-color: #f8f9fa; border-left: 4px solid #00B8D4; padding: 20px; margin: 25px 0;">
                    <p style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
                      Next Steps:
                    </p>
                    <ul style="color: #333333; font-size: 15px; line-height: 1.8; margin: 0; padding-left: 20px;">
                      <li>Review the proof carefully</li>
                      <li>Click "Approve" if everything looks good — we'll schedule your job immediately</li>
                      <li>Click "Request Changes" if you need any modifications</li>
                    </ul>
                  </div>
                  
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
                    Thank you for your business!
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 25px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
                  <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0;">
                    <strong style="color: #1a1a1a;">PrintStream by ImpressWeb</strong>
                  </p>
                  <p style="color: #999999; font-size: 12px; line-height: 1.6; margin: 8px 0 0 0;">
                    Professional printing services you can trust
                  </p>
                  <p style="color: #bbbbbb; font-size: 11px; margin: 8px 0 0 0;">
                    Reminder ${reminderNumber} of ${MAX_REMINDERS}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔔 Proof reminder job starting...');

    // Step 1: Get all pending proof links that haven't been used/expired/invalidated
    // and haven't hit the max reminder count
    const { data: pendingProofs, error: queryError } = await supabase
      .from('proof_links')
      .select(`
        id,
        token,
        job_id,
        stage_instance_id,
        email_sent_at,
        last_reminder_sent_at,
        reminder_count,
        expires_at,
        production_jobs!inner(wo_no, customer, contact_email),
        job_stage_instances!inner(client_email, client_name)
      `)
      .eq('is_used', false)
      .is('invalidated_at', null)
      .gt('expires_at', new Date().toISOString())
      .lt('reminder_count', MAX_REMINDERS);

    if (queryError) {
      console.error('❌ Error querying pending proofs:', queryError);
      throw queryError;
    }

    if (!pendingProofs || pendingProofs.length === 0) {
      console.log('✅ No pending proofs need reminders');
      return new Response(
        JSON.stringify({ reminders_sent: 0, message: 'No pending proofs need reminders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${pendingProofs.length} pending proof(s) to check`);

    // Step 2: For each pending proof, check if 24+ business hours have elapsed
    let remindersSent = 0;
    const results: Array<{ woNo: string; sent: boolean; reason?: string }> = [];

    for (const proof of pendingProofs) {
      const woNo = proof.production_jobs?.wo_no || 'N/A';
      const baseline = proof.last_reminder_sent_at || proof.email_sent_at;

      if (!baseline) {
        console.log(`⏭️ WO ${woNo}: No baseline timestamp (email never sent), skipping`);
        results.push({ woNo, sent: false, reason: 'no_baseline' });
        continue;
      }

      // Use the database function is_working_day() to count business days
      // We call a custom RPC to count working days between baseline and now
      const { data: businessHours, error: calcError } = await supabase
        .rpc('count_business_hours_since', { p_since: baseline });

      if (calcError) {
        // Fallback: calculate in JS if RPC doesn't exist yet
        console.warn(`⚠️ WO ${woNo}: RPC count_business_hours_since failed, using JS fallback:`, calcError.message);
        
        const baselineDate = new Date(baseline);
        const now = new Date();
        let businessDayCount = 0;
        const current = new Date(baselineDate);
        current.setDate(current.getDate() + 1); // Start counting from next day

        while (current <= now) {
          const dayOfWeek = current.getDay();
          // Skip weekends (0 = Sunday, 6 = Saturday)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Check if it's a public holiday via DB
            const dateStr = current.toISOString().split('T')[0];
            const { data: isHoliday } = await supabase
              .from('public_holidays')
              .select('id')
              .eq('date', dateStr)
              .eq('is_active', true)
              .maybeSingle();
            
            if (!isHoliday) {
              businessDayCount++;
            }
          }
          current.setDate(current.getDate() + 1);
        }

        if (businessDayCount < 1) {
          console.log(`⏭️ WO ${woNo}: Only ${businessDayCount} business day(s) since last contact, skipping`);
          results.push({ woNo, sent: false, reason: `only_${businessDayCount}_business_days` });
          continue;
        }

        // Falls through to send reminder
        console.log(`📧 WO ${woNo}: ${businessDayCount} business day(s) elapsed — sending reminder`);
      } else {
        // RPC returned the count
        if (businessHours < 24) {
          console.log(`⏭️ WO ${woNo}: Only ${businessHours}h business hours since last contact, need 24h`);
          results.push({ woNo, sent: false, reason: `only_${businessHours}h` });
          continue;
        }
        console.log(`📧 WO ${woNo}: ${businessHours}h business hours elapsed — sending reminder`);
      }

      // Step 3: Send reminder email
      const clientEmail = proof.job_stage_instances?.client_email || proof.production_jobs?.contact_email;
      const clientName = proof.job_stage_instances?.client_name || proof.production_jobs?.customer || 'valued client';

      if (!clientEmail) {
        console.log(`⏭️ WO ${woNo}: No client email, skipping`);
        results.push({ woNo, sent: false, reason: 'no_email' });
        continue;
      }

      // Calculate days since proof was first sent
      const firstSentAt = new Date(proof.email_sent_at);
      const now = new Date();
      const totalDaysElapsed = Math.floor((now.getTime() - firstSentAt.getTime()) / (1000 * 60 * 60 * 24));
      // Rough business days estimate for display
      const approxBusinessDays = Math.max(1, Math.floor(totalDaysElapsed * 5 / 7));

      const proofUrl = `${PRODUCTION_DOMAIN}/proof/${proof.token}`;
      const newReminderCount = (proof.reminder_count || 0) + 1;

      try {
        const emailResult = await resend.emails.send({
          from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
          to: [clientEmail],
          subject: `Reminder: Proof Awaiting Your Approval - WO ${woNo}`,
          html: generateReminderEmail({
            clientName,
            woNumber: woNo,
            proofUrl,
            daysSinceProof: approxBusinessDays,
            reminderNumber: newReminderCount,
          }),
        });

        console.log(`✅ Reminder #${newReminderCount} sent for WO ${woNo} to ${clientEmail}`, emailResult);

        // Step 4: Update tracking columns
        const { error: updateError } = await supabase
          .from('proof_links')
          .update({
            last_reminder_sent_at: new Date().toISOString(),
            reminder_count: newReminderCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', proof.id);

        if (updateError) {
          console.error(`❌ Failed to update reminder tracking for WO ${woNo}:`, updateError);
        }

        remindersSent++;
        results.push({ woNo, sent: true });
      } catch (emailError: any) {
        console.error(`❌ Failed to send reminder for WO ${woNo}:`, emailError?.message);
        results.push({ woNo, sent: false, reason: emailError?.message });
      }
    }

    console.log(`🔔 Proof reminder job complete: ${remindersSent} reminder(s) sent out of ${pendingProofs.length} checked`);

    return new Response(
      JSON.stringify({
        reminders_sent: remindersSent,
        total_checked: pendingProofs.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Proof reminder error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
