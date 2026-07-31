import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { record: productRequest } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get requester info
    const { data: requester } = await supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", productRequest.requested_by)
      .maybeSingle();

    // Get request items
    const { data: items } = await supabase
      .from("product_request_items")
      .select("product_name, model_number, vendor, quantity_requested, estimated_cost")
      .eq("request_id", productRequest.id);

    // Get users who opted in to purchasing notifications
    const { data: notifyUsers } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("notify_on_product_requests", true)
      .not("email", "is", null);

    if (!notifyUsers || notifyUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No users opted in to notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build source label
    let sourceLabel = "General";
    if (productRequest.sales_order_id) sourceLabel = "Sales Order";
    else if (productRequest.work_order_id) sourceLabel = "Work Order";
    else if (productRequest.project_id) sourceLabel = "Project";
    else if (productRequest.service_request_id) sourceLabel = "Service Request";

    const requesterName = requester
      ? `${requester.first_name || ""} ${requester.last_name || ""}`.trim() || requester.email
      : "Unknown";

    const itemList = (items || [])
      .map(
        (i: any) =>
          `  - ${i.product_name}${i.model_number ? ` (${i.model_number})` : ""} - Qty: ${i.quantity_requested}${i.vendor ? ` - Vendor: ${i.vendor}` : ""}${i.estimated_cost ? ` - Est. Cost: $${i.estimated_cost}` : ""}`
      )
      .join("\n");

    const deepLink = `${Deno.env.get("APP_URL") || ""}/parts-requests?requestId=${productRequest.id}`;

    const emailBody = `
New Product Request Submitted

Requested by: ${requesterName}
Source: ${sourceLabel}
Priority: ${productRequest.priority || "normal"}
${productRequest.date_needed ? `Date Needed: ${productRequest.date_needed}` : ""}

Items:
${itemList}

${productRequest.notes ? `Notes: ${productRequest.notes}` : ""}

View this request: ${deepLink}
`.trim();

    // Send email to each opted-in user
    for (const user of notifyUsers) {
      const { error } = await supabase.auth.admin.inviteUserByEmail(user.email, {
        redirectTo: deepLink,
        data: {
          subject: `New Parts Request from ${requesterName}`,
          body: emailBody,
        },
      });
      if (error) {
        console.error(`Failed to notify ${user.email}:`, error.message);
      }
    }

    return new Response(JSON.stringify({ message: "Notifications sent", count: notifyUsers.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in notify-purchasing-new-request:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
