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

    const { data: settingsData } = await supabase
      .from("company_settings")
      .select("openai_api_key")
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

    const { data: products } = await supabase
      .from("products")
      .select("name, item_type, unit, our_price, cost, default_qty")
      .eq("is_active", true)
      .order("name");

    let productCatalogSection = "";
    if (products && products.length > 0) {
      const lines = products
        .map((p) => `  - ${p.name} [${p.item_type ?? "material"}, ${p.unit ?? "EA"}]`)
        .join("\n");
      productCatalogSection = `\n\nPRODUCT CATALOG (use EXACT names from this list when building the proposal):\n${lines}\n\nCRITICAL: Always use the exact product name from the catalog above as the "description" in line items. If no catalog match exists, use the name as stated in the notes.`;
    }

    const systemPrompt = `You are an expert AV/smart home proposal builder for a high-end installation company.
Your job is to parse a sales rep's field notes about a customer's project and produce a structured JSON proposal prefill.
${productCatalogSection}

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
3. For each product mentioned: match to catalog by name, set quantity, unit=EA (or FT for cable/wire), itemType=material
4. For labor mentions: itemType=labor, unit=HR, quantity=hours, laborHours=hours
5. Tax environment: home/house/residence/bedroom → residential; office/warehouse/commercial → commercial
6. Tax project type: new construction → original_construction; renovations → remodel; most residential installs → general_installation_repair
7. Put any extra rep instructions, customer preferences, or context into the "notes" field
8. Generate a descriptive title from the project type and customer name`;

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
            content: `Parse these field notes and produce the ProposalPrefill JSON:\n\n${notes}${contactName ? `\n\nCustomer name: ${contactName}` : ""}`,
          },
        ],
        max_tokens: 2000,
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

    let proposalId: string | null = null;

    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("tax_rate, tax_environment, tax_project_type")
        .eq("id", contactId)
        .maybeSingle();

      const { data: newProposal, error: proposalError } = await supabase
        .from("proposals")
        .insert({
          contact_id: contactId,
          title: prefill.title || `Design Brief - ${contactName || "Customer"}`,
          status: "designing",
          tax_environment: prefill.taxEnvironment || contact?.tax_environment || "residential",
          tax_project_type: prefill.taxProjectType || contact?.tax_project_type || "general_installation_repair",
          tax_rate: contact?.tax_rate || 0,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (!proposalError && newProposal) {
        proposalId = newProposal.id;

        if (prefill.rooms && prefill.rooms.length > 0) {
          for (let roomIndex = 0; roomIndex < prefill.rooms.length; roomIndex++) {
            const room = prefill.rooms[roomIndex];

            const { data: newRoom, error: roomError } = await supabase
              .from("proposal_rooms")
              .insert({
                proposal_id: proposalId,
                name: room.name,
                sort_order: roomIndex,
              })
              .select("id")
              .single();

            if (!roomError && newRoom && room.lineItems && room.lineItems.length > 0) {
              const productNames = room.lineItems.map((li) => li.description);
              const { data: catalogProducts } = await supabase
                .from("products")
                .select("id, name, our_price, cost, unit, default_qty, default_labor_hours")
                .in("name", productNames);

              const productMap = new Map<string, { id: string; name: string; our_price: number | null; cost: number | null; unit: string | null; default_qty: number | null; default_labor_hours: number | null }>();
              if (catalogProducts) {
                for (const p of catalogProducts) {
                  if (p) productMap.set(p.name, p);
                }
              }

              const lineItemInserts = room.lineItems.map((li, liIndex) => {
                const catalogMatch = productMap.get(li.description);
                const unitPrice = catalogMatch?.our_price ?? 0;
                const cost = catalogMatch?.cost ?? 0;
                const qty = li.quantity || catalogMatch?.default_qty || 1;
                const laborHours = li.laborHours ?? catalogMatch?.default_labor_hours ?? null;
                const lineTotal = qty * unitPrice;

                return {
                  proposal_id: proposalId,
                  room_id: newRoom.id,
                  product_id: catalogMatch?.id || null,
                  description: li.description,
                  quantity: qty,
                  unit: li.unit || "EA",
                  cost: cost,
                  unit_price: unitPrice,
                  line_total: lineTotal,
                  item_type: li.itemType || "material",
                  labor_hours: laborHours,
                  sort_order: liIndex,
                };
              });

              await supabase.from("proposal_line_items").insert(lineItemInserts);
            }
          }
        }

        await supabase
          .from("design_briefs")
          .update({
            linked_proposal_id: proposalId,
            status: "submitted",
          })
          .eq("id", briefId);
      }
    } else {
      await supabase
        .from("design_briefs")
        .update({ status: "submitted" })
        .eq("id", briefId);
    }

    const { data: repProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
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
      JSON.stringify({ success: true, prefill, proposalId }),
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
