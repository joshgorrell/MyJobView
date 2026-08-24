import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, webhook-signature",
};

interface ExtractedLeadData {
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  opportunity_summary: string | null;
  suggested_priority: "urgent" | "high" | "medium" | "low" | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET");
    if (webhookSecret) {
      const providedSecret = req.headers.get("webhook-signature") || req.headers.get("x-webhook-secret");
      if (providedSecret !== webhookSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload = await req.json();

    const senderEmail: string = payload?.from || payload?.sender || "";
    const senderName: string = payload?.from_name || payload?.sender_name || "";
    const subject: string = payload?.subject || "";
    const emailId: string = payload?.email_id || payload?.id || "";
    const rawBody: string = payload?.text || payload?.html || payload?.body || "";

    if (!senderEmail && !rawBody) {
      return new Response(
        JSON.stringify({ error: "No email content found in webhook payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full email from Resend if we have an email ID and API key
    let fullEmailBody = rawBody;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (emailId && resendApiKey && !fullEmailBody) {
      try {
        const emailResponse = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: { "Authorization": `Bearer ${resendApiKey}` },
        });
        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          fullEmailBody = emailData?.text || emailData?.html || emailData?.body || "";
        }
      } catch (e) {
        console.log("Failed to fetch full email from Resend (non-fatal):", e);
      }
    }

    if (!fullEmailBody) {
      fullEmailBody = `Subject: ${subject}\nFrom: ${senderName} <${senderEmail}>`;
    }

    // Truncate body for AI processing
    const maxBodyLength = 15000;
    const truncatedBody = fullEmailBody.length > maxBodyLength
      ? fullEmailBody.substring(0, maxBodyLength) + "... [truncated]"
      : fullEmailBody;

    // Load settings for OpenAI key and organization
    const { data: settingsData, error: settingsError } = await supabase
      .from("company_settings")
      .select("openai_api_key, lead_forward_address")
      .maybeSingle();

    if (settingsError || !settingsData) {
      throw new Error("Could not load company settings");
    }

    const openaiKey = settingsData.openai_api_key;
    if (!openaiKey) {
      throw new Error("OpenAI API key not configured. Please add it in Admin > Settings > Integrations.");
    }

    // Extract lead data using AI
    const extractionPrompt = `Extract lead/contact information from the following forwarded email. Return a JSON object with these fields (use null for any field you cannot find):

{
  "contact_name": "The potential customer's full name (first and last if available)",
  "email": "The customer's email address (NOT the sender's email if this is a forwarded message — look for the customer's email in the body content)",
  "phone": "The customer's phone number",
  "company_name": "The customer's company name if applicable",
  "opportunity_summary": "A concise summary of what the customer is interested in or needs (1-3 sentences)",
  "suggested_priority": "Based on urgency keywords in the email: 'urgent'/'asap'/'emergency'/'today' → urgent, 'high priority'/'important'/'soon' → high, 'interested'/'looking into' → medium, everything else → low"
}

IMPORTANT RULES:
- Return ONLY the JSON object, no markdown, no explanation
- If this is a forwarded email, the customer info is in the BODY, not the sender fields
- The contact_name should be the potential customer, not the person who forwarded the email
- For phone numbers, include the raw number as found
- The opportunity_summary should capture what products/services they're interested in
- If you cannot determine the priority, default to "medium"

EMAIL SUBJECT: ${subject}
EMAIL BODY:
${truncatedBody}`;

    let extractedData: ExtractedLeadData = {
      contact_name: senderName || null,
      email: senderEmail || null,
      phone: null,
      company_name: null,
      opportunity_summary: subject || null,
      suggested_priority: "medium",
    };

    try {
      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert at extracting structured contact and lead information from forwarded emails. You analyze email content and return clean, structured JSON data. Always return valid JSON only, no markdown formatting.",
            },
            {
              role: "user",
              content: extractionPrompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          extractedData = {
            contact_name: parsed.contact_name || extractedData.contact_name,
            email: parsed.email || extractedData.email,
            phone: parsed.phone || null,
            company_name: parsed.company_name || null,
            opportunity_summary: parsed.opportunity_summary || extractedData.opportunity_summary,
            suggested_priority: parsed.suggested_priority || "medium",
          };
        }
      } else {
        console.error("OpenAI extraction failed, using fallback data");
      }
    } catch (aiError) {
      console.error("AI extraction error (non-fatal, using fallback):", aiError);
    }

    // Resolve organization (single-tenant)
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();

    const organizationId = orgData?.id;
    if (!organizationId) {
      throw new Error("No organization found");
    }

    // Resolve office (same pattern as kiosk function)
    const { data: settingsOffice } = await supabase
      .from("company_settings")
      .select("kiosk_office_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    let officeId: string | null = settingsOffice?.kiosk_office_id ?? null;

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
      throw new Error("No office found for this organization");
    }

    // Normalize email
    const customerEmail = extractedData.email ? extractedData.email.toLowerCase().trim() : "";
    const contactName = extractedData.contact_name || senderName || "Unknown Contact";

    // Check if contact already exists by email
    let contactId: string | null = null;
    let isExistingContact = false;

    if (customerEmail) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", customerEmail)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
        isExistingContact = true;
      }
    }

    // Create temporary contact if no match found
    if (!contactId) {
      const nameParts = contactName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const base = contactName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
      const suffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const username = `${base}_${suffix}`.substring(0, 50);

      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          contact_name: contactName.trim(),
          first_name: firstName,
          last_name: lastName,
          username,
          email: customerEmail || null,
          phone: extractedData.phone || null,
          company_name: extractedData.company_name || null,
          notes: `Created from forwarded email on ${new Date().toLocaleDateString()}. Please verify and complete contact information.`,
          contact_type: "person",
          portal_access_enabled: false,
          organization_id: organizationId,
          office_id: officeId,
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
    const leadBase = contactName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    const leadSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const leadUsername = `${leadBase}_${leadSuffix}`.substring(0, 50);

    // Insert the lead
    const { data: newLead, error: leadError } = await supabase
      .from("leads")
      .insert({
        contact_name: contactName,
        username: leadUsername,
        email: customerEmail || null,
        phone: extractedData.phone || null,
        company_name: extractedData.company_name || null,
        opportunity_description: extractedData.opportunity_summary || subject,
        priority: extractedData.suggested_priority || "medium",
        status: "unclaimed",
        is_fishbowl: true,
        lead_source: "email_forward",
        converted_from_contact_id: contactId,
        organization_id: organizationId,
        office_id: officeId,
        is_incomplete: !isExistingContact,
        raw_email_content: fullEmailBody,
        raw_email_subject: subject,
      })
      .select("id, created_at")
      .single();

    if (leadError) {
      console.error("Lead insert error:", leadError);
      throw new Error(`Failed to create lead: ${leadError.message}`);
    }

    // Insert feed event
    try {
      await supabase.from("feed_events").insert([
        {
          event_type: "lead_created",
          lead_id: newLead.id,
          metadata: {
            source: "email_forward",
            contact_name: contactName,
            subject: subject,
          },
        },
      ]);
    } catch (e) {
      console.log("Feed event insert failed (non-fatal):", e);
    }

    // Notify all active sales reps
    try {
      const { data: salesReps } = await supabase
        .from("profiles")
        .select("id, full_name, email, email_leads")
        .eq("role", "sales")
        .eq("is_active", true);

      if (salesReps && salesReps.length > 0) {
        const notifications = salesReps.map((rep: any) => ({
          user_id: rep.id,
          type: "fishbowl_lead",
          lead_id: newLead.id,
          title: "New Email Forward Lead",
          body: `${contactName}${extractedData.company_name ? ` (${extractedData.company_name})` : ""} — ${extractedData.opportunity_summary?.substring(0, 80) || subject}`,
        }));

        await supabase.from("notifications").insert(notifications);

        // Fire-and-forget email notifications for reps who have email_leads enabled
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        for (const rep of salesReps) {
          if (rep.email_leads !== false && rep.email) {
            fetch(`${supabaseUrl}/functions/v1/send-lead-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${anonKey}`,
              },
              body: JSON.stringify({
                leadId: newLead.id,
                repEmail: rep.email,
                contactName,
                opportunity: extractedData.opportunity_summary || subject,
                source: "email_forward",
              }),
            }).catch((e: any) => console.log("Lead notification email failed (non-fatal):", e));
          }
        }
      }
    } catch (e) {
      console.log("Notification creation failed (non-fatal):", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        leadId: newLead.id,
        contactId,
        isExistingContact,
        extracted: extractedData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Inbound email processing error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
