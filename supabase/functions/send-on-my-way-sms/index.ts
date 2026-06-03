import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OnMyWayRequest {
  workOrderId: string;
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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { workOrderId }: OnMyWayRequest = await req.json();

    if (!workOrderId) {
      return new Response(
        JSON.stringify({ error: "Work order ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: workOrder, error: woError } = await supabase
      .from("work_orders")
      .select(`
        id,
        work_order_number,
        title,
        on_my_way_sent_at,
        project:projects(
          id,
          name,
          customer_name,
          customer_phone,
          contact:contacts(
            id,
            full_name,
            phone
          )
        )
      `)
      .eq("id", workOrderId)
      .single();

    if (woError || !workOrder) {
      throw new Error("Work order not found");
    }

    if (workOrder.on_my_way_sent_at) {
      return new Response(
        JSON.stringify({
          error: "On my way notification already sent",
          sentAt: workOrder.on_my_way_sent_at
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const customerPhone = workOrder.project?.contact?.phone || workOrder.project?.customer_phone;

    if (!customerPhone) {
      return new Response(
        JSON.stringify({ error: "Customer phone number not found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: techProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("on_my_way_sms_template, twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .maybeSingle();

    if (!companySettings) {
      throw new Error("Company settings not found");
    }

    let message = companySettings.on_my_way_sms_template ||
      "Hi {customer_name}, this is {tech_name}. I'm on my way to your location for work order {job_number}. I should arrive soon. Thank you!";

    message = message
      .replace(/{tech_name}/g, techProfile?.full_name || "your technician")
      .replace(/{customer_name}/g, workOrder.project?.customer_name || "there")
      .replace(/{job_number}/g, workOrder.work_order_number);

    let smsResult = { success: false, error: null };

    if (
      companySettings.twilio_account_sid &&
      companySettings.twilio_auth_token &&
      companySettings.twilio_phone_number
    ) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${companySettings.twilio_account_sid}/Messages.json`;

        const formData = new URLSearchParams();
        formData.append("To", customerPhone);
        formData.append("From", companySettings.twilio_phone_number);
        formData.append("Body", message);

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${companySettings.twilio_account_sid}:${companySettings.twilio_auth_token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        if (twilioResponse.ok) {
          smsResult.success = true;
        } else {
          const errorData = await twilioResponse.json();
          smsResult.error = errorData.message || "Failed to send SMS";
        }
      } catch (error) {
        console.error("Twilio error:", error);
        smsResult.error = error.message;
      }
    } else {
      console.log(`[SIMULATED] SMS to ${customerPhone}: ${message}`);
      smsResult.success = true;
    }

    const { error: updateError } = await supabase
      .from("work_orders")
      .update({
        on_my_way_sent_at: new Date().toISOString(),
        on_my_way_sent_by: user.id,
      })
      .eq("id", workOrderId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "On my way notification sent",
        smsDelivered: smsResult.success,
        smsError: smsResult.error,
        previewMessage: message,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending on my way notification:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send on my way notification",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});