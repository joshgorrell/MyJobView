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
    const { poId } = await req.json();

    if (!poId) {
      return new Response(JSON.stringify({ error: "Missing poId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch PO with vendor and items
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        vendors ( vendor_name, email, contact_name, address, city, state, zip, phone ),
        po_items ( product_name, model_number, quantity, unit_price, total_price )
      `)
      .eq("id", poId)
      .maybeSingle();

    if (poError || !po) {
      return new Response(JSON.stringify({ error: "Purchase order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vendorEmail = po.vendors?.email;
    if (!vendorEmail) {
      return new Response(JSON.stringify({ error: "Vendor does not have an email address on file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (po.po_items || [])
      .map(
        (i: any) =>
          `${i.product_name}${i.model_number ? ` (${i.model_number})` : ""} - Qty: ${i.quantity} - Unit: $${i.unit_price || 0} - Total: $${i.total_price || 0}`
      )
      .join("\n");

    // Build Bill To block
    const billToLines = [
      po.bill_to_name,
      po.bill_to_address,
      [po.bill_to_city, po.bill_to_state, po.bill_to_zip].filter(Boolean).join(", "),
    ].filter(Boolean);
    const billToBlock = billToLines.length > 0 ? billToLines.join("\n") : "N/A";

    // Build Ship To block
    const shipToLines = [
      po.ship_to_name,
      po.ship_to_address,
      [po.ship_to_city, po.ship_to_state, po.ship_to_zip].filter(Boolean).join(", "),
    ].filter(Boolean);
    const shipToBlock = shipToLines.length > 0 ? shipToLines.join("\n") : "N/A";

    const emailBody = `
Purchase Order: ${po.po_number}

To: ${po.vendors?.vendor_name || ""}
${po.vendors?.contact_name ? `Attn: ${po.vendors.contact_name}` : ""}

Please process the following purchase order:

PO Number: ${po.po_number}
Order Date: ${po.order_date}
${po.expected_date ? `Expected Date: ${po.expected_date}` : ""}

Bill To:
${billToBlock}

Ship To:
${shipToBlock}

Items:
${items}

Subtotal: $${po.subtotal || 0}
${po.shipping_cost ? `Shipping: $${po.shipping_cost}` : ""}
${po.tax_amount ? `Tax: $${po.tax_amount}` : ""}
Total: $${po.total || 0}

${po.external_note ? `Vendor Instructions:\n${po.external_note}` : ""}

${po.notes ? `Notes: ${po.notes}` : ""}

Thank you for your prompt service.
`.trim();

    // Send email via Supabase auth admin invite (workaround for email sending)
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(vendorEmail, {
      data: {
        subject: `Purchase Order ${po.po_number}`,
        body: emailBody,
      },
    });

    if (emailError) {
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    // Update PO status to 'sent'
    await supabase
      .from("purchase_orders")
      .update({ status: "sent" })
      .eq("id", poId);

    return new Response(JSON.stringify({ message: "PO emailed to vendor", vendorEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in send-purchase-order-email:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
