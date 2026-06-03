import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ZipTaxResponse {
  version: string;
  rCode: number;
  results: Array<{
    geoPostalCode: string;
    geoCity: string;
    geoCounty: string;
    geoState: string;
    taxSales: number;
    taxUse: number;
    txbService: string;
    txbFreight: string;
    stateSalesTax: number;
    stateUseTax: number;
    citySalesTax: number;
    cityUseTax: number;
    cityTaxCode: string;
    countySalesTax: number;
    countyUseTax: number;
    countyTaxCode: string;
    districtSalesTax: number;
    districtUseTax: number;
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { zipCode } = await req.json();

    if (!zipCode) {
      return new Response(
        JSON.stringify({ error: "Zip code is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get API key from company settings
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data: settings } = await supabaseClient
      .from("company_settings")
      .select("zip_tax_api_key")
      .single();

    const apiKey = settings?.zip_tax_api_key || "free";

    // Call ZIP-Tax.com API
    const zipTaxUrl = `https://api.zip-tax.com/request/v40?key=${apiKey}&postalcode=${zipCode}`;

    const response = await fetch(zipTaxUrl);

    if (!response.ok) {
      console.error(`ZIP-Tax API HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`ZIP-Tax API error: ${response.statusText}`);
    }

    const data: ZipTaxResponse = await response.json();

    console.log(`ZIP-Tax API response for ${zipCode}:`, JSON.stringify(data));

    // Check if we got valid results
    if (data.rCode !== 100) {
      console.error(`ZIP-Tax API returned error code: ${data.rCode}`);

      let errorMessage = 'Tax rate lookup failed. ';
      switch (data.rCode) {
        case 101:
          errorMessage += 'The free ZIP-Tax API key is no longer valid. To enable automatic tax lookups, sign up for a free API key at zip-tax.com and add it to your company settings. For now, please enter tax rates manually.';
          break;
        case 102:
          errorMessage += 'Daily API limit reached. Please try again tomorrow or enter manually.';
          break;
        case 103:
          errorMessage += 'Invalid zip code format.';
          break;
        default:
          errorMessage += `Error code: ${data.rCode}. Please enter tax rate manually.`;
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          zipCode,
          rCode: data.rCode,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!data.results || data.results.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Tax rate not found for this zip code",
          zipCode,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const result = data.results[0];

    // Format the response for our application
    const taxData = {
      zipCode: result.geoPostalCode,
      city: result.geoCity,
      county: result.geoCounty,
      state: result.geoState,
      combinedRate: result.taxSales,
      stateRate: result.stateSalesTax,
      countyRate: result.countySalesTax,
      cityRate: result.citySalesTax,
      specialRate: result.districtSalesTax,
      jurisdictionName: `${result.geoCity}, ${result.geoCounty} County, ${result.geoState}`,
      source: "zip-tax-api",
    };

    return new Response(
      JSON.stringify(taxData),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error looking up tax rate:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to lookup tax rate",
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