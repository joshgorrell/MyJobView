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

interface TaxJarTaxesResponse {
  tax: {
    order_total_amount: number;
    shipping: number;
    taxable_amount: number;
    amount_to_collect: number;
    rate: number;
    has_nexus: boolean;
    freight_taxable: boolean;
    tax_source: string;
    breakdown: Record<string, unknown>;
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await supabaseClient
      .from("company_settings")
      .select("taxjar_api_key, organization_id")
      .maybeSingle();

    const apiKey = settings?.taxjar_api_key;

    // ── TAXES (authoritative transaction calculation) ─────────────────────────
    // This action accepts ONLY transaction_type and transaction_id from the
    // client. All other data (origin, destination, taxable subtotal, taxability,
    // nexus, exemption) is derived server-side via the calculate_tax RPC.
    if (action === "taxes") {
      const transactionType: string | undefined = payload.transaction_type;
      const transactionId: string | undefined = payload.transaction_id;

      if (!transactionType || !transactionId) {
        return jsonResponse(
          { error: "transaction_type and transaction_id are required" },
          400
        );
      }

      // Step 1: Call the MJV calculation engine to get the full decision context
      const { data: calcResult, error: calcError } = await supabaseClient.rpc(
        "calculate_tax",
        {
          p_transaction_type: transactionType,
          p_transaction_id: transactionId,
        }
      );

      if (calcError) {
        console.error("calculate_tax RPC error:", calcError.message);
        return jsonResponse(
          { error: "Failed to run MJV tax calculation: " + calcError.message },
          500
        );
      }

      if (!calcResult) {
        return jsonResponse({ error: "No result from calculate_tax" }, 500);
      }

      if (calcResult.error) {
        return jsonResponse({ error: calcResult.error }, 400);
      }

      const calcStatus: string = calcResult.tax_calculation_status;

      // Step 2: If no TaxJar call is needed, return the MJV result immediately
      if (calcStatus === "exempt") {
        return jsonResponse({
          ...calcResult,
          taxjar_skipped: true,
          taxjar_skip_reason: "Transaction is exempt",
        });
      }

      if (calcStatus === "not_collecting") {
        return jsonResponse({
          ...calcResult,
          taxjar_skipped: true,
          taxjar_skip_reason: "Dealer is not collecting in this state",
        });
      }

      if (calcStatus === "review_required") {
        return jsonResponse({
          ...calcResult,
          taxjar_skipped: true,
          taxjar_skip_reason: "MJV review required before TaxJar calculation",
        });
      }

      // Step 3: Status is "ready" -- proceed to call TaxJar /v2/taxes
      if (!apiKey) {
        const { data: failResult } = await supabaseClient.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: "TaxJar API key not configured",
          }
        );
        return jsonResponse(failResult ?? { error: "TaxJar API key not configured" });
      }

      // Step 4: Build the TaxJar request from MJV's server-side result
      const origin = calcResult.origin_result;
      const destination = calcResult.destination_result;
      const taxableSubtotal = toNumber(calcResult.taxable_subtotal);

      const taxjarBody: Record<string, unknown> = {
        from_country: "US",
        from_state: origin?.state || null,
        from_zip: origin?.zip || null,
        from_city: origin?.city || null,
        from_street: origin?.street || null,
        to_country: "US",
        to_state: destination?.state || null,
        to_zip: destination?.zip || null,
        to_city: destination?.city || null,
        to_street: destination?.street || null,
        amount: taxableSubtotal,
        shipping: 0,
      };

      // Remove null values -- TaxJar prefers omitting optional params
      const cleanBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(taxjarBody)) {
        if (value !== null && value !== undefined) {
          cleanBody[key] = value;
        }
      }

      // Step 5: Call TaxJar /v2/taxes
      let taxjarResponse: Response;
      try {
        taxjarResponse = await fetch("https://api.taxjar.com/v2/taxes", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(cleanBody),
        });
      } catch (fetchError) {
        const reason = fetchError instanceof Error
          ? `TaxJar request failed: ${fetchError.message}`
          : "TaxJar request failed: network error";
        const { data: failResult } = await supabaseClient.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      // Step 6: Handle HTTP failures
      if (!taxjarResponse.ok) {
        const statusCode = taxjarResponse.status;
        const errorText = await taxjarResponse.text();
        let reason: string;

        if (statusCode === 401 || statusCode === 403) {
          reason = "TaxJar authentication failed";
        } else if (statusCode === 408) {
          reason = "TaxJar request timed out";
        } else if (statusCode >= 500) {
          reason = `TaxJar unavailable (HTTP ${statusCode})`;
        } else {
          reason = `TaxJar request failed (HTTP ${statusCode}: ${errorText})`;
        }

        console.error(`TaxJar /v2/taxes error ${statusCode}: ${errorText}`);
        const { data: failResult } = await supabaseClient.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      // Step 7: Validate the TaxJar response
      const taxjarData = (await taxjarResponse.json()) as TaxJarTaxesResponse;
      const tax = taxjarData?.tax;

      if (!tax || tax.amount_to_collect === undefined || tax.rate === undefined) {
        const reason = "TaxJar returned incomplete response";
        const { data: failResult } = await supabaseClient.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      // Step 8: Persist the authoritative TaxJar result
      const { data: persistResult, error: persistError } = await supabaseClient.rpc(
        "persist_taxjar_result",
        {
          p_transaction_type: transactionType,
          p_transaction_id: transactionId,
          p_taxjar_result: tax,
        }
      );

      if (persistError) {
        console.error("persist_taxjar_result RPC error:", persistError.message);
        const reason = "Failed to persist TaxJar result: " + persistError.message;
        const { data: failResult } = await supabaseClient.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      return jsonResponse(persistResult ?? { error: "No result from persist_taxjar_result" });
    }

    // ── For test and rates actions, API key is required upfront ──────────────
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

    const zipCode: string | undefined = payload.zipCode;
    const street: string | undefined = payload.street;
    const city: string | undefined = payload.city;
    const state: string | undefined = payload.state;
    const autoSave: boolean = payload.autoSave === true;
    const organizationId: string | undefined = payload.organizationId;

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
