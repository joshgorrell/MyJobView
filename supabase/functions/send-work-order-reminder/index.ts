import { sendSystemEmail } from '../_shared/system-email.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface WorkOrderReminderRequest {
  workOrderId?: string;
  daysBefore?: number;
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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("organization_id, role").eq("id", user.id).single();
    if (profileError || !profile?.organization_id || !["admin", "manager"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { workOrderId, daysBefore = 1 }: WorkOrderReminderRequest = await req.json();
    // Bulk scheduling is not authorized through this user-facing endpoint.
    // It needs a separately authenticated, dealer-scoped scheduler.
    if (!workOrderId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workOrderId)) {
      return new Response(JSON.stringify({ error: "A valid work order ID is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let workOrders = [];

    if (workOrderId) {
      const { data, error } = await supabase
        .from("work_orders")
        .select(`
          id,
          work_order_number,
          type,
          description,
          start_date,
          start_time,
          send_appointment_reminder,
          reminder_email,
          reminder_sms,
          reminder_sent_at,
          contact:contacts(
            id,
            full_name,
            email,
            phone
          ),
          technician:profiles!assigned_technician(
            id,
            full_name,
            email,
            phone
          )
        `)
        .eq("id", workOrderId)
        .eq("organization_id", profile.organization_id)
        .eq("send_appointment_reminder", true)
        .maybeSingle();

      if (error) throw error;
      if (data) workOrders = [data];
    }

    if (workOrders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No work orders need reminders",
          processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const settings = await getCompanySettings(supabaseUrl, supabaseServiceKey);
    const template = await getEmailTemplate('work_order_assigned', supabaseUrl, supabaseServiceKey);

    const results = [];

    for (const wo of workOrders) {
      const result: any = {
        workOrderId: wo.id,
        workOrderNumber: wo.work_order_number,
        emailSent: false,
        smsSent: false,
        errors: [],
      };

      const appointmentDate = new Date(wo.start_date).toLocaleDateString();
      const appointmentTime = wo.start_time || "TBD";

      if (wo.reminder_email && wo.contact?.email) {
        try {
          let subject: string;
          let emailBody: string;

          if (template) {
            const placeholders = {
              customer_name: wo.contact.full_name || 'Customer',
              company_name: settings.company_name,
              work_order_number: wo.work_order_number,
              appointment_date: appointmentDate,
              appointment_time: appointmentTime,
              appointment_type: wo.type === 'vip_program' ? 'VIP Service' : 'Service Appointment',
              appointment_location: 'Your location',
              staff_name: wo.technician?.full_name || 'Our team',
              staff_phone: wo.technician?.phone || settings.company_phone || '',
              appointment_notes: wo.description || 'Service appointment',
              company_phone: settings.company_phone || '',
              company_email: settings.company_email || '',
              portal_link: settings.subdomain
                ? `https://${settings.subdomain}.myjobview.com`
                : (settings.portal_url || `${supabaseUrl}/portal`),
              appointment_duration: '2-4 hours',
            };

            subject = replacePlaceholders(template.subject, placeholders);
            const bodyText = replacePlaceholders(template.body, placeholders);
            emailBody = convertTextToHtml(bodyText);
          } else {
            subject = `Appointment Reminder: ${wo.work_order_number} - ${appointmentDate}`;
            emailBody = `
              <p>Dear ${wo.contact.full_name || "Customer"},</p>
              <p>This is a reminder about your upcoming ${wo.type === 'vip_program' ? 'VIP service' : 'service'} appointment:</p>
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Work Order:</strong> ${wo.work_order_number}</p>
                <p><strong>Date:</strong> ${appointmentDate}</p>
                <p><strong>Time:</strong> ${appointmentTime}</p>
                <p><strong>Description:</strong> ${wo.description || 'Service appointment'}</p>
                ${wo.technician?.full_name ? `<p><strong>Technician:</strong> ${wo.technician.full_name}</p>` : ''}
              </div>
              <p>We look forward to serving you!</p>
            `;
          }

          const emailHtml = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, '#3b82f6', settings.company_logo_url || '', settings.offices || []);

          if (RESEND_API_KEY) {
            const res = await sendSystemEmail({
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: settings.from_address,
                to: [wo.contact.email],
                reply_to: settings.reply_to_email,
                subject: subject,
                html: emailHtml,
              }),
            });

            if (res.ok) {
              result.emailSent = true;
            } else {
              const errorData = await res.json();
              result.errors.push(`Email error: ${errorData.message}`);
            }
          } else {
            throw new Error('Email service is not configured: RESEND_API_KEY is missing.');
          }
        } catch (error) {
          result.errors.push(`Email error: ${error.message}`);
        }
      }

      // Legacy direct Twilio and simulated-success paths are intentionally disabled.
      // Appointment SMS must be queued through the dealer-scoped, consent-aware dispatcher.
      if (wo.reminder_sms) {
        result.errors.push('SMS not queued: appointment SMS dispatch is not yet enabled. No text was sent.');
      }

      if (result.emailSent) {
        await supabase
          .from("work_orders")
          .update({
            reminder_sent_at: new Date().toISOString(),
          })
          .eq("id", wo.id);
      }

      results.push(result);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${workOrders.length} work order(s)`,
        processed: workOrders.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending work order reminders:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send work order reminders",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
