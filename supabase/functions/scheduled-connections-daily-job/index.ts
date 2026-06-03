import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/generate_scheduled_occurrences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "apikey": supabaseServiceKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate occurrences: ${error}`);
    }

    const rolloverResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/rollover_incomplete_occurrences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "apikey": supabaseServiceKey,
      },
    });

    if (!rolloverResponse.ok) {
      const error = await rolloverResponse.text();
      throw new Error(`Failed to rollover occurrences: ${error}`);
    }

    const generatedCount = await response.json();
    const rolledOverCount = await rolloverResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily scheduled connections job completed",
        generated: generatedCount,
        rolledOver: rolledOverCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in scheduled connections daily job:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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
