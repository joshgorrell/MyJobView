import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings, error: settingsError } = await supabase
      .from("company_settings")
      .select("google_maps_api_key")
      .maybeSingle();

    if (settingsError || !settings?.google_maps_api_key) {
      return new Response(
        JSON.stringify({ error: "Google Maps API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = settings.google_maps_api_key;
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint || !["geocode", "distancematrix"].includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: "Invalid endpoint. Use 'geocode' or 'distancematrix'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let mapsUrl: string;

    if (endpoint === "geocode") {
      const address = url.searchParams.get("address");
      const latlng = url.searchParams.get("latlng");
      if (!address && !latlng) {
        return new Response(
          JSON.stringify({ error: "address or latlng parameter required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const params = new URLSearchParams({ key: apiKey });
      if (address) params.set("address", address);
      if (latlng) params.set("latlng", latlng);
      mapsUrl = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
    } else {
      const origins = url.searchParams.get("origins");
      const destinations = url.searchParams.get("destinations");
      if (!origins || !destinations) {
        return new Response(
          JSON.stringify({ error: "origins and destinations parameters required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const params = new URLSearchParams({
        origins,
        destinations,
        units: url.searchParams.get("units") || "imperial",
        key: apiKey,
      });
      mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;
    }

    const mapsResponse = await fetch(mapsUrl);
    const mapsData = await mapsResponse.json();

    return new Response(JSON.stringify(mapsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
