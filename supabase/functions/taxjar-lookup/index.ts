import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TaxJarRatesResponse {
  rate: {
    zip: string;
    country: string;
    country_rate?: string;
    state: string;
    state_rate: string;
    county?: string;
    county_rate: string;
    city?: string;
    city_rate: string;
    combined_district_rate: string;
    combined_rate: string;
    freight_taxable: boolean;
  };
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const action: string = payload.action || "rates";
    const zipCode: string | undefined = payload.zipCode;
    const street: string | undefined = payload.street;
    const city: string | undefined = payload.city;
    const state: string | undefined = payload.state;
    // When true, automatically upsert the result into tax_jurisdictions as a cached entry
    const autoSave: boolean = payload.autoSave === true;
    const organizationId: string | undefined = payload.organizationId;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await supabaseClient
      .from("company_settings")
      .select("taxjar_api_key, organization_id")
      .maybeSingle();

    const apiKey = settings?.taxjar_api_key;

    if (!apiKey) {
      return jsonResponse(
        { error: "TaxJar API key is not configured. Add your TaxJar live token in Admin > Tax Rate Management." },
        400
      );
    }

    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // ── TEST ──────────────────────────────────────────────────────────────────
    if (action === "test") {
      const resp = await fetch("https://api.taxjar.com/v2/categories", {
        headers: authHeaders,
      });
      if (!resp.ok) {
        const text = await resp.text();
        return jsonResponse(
          { error: `TaxJar authentication failed: ${resp.status} ${text}` },
          resp.status
        );
      }
      return jsonResponse({ ok: true, message: "TaxJar connection verified." });
    }

    // ── RATES ─────────────────────────────────────────────────────────────────
    if (action === "rates") {
      if (!zipCode) {
        return jsonResponse({ error: "zipCode is required" }, 400);
      }

      const params = new URLSearchParams();
      if (street) params.append("street", street);
      if (city) params.append("city", city);
      if (state) params.append("state", state);
      const query = params.toString();
      const url = `https://api.taxjar.com/v2/rates/${encodeURIComponent(zipCode)}${query ? `?${query}` : ""}`;

      const resp = await fetch(url, { headers: authHeaders });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`TaxJar rates error ${resp.status}: ${text}`);
        return jsonResponse(
          { error: `TaxJar rate lookup failed (${resp.status}). Please verify your zip code and API key.` },
          resp.status
        );
      }

      const data = (await resp.json()) as TaxJarRatesResponse;
      const rate = data.rate;

      if (!rate) {
        return jsonResponse({ error: "TaxJar did not return a tax rate for this address." }, 404);
      }

      const stateRate = toNumber(rate.state_rate);
      const countyRate = toNumber(rate.county_rate);
      const cityRate = toNumber(rate.city_rate);
      const specialRate = toNumber(rate.combined_district_rate);
      const combinedRate = toNumber(rate.combined_rate);
      const city_label = rate.city || city || "";
      const county_label = rate.county || "";
      const stateCode = rate.state;

      const jurisdictionName = [
        city_label,
        county_label ? `${county_label} County` : null,
        stateCode,
      ]
        .filter(Boolean)
        .join(", ");

      const result = {
        zipCode: rate.zip || zipCode,
        city: city_label,
        county: county_label,
        state: stateCode,
        combinedRate,
        stateRate,
        countyRate,
        cityRate,
        specialRate,
        jurisdictionName,
        freightTaxable: rate.freight_taxable,
        source: "taxjar",
      };

      // Auto-save: upsert into tax_jurisdictions as a TaxJar-sourced cached entry
      if (autoSave) {
        const orgId = organizationId || settings?.organization_id;
        if (orgId) {
          const upsertData: Record<string, unknown> = {
            organization_id: orgId,
            zip_code: result.zipCode,
            city: result.city || null,
            county: result.county || null,
            state: stateCode,
            combined_rate: combinedRate,
            state_rate: stateRate,
            county_rate: countyRate,
            city_rate: cityRate,
            special_rate: specialRate,
            jurisdiction_name: jurisdictionName,
            source: "taxjar",
            last_verified_at: new Date().toISOString(),
            is_active: true,
          };

          // Upsert by (organization_id, zip_code) — update rates if zip already exists
          const { error: upsertError } = await supabaseClient
            .from("tax_jurisdictions")
            .upsert(upsertData, {
              onConflict: "organization_id,zip_code",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error("Auto-save upsert error:", upsertError.message);
            // Non-fatal — still return the rate
          }
        }
      }

      return jsonResponse(result);
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    console.error("taxjar-lookup error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to lookup tax rate" },
      500
    );
  }
});
