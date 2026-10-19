import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProposalLineItem {
  description: string;
  quantity: number;
  unit: string;
  itemType: "material" | "labor";
  laborHours?: number | null;
  matchedProductId?: string | null;
  matchedProductName?: string | null;
  matchConfidence?: "ai" | "designer" | "none";
}

interface ProposalRoom {
  name: string;
  description?: string;
  lineItems: ProposalLineItem[];
}

interface ProposalPrefill {
  title?: string;
  contactSearchName?: string;
  taxEnvironment?: "residential" | "commercial";
  taxProjectType?: string;
  rooms?: ProposalRoom[];
  notes?: string;
}

interface RequestBody {
  briefId: string;
  notes: string;
  contactId?: string;
  contactName?: string;
  regenerate?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { briefId, notes, contactId, contactName }: RequestBody = await req.json();

    if (!briefId || !notes) {
      return new Response(JSON.stringify({ error: "briefId and notes are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify access through the caller's RLS policies before using the service-role client.
    const { data: permittedBrief, error: accessError } = await supabaseUser
      .from("design_briefs")
      .select("id, organization_id, contact_id, raw_notes")
      .eq("id", briefId)
      .maybeSingle();
    if (accessError || !permittedBrief) {
      return new Response(JSON.stringify({ error: "Design brief not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsData } = await supabase
      .from("company_settings")
      .select("openai_api_key")
      .eq("organization_id", permittedBrief.organization_id)
      .maybeSingle();

    if (!settingsData?.openai_api_key) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured. Please add your OpenAI API key in Admin > Settings > Integrations." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("design_briefs")
      .update({ status: "building" })
      .eq("id", briefId);

    // Fetch active product catalog
    const { data: products } = await supabase
      .from("products")
      .select("name, item_type, unit, our_price, cost, default_qty")
      .eq("organization_id", permittedBrief.organization_id)
      .eq("is_active", true)
      .order("name");

    let productCatalogSection = "";
    if (products && products.length > 0) {
      const lines = products
        .map((p) => `  - ${p.name} [${p.item_type ?? "material"}, ${p.unit ?? "EA"}]`)
        .join("\n");
      productCatalogSection = `\n\nPRODUCT CATALOG (use EXACT names from this list when building the proposal):\n${lines}\n\nCRITICAL: Always use the exact product name from the catalog above as the "description" in line items. If no catalog match exists, use the name as stated in the notes.`;
    }

    // Only the contact stored on this authorized brief may be used for history.
    const authorizedContactId = permittedBrief.contact_id;
    let customerHistorySection = "";
    if (authorizedContactId) {
      const { data: previousProposals } = await supabase
        .from("proposals")
        .select(`
          id,
          title,
          status,
          created_at,
          proposal_rooms (
            name,
            sort_order,
            proposal_line_items (
              description,
              quantity,
              unit,
              item_type,
              unit_price,
              line_total,
              sort_order
            )
          )
        `)
        .eq("organization_id", permittedBrief.organization_id)
        .eq("contact_id", authorizedContactId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (previousProposals && previousProposals.length > 0) {
        const proposalSummaries = previousProposals.map((p) => {
          const rooms = (p.proposal_rooms || [])
            .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
            .map((room: { name: string; proposal_line_items: Array<{ description: string; quantity: number; unit: string; item_type: string; sort_order: number }> }) => {
              const items = (room.proposal_line_items || [])
                .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
                .map((li: { description: string; quantity: number; unit: string; item_type: string }) =>
                  `    - ${li.description} (${li.quantity} ${li.unit}, ${li.item_type})`
                )
                .join("\n");
              return `  Room: ${room.name}\n${items}`;
            })
            .join("\n");
          const date = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
          return `Proposal: "${p.title}" (${p.status}, ${date})\n${rooms}`;
        });

        customerHistorySection = `\n\nCUSTOMER'S PREVIOUS PROPOSALS (for reference — the rep may ask you to copy or modify one of these):\n${proposalSummaries.join("\n\n")}`;
      }
    }

    // Use the saved brief rather than client-provided text as the AI source of truth.
    const savedNotes = permittedBrief.raw_notes || notes;
    const systemPrompt = `You are an expert AV/smart home proposal builder for a high-end installation company.
Your job is to parse a sales rep's field notes about a customer's project and produce a structured JSON proposal prefill.

The rep may reference previous proposals, e.g. "make it like the Johnson job" or "same as last time but swap the projector for a 75-inch TV". Use the customer history below to understand what they mean.
${productCatalogSection}${customerHistorySection}

RESPONSE REQUIREMENTS:
- Respond ONLY with valid JSON — no markdown, no explanation, no code fences
- The JSON must exactly match the ProposalPrefill schema below
- Be thorough: include every room and system mentioned
- Match products to the catalog using exact names when possible
- For labor, create a separate line item with itemType="labor", unit="HR"
- If the rep mentions a room/area without specifying products, still include that room with whatever items can be inferred

PROPOSALPREFILL SCHEMA:
{
  "title": "string — descriptive project title e.g. 'Home Theater & Distributed Audio - Johnson Residence'",
  "contactSearchName": "string — full customer name",
  "taxEnvironment": "residential | commercial",
  "taxProjectType": "original_construction | remodel | general_installation_repair | exempt_project | design_services | maintenance_agreement | membership | security_monitoring",
  "rooms": [
    {
      "name": "string — room or zone name e.g. 'Family Room', 'Master Bedroom', 'Outdoor Patio'",
      "description": "string — customer-facing scope of work for this room, describing equipment, installation, programming, and exclusions; distinguish assumptions from confirmed work",
      "lineItems": [
        {
          "description": "string — exact catalog product name or custom item name",
          "quantity": number,
          "unit": "EA | HR | FT | LOT",
          "itemType": "material | labor",
          "laborHours": number or null
        }
      ]
    }
  ],
  "notes": "string — any additional context, special requests, or designer instructions from the rep's notes"
}

PARSING RULES:
1. Extract customer name → contactSearchName
2. Identify every room/zone/area mentioned → rooms[].name
3. For each product mentioned: match to catalog by name only when the exact manufacturer/model is specified and verified; otherwise retain a generic equipment requirement for later selection. Set quantity, unit=EA (or FT for cable/wire), itemType=material. Never invent a catalog match or price. If the user says a pair, the design requirement is 2 physical speakers per room. Do not assume the catalog sells speakers individually: a catalog product labeled 'pair' may need a proposal quantity of 1 package for those 2 physical speakers. Preserve the physical requirement in the design and flag package-unit verification for the reviewer. Expand a requirement mentioned for several rooms into a separate line item in each room. Use the same concise description for identical requirements across rooms to enable bulk model selection.
4. For labor mentions: itemType=labor, unit=HR, quantity=hours, laborHours=hours
5. Tax environment: home/house/residence/bedroom → residential; office/warehouse/commercial → commercial
6. Tax project type: new construction → original_construction; renovations → remodel; most residential installs → general_installation_repair
7. Put any extra rep instructions, customer preferences, or context into the "notes" field. Each room.description is its proposed scope of work; do not invent confirmed customer decisions.
8. Generate a descriptive title from the project type and customer name
9. If the rep asks to copy a previous proposal, replicate that proposal's rooms and items exactly, applying any stated modifications`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settingsData.openai_api_key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Parse these field notes and produce the ProposalPrefill JSON:\n\n${savedNotes}${contactName ? `\n\nCustomer name: ${contactName}` : ""}`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.2,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      await supabase
        .from("design_briefs")
        .update({ status: "submitted" })
        .eq("id", briefId);
      return new Response(JSON.stringify({ error: `OpenAI error: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiRes.json();
    let rawContent = openaiData.choices?.[0]?.message?.content ?? "{}";

    rawContent = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let prefill: ProposalPrefill;
    try {
      prefill = JSON.parse(rawContent);
    } catch {
      await supabase
        .from("design_briefs")
        .update({ status: "submitted" })
        .eq("id", briefId);
      return new Response(JSON.stringify({ error: "Failed to parse AI response as JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("design_briefs")
      .update({ ai_summary: prefill })
      .eq("id", briefId);

    // Analysis only: a proposal is never created as a side effect of AI preview.
    // The designer can review this prefill and convert it through Design Queue.
    const { error: submittedError } = await supabase
      .from("design_briefs")
      .update({ status: "submitted" })
      .eq("id", briefId);
    if (submittedError) throw submittedError;

    const { data: repProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("organization_id", permittedBrief.organization_id)
      .eq("id", user.id)
      .maybeSingle();

    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("organization_id", permittedBrief.organization_id)
      .in("role", ["admin", "manager"]);

    if (admins && admins.length > 0) {
      const repName = repProfile?.full_name || repProfile?.email || "A sales rep";
      const customerLabel = contactName || prefill.contactSearchName || "a customer";
      const notifications = admins.map((admin) => ({
        user_id: admin.id,
        type: "task_assigned",
        title: "New Design Brief",
        message: `${repName} submitted a design brief for ${customerLabel}. Review and build the proposal.`,
        related_id: briefId,
        read: false,
      }));
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ success: true, prefill, proposalId: null }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
