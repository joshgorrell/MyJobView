import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { name, email, phone, opportunityDescription, interests, organizationId, assignedRepId } = await req.json();

    if (!name || !email || !phone || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, phone, organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Resolve which office to use:
    // 1. Check if kiosk_office_id is configured in company_settings
    // 2. Fall back to first office by display_order
    const { data: settingsData } = await supabase
      .from("company_settings")
      .select("kiosk_office_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    let officeId: string | null = settingsData?.kiosk_office_id ?? null;

    if (!officeId) {
      const { data: officeData } = await supabase
        .from("company_offices")
        .select("id")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      officeId = officeData?.id ?? null;
    }

    if (!officeId) {
      throw new Error("No office found for this organization. Please contact support.");
    }

    // Check if contact already exists
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", emailLower)
      .eq("organization_id", organizationId)
      .maybeSingle();

    let contactId = existingContact?.id;

    if (!contactId) {
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "";
      const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
      const suffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const username = `${base}_${suffix}`.substring(0, 50);

      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          contact_name: name.trim(),
          first_name: firstName,
          last_name: lastName,
          username,
          email: emailLower,
          phone: phone.trim(),
          notes: `Created from tradeshow kiosk on ${new Date().toLocaleDateString()}`,
          contact_type: "person",
          portal_access_enabled: false,
          organization_id: organizationId,
          office_id: officeId,
          assigned_to: assignedRepId ?? null,
        })
        .select("id")
        .single();

      if (contactError) {
        console.error("Contact insert error:", contactError);
        throw new Error(`Failed to create contact: ${contactError.message}`);
      }
      contactId = newContact.id;
    }

    // Generate unique lead username
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    const suffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const leadUsername = `${base}_${suffix}`.substring(0, 50);

    const isAssigned = !!assignedRepId;

    const { data: newLead, error: leadError } = await supabase
      .from("leads")
      .insert({
        contact_name: name,
        username: leadUsername,
        email: emailLower,
        phone: phone.trim(),
        opportunity_description: opportunityDescription,
        priority: "low",
        status: isAssigned ? "claimed" : "unclaimed",
        is_fishbowl: !isAssigned,
        lead_source: "kiosk",
        converted_from_contact_id: contactId,
        organization_id: organizationId,
        office_id: officeId,
        assigned_to: isAssigned ? assignedRepId : null,
        claimed_by: isAssigned ? assignedRepId : null,
        claimed_at: isAssigned ? new Date().toISOString() : null,
      })
      .select("id, created_at")
      .single();

    if (leadError) {
      console.error("Lead insert error:", leadError);
      throw new Error(`Failed to create lead: ${leadError.message}`);
    }

    // Fire-and-forget thank you email
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      fetch(`${supabaseUrl}/functions/v1/send-kiosk-thank-you`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ email: emailLower, contact_name: name, interests }),
      }).catch(e => console.log("Thank you email failed (non-fatal):", e));
    } catch (_) {}

    return new Response(
      JSON.stringify({ success: true, leadId: newLead.id, contactId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Kiosk submission error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Submission failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
