
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)

// Logo hosted on production domain for reliable delivery across all email clients
const LOGO_URL = 'https://printstream.impressweb.co.za/impress-logo-colour.png';

console.log('📸 Logo configured from production domain:', LOGO_URL);

// Branded email template for Impress Print
const generateBrandedEmail = (params: {
  heading: string;
  clientName: string;
  woNumber: string;
  proofUrl: string;
  expiresAt?: Date;
  message: string;
  includeNextSteps?: boolean;
  isReminder?: boolean;
}) => {
  const { heading, clientName, woNumber, proofUrl, expiresAt, message, includeNextSteps, isReminder } = params;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${heading}</title>
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
                    ${heading}
                  </h2>
                  
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                    Hello ${clientName},
                  </p>
                  
                  <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    ${message}
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" style="margin: 30px 0;">
                    <tr>
                      <td align="center">
                        <a href="${proofUrl}" style="background-color: #00B8D4; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                          View Proof
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
                  
                  ${expiresAt ? `
                    <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                      ⏰ This link will expire on <strong>${expiresAt.toLocaleDateString('en-ZA', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}</strong>.
                    </p>
                  ` : ''}
                  
                  ${includeNextSteps ? `
                    <div style="background-color: #f8f9fa; border-left: 4px solid #00B8D4; padding: 20px; margin: 25px 0;">
                      <p style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
                        Next Steps:
                      </p>
                      <ul style="color: #333333; font-size: 15px; line-height: 1.8; margin: 0; padding-left: 20px;">
                        <li>Review the proof carefully</li>
                        <li>Click "Approve" if everything looks good - we'll schedule your job immediately</li>
                        <li>Click "Request Changes" if you need any modifications</li>
                      </ul>
                    </div>
                  ` : ''}
                  
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (action === 'generate-link') {
      // Generate proof link for stage instance
      const { stageInstanceId } = await req.json();
      
      console.log('🔗 Generating proof link for stage instance:', stageInstanceId);

      // Get stage instance details
      const { data: stageInstance, error: stageError } = await supabase
        .from('job_stage_instances')
        .select(`
          *,
          production_stage:production_stages(name)
        `)
        .eq('id', stageInstanceId)
        .in('status', ['active', 'changes_requested'])
        .single();

      if (stageError || !stageInstance) {
        console.error('❌ Stage instance not found:', stageError);
        return new Response(
          JSON.stringify({ error: 'Stage instance not found or not in a valid state for proof generation' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Verify this is a proof stage
      const isProofStage = stageInstance.production_stage?.name?.toLowerCase().includes('proof');
      if (!isProofStage) {
        console.error('❌ Not a proof stage:', stageInstance.production_stage?.name);
        return new Response(
          JSON.stringify({ error: 'Can only generate proof links for proof stages' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Generate secure token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

      // Get current user if available, but don't fail if not
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id || null;

      // Create proof link
      const { data: proofLink, error: linkError } = await supabase
        .from('proof_links')
        .insert({
          job_id: stageInstance.job_id,
          job_table_name: stageInstance.job_table_name,
          stage_instance_id: stageInstanceId,
          token,
          expires_at: expiresAt.toISOString(),
          created_by: currentUserId // This can now be null
        })
        .select()
        .single();

      if (linkError) {
        console.error('❌ Failed to create proof link:', linkError);
        return new Response(
          JSON.stringify({ error: 'Failed to create proof link' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // CRITICAL FIX: Update stage instance to show proof is awaiting sign off
      // This is what the UI checks to display "Proof Sent" status
      const { error: updateError } = await supabase
        .from('job_stage_instances')
        .update({
          status: 'awaiting_approval',
          proof_emailed_at: new Date().toISOString(),
          notes: 'Proof sent to client, awaiting sign off',
          updated_at: new Date().toISOString()
        })
        .eq('id', stageInstanceId);

      if (updateError) {
        console.error('❌ Failed to update stage instance status:', updateError);
        // Don't fail the whole operation, but log the error
      } else {
        console.log('✅ Stage instance status updated to awaiting_approval with proof_emailed_at timestamp');
      }

      // Generate proof URL using production domain
      const PRODUCTION_DOMAIN = 'https://printstream.impressweb.co.za';
      const proofUrl = `${PRODUCTION_DOMAIN}/proof/${token}`;
      console.log('🔗 Proof URL generated:', proofUrl);
      
      // Get job details for email - check both production_jobs and stage instance
      const { data: jobDetails } = await supabase
        .from('production_jobs')
        .select('wo_no, customer, contact_email')
        .eq('id', stageInstance.job_id)
        .single();
      
      // Get client email/name from stage instance (set by ProofUploadDialog)
      const clientEmail = stageInstance.client_email || jobDetails?.contact_email;
      const clientName = stageInstance.client_name || jobDetails?.customer;
      
      console.log('📧 Email details:', { 
        clientEmail, 
        clientName, 
        wo_no: jobDetails?.wo_no,
        from_stage: !!stageInstance.client_email,
        from_job: !!jobDetails?.contact_email 
      });
      
      // Send email notification if client email exists
      if (clientEmail) {
        try {
          console.log('📤 Attempting to send proof email via Resend...');
          
          const emailResult = await resend.emails.send({
            from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
            to: [clientEmail],
            subject: `Proof Ready for Review - WO ${jobDetails?.wo_no || 'N/A'}`,
            html: generateBrandedEmail({
              heading: 'Your proof is ready for review',
              clientName: clientName || 'valued client',
              woNumber: jobDetails?.wo_no || 'N/A',
              proofUrl,
              expiresAt,
              message: `Your proof for Work Order <strong>${jobDetails?.wo_no || 'N/A'}</strong> is now ready for your review and approval.`,
              includeNextSteps: true
            })
          });
          
          console.log('✅ Proof email sent successfully!', emailResult);
          console.log('   📧 To:', clientEmail);
          console.log('   📋 WO:', jobDetails?.wo_no);
          
          // Update proof_links to track email sent
          await supabase
            .from('proof_links')
            .update({ 
              email_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', proofLink.id);
            
        } catch (emailError: any) {
          console.error('❌ FAILED to send proof email:', emailError);
          console.error('   Error details:', {
            message: emailError?.message,
            name: emailError?.name,
            stack: emailError?.stack
          });
          
          // Log to proof_links for tracking
          await supabase
            .from('proof_links')
            .update({ 
              email_send_error: emailError?.message || 'Unknown error',
              updated_at: new Date().toISOString()
            })
            .eq('id', proofLink.id);
          
          // Don't fail the whole operation if email fails
        }
      } else {
        console.warn('⚠️ No client email available - proof link created but email NOT sent');
        console.warn('   Stage client_email:', stageInstance.client_email);
        console.warn('   Job contact_email:', jobDetails?.contact_email);
      }
      
      console.log('✅ Proof link generated successfully');
      return new Response(
        JSON.stringify({ 
          proofUrl,
          token,
          expiresAt: expiresAt.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW ENDPOINT: Get schedule estimate
    if (url.pathname.endsWith('/get-schedule-estimate')) {
      const { jobId } = await req.json();
      
      // Query last stage's scheduled_end_at
      const { data: lastStage, error: stageError } = await supabase
        .from('job_stage_instances')
        .select('scheduled_end_at')
        .eq('job_id', jobId)
        .order('stage_order', { ascending: false })
        .limit(1)
        .single();
      
      if (stageError || !lastStage?.scheduled_end_at) {
        return new Response(
          JSON.stringify({ error: 'Unable to calculate estimate' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Add +1 business day buffer for client-facing date
      const { data: bufferedDate, error: bufferError } = await supabase
        .rpc('add_working_days_to_timestamp', {
          p_start_timestamp: lastStage.scheduled_end_at,
          p_days_to_add: 1
        });
      
      if (bufferError) {
        console.error('❌ Error adding buffer day:', bufferError);
      } else {
        console.log(`📅 Schedule estimate buffered: ${lastStage.scheduled_end_at} → ${bufferedDate}`);
      }
      
      return new Response(
        JSON.stringify({ estimatedCompletion: bufferedDate || lastStage.scheduled_end_at }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW ENDPOINT: Resend proof email
    if (action === 'resend-email') {
      const { proofLinkId } = await req.json();
      
      console.log('📧 Resending proof email for:', proofLinkId);
      
      const { data: proofLink, error: linkError } = await supabase
        .from('proof_links')
        .select(`
          *,
          production_jobs!inner(wo_no, customer, contact_email),
          job_stage_instances!inner(client_email, client_name)
        `)
        .eq('id', proofLinkId)
        .single();
      
      if (linkError || !proofLink) {
        return new Response(
          JSON.stringify({ error: 'Proof link not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
      
      const PRODUCTION_DOMAIN = 'https://printstream.impressweb.co.za';
      const proofUrl = `${PRODUCTION_DOMAIN}/proof/${proofLink.token}`;
      const jobDetails = proofLink.production_jobs;
      const stageInstance = proofLink.job_stage_instances;
      
      // Priority: stage instance email > production job email
      const clientEmail = stageInstance?.client_email || jobDetails?.contact_email;
      const clientName = stageInstance?.client_name || jobDetails?.customer;
      
      if (clientEmail) {
        try {
          const emailResult = await resend.emails.send({
            from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
            to: [clientEmail],
            subject: `[RESEND] Proof Ready for Review - WO ${jobDetails.wo_no}`,
            html: generateBrandedEmail({
              heading: 'Reminder: Your proof is ready for review',
              clientName: clientName || 'valued client',
              woNumber: jobDetails.wo_no,
              proofUrl,
              message: `This is a reminder that your proof for Work Order <strong>${jobDetails.wo_no}</strong> is awaiting your review. We look forward to your feedback so we can proceed with your order.`,
              includeNextSteps: true,
              isReminder: true
            }),
            attachments: [LOGO_ATTACHMENT]
          });
          
          console.log('✅ Email sent successfully:', emailResult);
          
          // Increment resend count
          await supabase
            .from('proof_links')
            .update({ 
              resend_count: (proofLink.resend_count || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', proofLinkId);
          
          console.log('✅ Proof email resent successfully');
          return new Response(
            JSON.stringify({ success: true, message: 'Email resent successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (emailError: any) {
          console.error('❌ Failed to resend email:', emailError);
          return new Response(
            JSON.stringify({ error: `Failed to resend email: ${emailError.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ error: 'No client email available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // NEW ENDPOINT: Regenerate proof link
    if (action === 'regenerate-link') {
      const { stageInstanceId } = await req.json();
      
      console.log('🔄 Regenerating proof link for:', stageInstanceId);
      
      // Invalidate old link
      await supabase
        .from('proof_links')
        .update({ 
          is_used: true,
          invalidated_at: new Date().toISOString()
        })
        .eq('stage_instance_id', stageInstanceId)
        .eq('is_used', false);
      
      // Generate new token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      const { data: stageInstance } = await supabase
        .from('job_stage_instances')
        .select('*, production_jobs!inner(wo_no, customer, contact_email)')
        .eq('id', stageInstanceId)
        .single();
      
      if (!stageInstance) {
        return new Response(
          JSON.stringify({ error: 'Stage instance not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
      
      // Create new proof link
      const { data: newProofLink } = await supabase
        .from('proof_links')
        .insert({
          job_id: stageInstance.job_id,
          job_table_name: stageInstance.job_table_name,
          stage_instance_id: stageInstanceId,
          token,
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single();
      
      const PRODUCTION_DOMAIN = 'https://printstream.impressweb.co.za';
      const proofUrl = `${PRODUCTION_DOMAIN}/proof/${token}`;
      const jobDetails = stageInstance.production_jobs;
      
      // Send new email with proper error handling
      if (jobDetails?.contact_email) {
        try {
          const emailResult = await resend.emails.send({
            from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
            to: [jobDetails.contact_email],
            subject: `Updated Proof Link - WO ${jobDetails.wo_no}`,
            html: generateBrandedEmail({
              heading: 'Your proof link has been updated',
              clientName: jobDetails.customer || 'valued client',
              woNumber: jobDetails.wo_no,
              proofUrl,
              message: `A new proof link has been generated for Work Order <strong>${jobDetails.wo_no}</strong>. Please use this updated link to review your proof.`,
              includeNextSteps: false
            }),
            attachments: [LOGO_ATTACHMENT]
          });
          console.log('✅ Email sent successfully:', emailResult);
        } catch (emailError: any) {
          console.error('❌ Failed to send email:', emailError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Proof link regenerated but email failed to send. Please copy the link manually.',
              proofUrl,
              token
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 207 }
          );
        }
      } else {
        console.warn('⚠️ No client email available for WO', jobDetails?.wo_no);
      }
      
      console.log('✅ Proof link regenerated successfully');
      return new Response(
        JSON.stringify({ success: true, proofUrl, token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW ENDPOINT: Invalidate proof link
    if (action === 'invalidate-link') {
      const { token } = await req.json();
      
      console.log('🚫 Invalidating proof link:', token);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('proof_links')
        .update({ 
          is_used: true,
          invalidated_at: new Date().toISOString(),
          invalidated_by: user?.id || null
        })
        .eq('token', token);
      
      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to invalidate link' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
      
      console.log('✅ Proof link invalidated successfully');
      return new Response(
        JSON.stringify({ success: true, message: 'Link invalidated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW ENDPOINT: List all proof links (admin)
    if (action === 'list-proof-links') {
      const { status, startDate, endDate, searchTerm } = await req.json();
      
      console.log('📋 Fetching proof links with filters:', { status, startDate, endDate, searchTerm });
      
      let query = supabase
        .from('proof_links')
        .select(`
          *,
          production_jobs!inner(wo_no, customer, contact_email),
          job_stage_instances!inner(
            production_stage_id,
            production_stages(name)
          )
        `)
        .order('created_at', { ascending: false });
      
      // Filter by status
      if (status === 'pending') {
        query = query.eq('is_used', false).gte('expires_at', new Date().toISOString());
      } else if (status === 'approved') {
        query = query.eq('client_response', 'approved');
      } else if (status === 'changes_requested') {
        query = query.eq('client_response', 'changes_needed');
      } else if (status === 'expired') {
        query = query.eq('is_used', false).lt('expires_at', new Date().toISOString());
      }
      
      // Filter by date range
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      
      const { data: proofLinks, error } = await query;
      
      if (error) {
        console.error('❌ Failed to fetch proof links:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch proof links' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
      
      // Filter by search term if provided
      let filteredLinks = proofLinks || [];
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filteredLinks = filteredLinks.filter(link => 
          link.production_jobs?.wo_no?.toLowerCase().includes(search) ||
          link.production_jobs?.customer?.toLowerCase().includes(search) ||
          link.production_jobs?.contact_email?.toLowerCase().includes(search)
        );
      }
      
      console.log(`✅ Found ${filteredLinks.length} proof links`);
      return new Response(
        JSON.stringify({ proofLinks: filteredLinks }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'submit-approval') {
      // Handle client approval/changes request with robust validation
      const { token, response, notes } = await req.json();
      
      console.log('📝 Processing client response:', { token, response });

      // STEP 1: Fetch proof link by token only (no filters)
      const { data: rawLink, error: fetchError } = await supabase
        .from('proof_links')
        .select(`
          *,
          job_stage_instances(notes)
        `)
        .eq('token', token)
        .single();

      if (fetchError || !rawLink) {
        console.error('❌ Proof link not found:', fetchError);
        return new Response(
          JSON.stringify({ error: 'Proof link not found. Please check your link or contact support.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      console.log('🔍 Found proof link:', { 
        id: rawLink.id, 
        is_used: rawLink.is_used, 
        client_response: rawLink.client_response,
        expires_at: rawLink.expires_at 
      });

      // STEP 2: Check if link is already used (idempotent handling)
      if (rawLink.is_used) {
        console.log('⚠️ Link already used - checking for idempotent submission');
        
        // If same response, return success (idempotent)
        if (rawLink.client_response === response) {
          console.log('✅ Idempotent submission detected - returning success');
          return new Response(
            JSON.stringify({ 
              success: true,
              alreadyProcessed: true,
              message: response === 'approved' 
                ? 'Your approval was already recorded. Thank you!' 
                : 'Your change request was already recorded. Our team will be in touch soon.'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
        
        // Different response - conflict
        console.error('❌ Link already used with different response');
        return new Response(
          JSON.stringify({ 
            error: `This proof link was already used to submit: ${rawLink.client_response === 'approved' ? 'Approval' : 'Change Request'}. Please contact us if you need to modify your response.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }

      // STEP 3: Check if link is expired
      if (rawLink.expires_at && new Date(rawLink.expires_at) < new Date()) {
        console.error('❌ Proof link has expired');
        return new Response(
          JSON.stringify({ 
            error: 'This proof link has expired. Please contact us to request a new proof link.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 410 }
        );
      }

      // STEP 4: Track that client viewed the link (if not already tracked)
      if (!rawLink.viewed_at) {
        await supabase
          .from('proof_links')
          .update({ 
            viewed_at: new Date().toISOString()
          })
          .eq('id', rawLink.id);
      }

      console.log('✅ Proof link valid - processing response');

      // STEP 5: Mark proof link as used and record response
      const { error: markUsedError } = await supabase
        .from('proof_links')
        .update({
          is_used: true,
          client_response: response,
          client_notes: notes,
          responded_at: new Date().toISOString(),
          client_ip_address: req.headers.get('x-forwarded-for'),
          client_user_agent: req.headers.get('user-agent')
        })
        .eq('id', rawLink.id);

      if (markUsedError) {
        console.error('❌ Failed to mark proof link as used:', markUsedError);
        return new Response(
          JSON.stringify({ error: 'Failed to record your response. Please try again.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log('✅ Proof link marked as used');

      // STEP 6: Process the response
      let estimatedCompletion = null;

      if (response === 'approved') {
        console.log('✅ Client approved - completing proof stage and scheduling');
        
        // Mark proof stage as completed with approval timestamp
        const { error: completeError } = await supabase
          .from('job_stage_instances')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            proof_approved_manually_at: new Date().toISOString(),
            notes: `Client approved via external link. ${notes ? `Client notes: ${notes}` : ''}`
          })
          .eq('id', rawLink.stage_instance_id);

        if (completeError) {
          console.error('❌ Failed to complete proof stage:', completeError);
          return new Response(
            JSON.stringify({ error: 'Failed to complete proof stage after approval' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log('✅ Proof stage marked as completed');

        // Append this job to the production schedule
        const { error: scheduleError } = await supabase.rpc('scheduler_append_jobs', {
          p_job_ids: [rawLink.job_id],
          p_only_if_unset: true
        });

        if (scheduleError) {
          console.error('⚠️ Failed to append to schedule:', {
            error: scheduleError,
            jobId: rawLink.job_id,
            message: scheduleError.message,
            details: scheduleError.details
          });
          // Don't fail the whole operation - proof is still approved
        } else {
          console.log('✅ Job appended to production schedule');
        }

        // Query estimated completion date
        const { data: lastStage } = await supabase
          .from('job_stage_instances')
          .select('scheduled_end_at')
          .eq('job_id', rawLink.job_id)
          .order('stage_order', { ascending: false })
          .limit(1)
          .single();

        // Add +1 business day buffer for client-facing date
        if (lastStage?.scheduled_end_at) {
          const { data: bufferedDate, error: bufferError } = await supabase
            .rpc('add_working_days_to_timestamp', {
              p_start_timestamp: lastStage.scheduled_end_at,
              p_days_to_add: 1
            });
          
          if (bufferError) {
            console.error('❌ Error adding buffer day:', bufferError);
            estimatedCompletion = lastStage.scheduled_end_at; // Fallback to unbuffered
          } else {
            estimatedCompletion = bufferedDate;
            console.log(`📅 Completion buffered: ${lastStage.scheduled_end_at} → ${bufferedDate}`);
          }
        } else {
          estimatedCompletion = null;
        }

        // Update proof_links with estimate
        await supabase
          .from('proof_links')
          .update({ 
            estimated_completion_date: estimatedCompletion
          })
          .eq('id', rawLink.id);

        console.log('✅ Estimated completion:', estimatedCompletion);
        
      } else if (response === 'changes_needed') {
        console.log('🔄 Client requested changes on proof');
        
        // Get existing notes from stage
        const existingNotes = rawLink.job_stage_instances?.notes || '';
        
        // Update the proof stage to reflect client feedback
        const { error: updateError } = await supabase
          .from('job_stage_instances')
          .update({
            status: 'changes_requested',
            notes: notes 
              ? `CLIENT FEEDBACK: ${notes}${existingNotes ? '\n\nPrevious notes: ' + existingNotes : ''}` 
              : (existingNotes || 'Client requested changes (no notes provided)'),
            updated_at: new Date().toISOString()
          })
          .eq('id', rawLink.stage_instance_id);

        if (updateError) {
          console.error('❌ Failed to update proof stage:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to record client feedback' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log('✅ Proof stage updated with client feedback');
      }

      console.log('✅ Client response processed successfully');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: response === 'approved' 
            ? 'Proof approved and job scheduled successfully' 
            : 'Changes requested. Our team will review your feedback and contact you shortly.',
          estimatedCompletion: response === 'approved' ? estimatedCompletion : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('❌ Error in proof approval handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
