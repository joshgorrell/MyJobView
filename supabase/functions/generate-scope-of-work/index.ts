import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChangeOrderItem {
  action_type: string;
  product_name: string;
  product_description: string | null;
  new_quantity: number | null;
  new_unit_price: number | null;
  new_total: number | null;
  change_amount: number | null;
  install_location: string | null;
  item_type: string;
}

interface ChangeOrderData {
  change_order_number: string;
  title: string;
  description: string | null;
  reason: string | null;
  change_amount: number;
  approval_date: string | null;
  items: ChangeOrderItem[];
}

interface ProposalData {
  proposal_title: string;
  contact_name: string;
  rooms: Array<{
    name: string;
    scope_of_work: string | null;
    items: Array<{
      product_name: string;
      description: string | null;
      quantity: number;
      item_type: string;
    }>;
  }>;
  change_orders?: ChangeOrderData[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { data: settings, error: settingsError } = await supabaseClient
      .from("company_settings")
      .select("openai_api_key")
      .single();

    if (settingsError || !settings?.openai_api_key) {
      throw new Error(
        "OpenAI API key not configured. Please add your OpenAI API key in Admin > Settings > Integrations."
      );
    }

    const apiKey = settings.openai_api_key;

    const { data: recentRequests } = await supabaseClient
      .from('activity_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('action', 'ai_scope_generation')
      .gte('created_at', new Date(Date.now() - 10000).toISOString())
      .limit(1);

    if (recentRequests && recentRequests.length > 0) {
      throw new Error(
        "Please wait 10 seconds between AI generation requests to avoid rate limits."
      );
    }

    await supabaseClient
      .from('activity_log')
      .insert({
        user_id: user.id,
        action: 'ai_scope_generation',
        entity_type: 'proposal',
        details: { timestamp: new Date().toISOString() }
      });

    const { proposalData }: { proposalData: ProposalData } = await req.json();

    const hasChangeOrders = proposalData.change_orders && proposalData.change_orders.length > 0;

    let analysisText = `Generate a professional, customer-facing Scope of Work document for the following project:\n\n`;
    analysisText += `PROJECT: ${proposalData.proposal_title}\n`;
    analysisText += `CUSTOMER: ${proposalData.contact_name}\n\n`;

    analysisText += `BASE SCOPE - AREAS AND ITEMS:\n\n`;
    proposalData.rooms.forEach((room) => {
      analysisText += `${room.name}:\n`;
      if (room.scope_of_work) {
        analysisText += `  Area Notes: ${room.scope_of_work}\n`;
      }
      room.items.forEach((item) => {
        analysisText += `  - ${item.product_name} (Qty: ${item.quantity})`;
        if (item.description) {
          analysisText += ` - ${item.description}`;
        }
        analysisText += ` [Type: ${item.item_type}]\n`;
      });
      analysisText += `\n`;
    });

    if (hasChangeOrders) {
      analysisText += `\nAPPROVED CHANGE ORDERS (${proposalData.change_orders!.length} total):\n`;
      analysisText += `These changes have been approved and must be incorporated into the final scope:\n\n`;

      proposalData.change_orders!.forEach((co) => {
        const approvedDate = co.approval_date
          ? new Date(co.approval_date).toLocaleDateString()
          : "N/A";
        analysisText += `Change Order ${co.change_order_number}: ${co.title}\n`;
        analysisText += `  Approved: ${approvedDate} | Amount Change: $${(co.change_amount || 0).toLocaleString()}\n`;
        if (co.description) {
          analysisText += `  Description: ${co.description}\n`;
        }
        if (co.reason) {
          analysisText += `  Reason: ${co.reason}\n`;
        }
        if (co.items && co.items.length > 0) {
          analysisText += `  Items:\n`;
          co.items.forEach((item) => {
            const action = item.action_type === 'add' ? 'ADD' : item.action_type === 'remove' ? 'REMOVE' : 'MODIFY';
            analysisText += `    [${action}] ${item.product_name}`;
            if (item.new_quantity) analysisText += ` (Qty: ${item.new_quantity})`;
            if (item.product_description) analysisText += ` - ${item.product_description}`;
            if (item.install_location) analysisText += ` @ ${item.install_location}`;
            analysisText += `\n`;
          });
        }
        analysisText += `\n`;
      });
    }

    const changeOrderInstruction = hasChangeOrders
      ? `\nIMPORTANT: This project has ${proposalData.change_orders!.length} approved change order(s) that modify the original scope. The generated document must present a UNIFIED, REVISED scope that seamlessly integrates both the original work and all change order modifications. Do NOT list them separately — weave them together into a cohesive final scope. Include a brief "Scope Amendments" section that summarizes what changed from the original.`
      : "";

    const prompt = `${analysisText}${changeOrderInstruction}

Based on the above project details, generate a comprehensive, professional Scope of Work document that includes:

1. PROJECT OVERVIEW - A compelling 2-3 sentence summary of what will be accomplished
2. SCOPE OF WORK - Detailed breakdown by area/room with professional descriptions of what will be installed/configured${hasChangeOrders ? ' (integrated with all approved change orders)' : ''}
3. DELIVERABLES - Clear list of what the customer will receive
4. PROJECT APPROACH - How the work will be executed, including any phasing
${hasChangeOrders ? '5. SCOPE AMENDMENTS - Brief summary of changes from original contract\n6. TIMELINE - Estimated timeline with phases (be realistic based on scope)' : '5. TIMELINE - Estimated timeline with phases (be realistic based on scope)'}

FORMATTING REQUIREMENTS:
- Use ALL CAPS for section headings
- Use bullet points (•) for lists
- Write in professional, customer-facing language
- Be specific and detailed
- Focus on benefits and outcomes for the customer
- Avoid technical jargon - explain in terms customers understand
- Make it 400-800 words total

Generate the scope of work now:`;

    let response;
    let data;
    let generatedScope;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
        console.log(`Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are an expert technical sales writer who creates compelling, professional scope of work documents for smart home, AV, and security integration projects. Write in a clear, benefit-focused style that helps customers understand exactly what they're getting."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        }
      );

      if (response.ok) {
        data = await response.json();
        if (data?.choices?.[0]?.message?.content) {
          generatedScope = data.choices[0].message.content;
          break;
        }
      }

      const errorData = await response.text();
      console.error(`OpenAI API error (attempt ${attempt + 1}/${maxRetries + 1}):`, errorData);

      if (response.status === 429) {
        if (attempt < maxRetries) {
          continue;
        }
        throw new Error(
          "OpenAI API rate limit exceeded. Please wait a moment and try again."
        );
      }

      let errorMessage = "Failed to generate scope of work";
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorData.substring(0, 200);
      }

      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    }

    if (!generatedScope) {
      throw new Error("Invalid response from OpenAI API");
    }

    return new Response(
      JSON.stringify({ scope_of_work: generatedScope }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating scope of work:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to generate scope of work",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
