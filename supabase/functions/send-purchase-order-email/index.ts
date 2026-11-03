import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { sendSystemEmail } from "../_shared/system-email.ts";
import { renderPurchaseDocument } from "../_shared/purchase-document.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: cors });
  try {
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return reply({ error: "Unauthorized" }, 401);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: identity, error: authError } = await db.auth.getUser(token);
    if (authError || !identity.user)
      return reply({ error: "Unauthorized" }, 401);
    const { data: profile } = await db
      .from("profiles")
      .select("organization_id,role,can_create_purchase_orders")
      .eq("id", identity.user.id)
      .single();
    if (
      !profile?.organization_id ||
      !(profile.role === "admin" || profile.can_create_purchase_orders)
    )
      return reply({ error: "Purchasing permission required" }, 403);
    const { poId, vendorId } = await req.json();
    if (!poId) return reply({ error: "Missing document" }, 400);
    const { data: doc, error } = await db
      .from("purchase_orders")
      .select("*,po_items(*)")
      .eq("id", poId)
      .eq("organization_id", profile.organization_id)
      .single();
    if (error || !doc) return reply({ error: "Document not found" }, 404);
    if (!["draft", "submitted", "sent"].includes(doc.status))
      return reply({ error: "Document cannot be sent in this status" }, 400);
    const quote = doc.document_type === "rfq";
    let recipientId = doc.vendor_id;
    if (quote) {
      const { data: bid } = await db
        .from("purchase_quote_vendors")
        .select("id,vendor_id")
        .eq("quote_id", doc.id)
        .eq("organization_id", profile.organization_id)
        .eq("vendor_id", vendorId)
        .single();
      if (!bid)
        return reply({ error: "Vendor is not on this quote request" }, 400);
      recipientId = bid.vendor_id;
    }
    const { data: vendor } = await db
      .from("vendors")
      .select("id,vendor_name,email")
      .eq("id", recipientId)
      .eq("organization_id", profile.organization_id)
      .single();
    if (!vendor?.email) return reply({ error: "Vendor email is missing" }, 400);
    const { data: settings } = await db
      .from("company_settings")
      .select("from_email,from_name,company_name,company_email,reply_to_email")
      .eq("organization_id", profile.organization_id)
      .single();
    const sender = settings?.from_email || settings?.company_email;
    if (!sender || sender.endsWith("@resend.dev"))
      return reply({ error: "Configure a verified company email sender" }, 400);
    const rendered = renderPurchaseDocument(
      doc,
      vendor,
      settings.company_name || "MyJobView",
    );
    const payload = {
      from: `${String(settings.from_name || settings.company_name || "MyJobView").replace(/[<>\r\n]/g, "")} <${sender}>`,
      to: [vendor.email],
      reply_to: settings.reply_to_email || settings.company_email || sender,
      ...rendered,
    };
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(payload)),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const result = await sendSystemEmail({
      headers: {
        "Idempotency-Key": `purchasing-${doc.id}-${recipientId}-${hash.slice(0, 24)}`,
      },
      body: JSON.stringify(payload),
    });
    if (!result.ok) throw Error("Email provider rejected the document");
    const update = quote
      ? await db
          .from("purchase_quote_vendors")
          .update({ sent_at: new Date().toISOString() })
          .eq("quote_id", doc.id)
          .eq("vendor_id", recipientId)
      : await db
          .from("purchase_orders")
          .update({
            status: "submitted",
            submitted_at: doc.submitted_at || new Date().toISOString(),
            submitted_by: identity.user.id,
          })
          .eq("id", doc.id)
          .eq("organization_id", profile.organization_id);
    if (update.error)
      throw Error(
        "Email accepted, but status could not be saved. Retry safely.",
      );
    return reply({
      message: quote ? "Quote request emailed" : "Purchase order emailed",
    });
  } catch (e: any) {
    return reply({ error: e.message || "Document delivery failed" }, 500);
  }
});
