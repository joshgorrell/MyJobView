import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from './_shared/emailTemplates.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface FeedbackRequest {
  workOrderId: string;
  timeEntryId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { workOrderId, timeEntryId }: FeedbackRequest = await req.json();

    if (!workOrderId) {
      return new Response(
        JSON.stringify({ error: "Work order ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch work order with all necessary details
    const { data: workOrder, error: woError } = await supabase
      .from("work_orders")
      .select(`
        id,
        work_order_number,
        title,
        status,
        actual_completion_date,
        feedback_email_sent,
        contact:contacts(
          id,
          full_name,
          email
        ),
        project:projects(
          name
        )
      `)
      .eq("id", workOrderId)
      .maybeSingle();

    if (woError || !workOrder) {
      return new Response(
        JSON.stringify({ error: "Work order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if feedback email was already sent
    if (workOrder.feedback_email_sent) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Feedback email was already sent for this work order",
          alreadySent: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if work order is actually completed
    if (workOrder.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: "Work order must be completed before sending feedback email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if customer has email
    if (!workOrder.contact?.email) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Customer does not have an email address on file",
          noEmail: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all technicians who worked on this work order
    const { data: timeEntries } = await supabase
      .from("time_entries")
      .select(`
        technician:profiles!time_entries_technician_id_fkey(
          full_name
        )
      `)
      .eq("work_order_id", workOrderId)
      .not("clock_out", "is", null);

    const technicianNames = timeEntries
      ?.map(te => te.technician?.full_name)
      .filter((name, index, self) => name && self.indexOf(name) === index)
      .join(", ") || "Our team";

    // Get company settings and email template
    const settings = await getCompanySettings(supabaseUrl, supabaseServiceKey);
    const template = await getEmailTemplate('work_order_feedback', supabaseUrl, supabaseServiceKey);

    const completionDate = workOrder.actual_completion_date 
      ? new Date(workOrder.actual_completion_date).toLocaleDateString()
      : new Date().toLocaleDateString();

    const placeholders = {
      customer_name: workOrder.contact.full_name || 'Customer',
      company_name: settings.company_name,
      work_order_number: workOrder.work_order_number,
      work_order_title: workOrder.title || 'Service',
      completion_date: completionDate,
      technician_names: technicianNames,
      company_phone: settings.company_phone || '',
      company_email: settings.company_email || '',
    };

    let subject: string;
    let emailBody: string;

    if (template) {
      subject = replacePlaceholders(template.subject, placeholders);
      const bodyText = replacePlaceholders(template.body, placeholders);
      emailBody = convertTextToHtml(bodyText);
    } else {
      // Fallback if template doesn't exist
      subject = `How did everything go? - ${settings.company_name}`;
      emailBody = `
        <p>Hi ${placeholders.customer_name},</p>
        <p>We wanted to follow up regarding the service we recently completed for you.</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Work Order:</strong> ${workOrder.work_order_number}</p>
          <p><strong>Service:</strong> ${workOrder.title || 'Service'}</p>
          <p><strong>Completed:</strong> ${completionDate}</p>
          <p><strong>Technician(s):</strong> ${technicianNames}</p>
        </div>
        <p>We hope everything went smoothly and you're satisfied with the work performed. If you have any questions, concerns, or feedback about the service, we'd love to hear from you.</p>
        <p><strong>Is everything working as expected?</strong><br>Please don't hesitate to reach out if anything needs attention.</p>
        <p><strong>Were you happy with our service?</strong><br>Your feedback helps us continue to provide excellent service to all our customers.</p>
        <p>You can reach us at ${settings.company_phone || 'our main number'} or simply reply to this email.</p>
        <p>Thank you for choosing ${settings.company_name}!</p>
        <p>Best regards,<br>The ${settings.company_name} Team</p>
      `;
    }

    const emailHtml = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, '#3b82f6', settings.company_logo_url || '', settings.offices || []);

    let emailSent = false;
    let emailError = null;

    // Send email via Resend
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: settings.from_address,
          to: [workOrder.contact.email],
          reply_to: settings.reply_to_email,
          subject: subject,
          html: emailHtml,
        }),
      });

      if (res.ok) {
        emailSent = true;
      } else {
        const errorData = await res.json();
        emailError = errorData.message;
        console.error('Email sending failed:', errorData);
      }
    } else {
      console.log(`[SIMULATED] Feedback email to ${workOrder.contact.email}:`, subject);
      emailSent = true; // Simulate success in development
    }

    // Update work order to mark feedback email as sent
    if (emailSent) {
      const updateData: any = {
        feedback_email_sent: true,
        feedback_email_sent_at: new Date().toISOString(),
      };

      await supabase
        .from("work_orders")
        .update(updateData)
        .eq("id", workOrderId);

      // Update time entry to mark it as the one that completed the job
      if (timeEntryId) {
        await supabase
          .from("time_entries")
          .update({ marked_complete: true })
          .eq("id", timeEntryId);
      }

      // Log to activity feed
      await supabase
        .from("activity_feed")
        .insert({
          activity_type: 'work_order_feedback_sent',
          entity_type: 'work_order',
          entity_id: workOrderId,
          title: 'Customer Feedback Email Sent',
          description: `Feedback email sent to ${workOrder.contact.full_name} for work order ${workOrder.work_order_number}`,
        });
    }

    return new Response(
      JSON.stringify({
        success: emailSent,
        message: emailSent 
          ? 'Feedback email sent successfully'
          : `Failed to send feedback email: ${emailError}`,
        emailSent,
        error: emailError,
      }),
      {
        status: emailSent ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending feedback email:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send feedback email",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});