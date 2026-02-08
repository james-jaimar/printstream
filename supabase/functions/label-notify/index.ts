/**
 * Label Notification Edge Function
 * Sends email notifications for proof ready, approval received, and order complete
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NotificationRequest {
  type: 'proof_ready' | 'approval_received' | 'order_complete';
  order_id: string;
  recipient_email?: string; // Optional override
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
    const { type, order_id, recipient_email } = body;

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

    // Determine recipient
    const email = recipient_email || order.contact_email;
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No recipient email available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get portal URL for client
    const portalUrl = `${req.headers.get('origin') || 'https://printstream.lovable.app'}/labels/portal`;
    
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
            <li><strong>Items:</strong> ${order.items?.length || 0} artwork(s)</li>
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
      from: 'PrintStream Labels <notifications@printstream.lovable.app>',
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
