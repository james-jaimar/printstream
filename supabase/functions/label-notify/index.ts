/**
 * Label Notification Edge Function
 * Sends email notifications for proof ready, approval received, and order complete
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotificationRequest {
  type: 'proof_ready' | 'approval_received' | 'order_complete' | 'proof_request' | 'artwork_request';
  order_id: string;
  recipient_email?: string; // Optional override for single recipient
  request_id?: string; // Proofing request ID
  contact_ids?: string[]; // For multi-contact notifications
  message?: string; // Custom message
  item_ids?: string[]; // For artwork request
  issue?: string; // Artwork issue description
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: NotificationRequest = await req.json();
    const { type, order_id, recipient_email, request_id, contact_ids, message, item_ids, issue } = body;

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('label_orders')
      .select(`
        *,
        dieline:label_dielines(*),
        items:label_items(*)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('Failed to fetch order:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exclude multi-page parent PDFs from item counts
    const visibleItems = (order.items || []).filter(
      (i: any) => !(i.page_count > 1 && !i.parent_item_id)
    );

    // Get portal URL for client
    const portalUrl = `${req.headers.get('origin') || 'https://printstream.lovable.app'}/labels/portal`;

    // Handle multi-contact notifications (proof_request, artwork_request)
    if ((type === 'proof_request' || type === 'artwork_request') && contact_ids && contact_ids.length > 0) {
      // Fetch contacts
      const { data: contacts, error: contactsError } = await supabase
        .from('label_customer_contacts')
        .select('id, name, email')
        .in('id', contact_ids);

      if (contactsError || !contacts || contacts.length === 0) {
        console.error('Failed to fetch contacts:', contactsError);
        return new Response(
          JSON.stringify({ error: 'No valid contacts found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build email content based on type
      let subject: string;
      let htmlContentTemplate: (contactName: string) => string;

      if (type === 'proof_request') {
        subject = `Proof Ready for Review - Order ${order.order_number}`;
        htmlContentTemplate = (contactName: string) => `
          <h1>Proof Ready for Your Review</h1>
          <p>Hello ${contactName},</p>
          <p>A proof for label order <strong>${order.order_number}</strong> is ready for your review and approval.</p>
          
          ${message ? `<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;"><strong>Message:</strong><br/>${message}</div>` : ''}
          
          <h3>Order Details</h3>
          <ul>
            <li><strong>Order Number:</strong> ${order.order_number}</li>
            <li><strong>Customer:</strong> ${order.customer_name}</li>
            <li><strong>Total Labels:</strong> ${order.total_label_count?.toLocaleString() || 'N/A'}</li>
            <li><strong>Items:</strong> ${visibleItems.length} artwork(s)</li>
          </ul>
          
          <p style="margin-top: 24px;">
            <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Review & Approve Proof
            </a>
          </p>
          
          <p style="margin-top: 24px; color: #666; font-size: 14px;">
            Please log in to the client portal to review the proof and provide your feedback.
          </p>
        `;
      } else {
        // artwork_request
        subject = `Artwork Update Required - Order ${order.order_number}`;
        const itemsNeedingArtwork = order.items?.filter((i: any) => item_ids?.includes(i.id)) || [];
        
        htmlContentTemplate = (contactName: string) => `
          <h1>Artwork Update Required</h1>
          <p>Hello ${contactName},</p>
          <p>Some artwork files for order <strong>${order.order_number}</strong> require your attention.</p>
          
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <strong>Issue:</strong><br/>
            ${issue || 'Please upload updated artwork files.'}
          </div>
          
          <h3>Items Requiring New Artwork</h3>
          <ul>
            ${itemsNeedingArtwork.map((item: any) => `<li>${item.name} (Qty: ${item.quantity?.toLocaleString() || 'N/A'})</li>`).join('')}
          </ul>
          
          <p style="margin-top: 24px;">
            <a href="${portalUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Upload New Artwork
            </a>
          </p>
          
          <p style="margin-top: 24px; color: #666; font-size: 14px;">
            Please log in to upload corrected artwork files for the items listed above.
          </p>
        `;
      }

      // Send email to each contact
      const emailPromises = contacts.map(async (contact) => {
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
          to: [contact.email],
          subject,
          html: htmlContentTemplate(contact.name),
        });

        if (emailError) {
          console.error(`Failed to send email to ${contact.email}:`, emailError);
          return { contact_id: contact.id, success: false, error: emailError };
        }

        // Update notification record
        if (request_id) {
          await supabase
            .from('label_proofing_notifications')
            .update({ sent_at: new Date().toISOString() })
            .eq('request_id', request_id)
            .eq('contact_id', contact.id);
        }

        return { contact_id: contact.id, success: true, email_id: emailData?.id };
      });

      const results = await Promise.all(emailPromises);
      const successCount = results.filter(r => r.success).length;

      console.log(`✅ ${type} notification sent to ${successCount}/${contacts.length} contacts for order ${order.order_number}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${type} notification sent to ${successCount} contact(s)`,
          results 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single recipient notifications (legacy: proof_ready, approval_received, order_complete)
    const email = recipient_email || order.contact_email;
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No recipient email available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Build email content based on type
    let subject: string;
    let htmlContent: string;

    switch (type) {
      case 'proof_ready':
        subject = `Proof Ready for Review - Order ${order.order_number}`;
        htmlContent = `
          <h1>Your Proof is Ready for Review</h1>
          <p>Hello ${order.contact_name || order.customer_name},</p>
          <p>The proof for your label order <strong>${order.order_number}</strong> is ready for your review and approval.</p>
          
          <h3>Order Details</h3>
          <ul>
            <li><strong>Order Number:</strong> ${order.order_number}</li>
            <li><strong>Total Labels:</strong> ${order.total_label_count?.toLocaleString() || 'N/A'}</li>
            <li><strong>Items:</strong> ${visibleItems.length} artwork(s)</li>
            ${order.due_date ? `<li><strong>Due Date:</strong> ${new Date(order.due_date).toLocaleDateString()}</li>` : ''}
          </ul>
          
          <p style="margin-top: 24px;">
            <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Review & Approve Proof
            </a>
          </p>
          
          <p style="margin-top: 24px; color: #666; font-size: 14px;">
            Please review the proof carefully and approve it to proceed with production.
            If you have any concerns, you can reject the proof with feedback.
          </p>
        `;
        break;

      case 'approval_received':
        subject = `Proof Approved - Order ${order.order_number} Proceeding to Production`;
        htmlContent = `
          <h1>Thank You for Your Approval</h1>
          <p>Hello ${order.contact_name || order.customer_name},</p>
          <p>We've received your approval for order <strong>${order.order_number}</strong>.</p>
          
          <p>Your label order is now being prepared for production. We'll notify you when the order is complete.</p>
          
          <h3>Order Summary</h3>
          <ul>
            <li><strong>Order Number:</strong> ${order.order_number}</li>
            <li><strong>Total Labels:</strong> ${order.total_label_count?.toLocaleString() || 'N/A'}</li>
            ${order.due_date ? `<li><strong>Estimated Due:</strong> ${new Date(order.due_date).toLocaleDateString()}</li>` : ''}
          </ul>
          
          <p style="margin-top: 24px;">
            <a href="${portalUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Track Order Status
            </a>
          </p>
        `;
        break;

      case 'order_complete':
        subject = `Order Complete - ${order.order_number}`;
        htmlContent = `
          <h1>Your Label Order is Complete!</h1>
          <p>Hello ${order.contact_name || order.customer_name},</p>
          <p>Great news! Your label order <strong>${order.order_number}</strong> has been completed.</p>
          
          <h3>Order Summary</h3>
          <ul>
            <li><strong>Order Number:</strong> ${order.order_number}</li>
            <li><strong>Total Labels:</strong> ${order.total_label_count?.toLocaleString() || 'N/A'}</li>
          </ul>
          
          <p>Your order is now ready for collection or dispatch as arranged.</p>
          
          <p style="margin-top: 24px;">
            <a href="${portalUrl}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Order Details
            </a>
          </p>
          
          <p style="margin-top: 24px; color: #666; font-size: 14px;">
            Thank you for your business! We look forward to serving you again.
          </p>
        `;
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid notification type' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Proofing at Impress Web <proofing@printstream.impressweb.co.za>',
      to: [email],
      subject,
      html: htmlContent,
    });

    if (emailError) {
      console.error('Failed to send email:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ ${type} notification sent to ${email} for order ${order.order_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${type} notification sent`,
        email_id: emailData?.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in label-notify:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
