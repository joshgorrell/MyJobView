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
    jurisdictions?: { state?: string; county?: string; city?: string };
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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Authenticate the caller for privileged actions ────────────────────
    // The 'taxes' action performs authoritative tax mutations and must be
    // org-scoped. The 'rates' and 'test' actions are read-only lookups that
    // still need the org's TaxJar API key, so they also require auth.
    const authHeader = req.headers.get("Authorization");
    let userOrgId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
      if (!userError && user) {
        const { data: profile } = await supabaseAuth
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        userOrgId = profile?.organization_id ?? null;
      }
    }

    // ── TAXES (authoritative transaction calculation) ─────────────────────────
    // This action accepts ONLY transaction_type and transaction_id from the
    // client. All other data (origin, destination, taxable subtotal, taxability,
    // nexus, exemption) is derived server-side via the calculate_tax RPC.
    if (action === "taxes" || action === "preview_taxes") {
      const preview = action === "preview_taxes";
      const transactionType: string | undefined = payload.transaction_type;
      const transactionId: string | undefined = payload.transaction_id;

      if (!transactionType || !transactionId) {
        return jsonResponse(
          { error: "transaction_type and transaction_id are required" },
          400
        );
      }

      // ── Authenticate: require a valid signed-in user ─────────────────────
      if (!userOrgId) {
        return jsonResponse(
          { error: "Authentication required for tax calculation" },
          401
        );
      }

      // ── Load the transaction to get its organization_id ──────────────────
      let transactionOrgId: string | null = null;
      const validTypes = ["proposal", "change_order", "invoice"];
      if (!validTypes.includes(transactionType)) {
        return jsonResponse({ error: "Invalid transaction_type" }, 400);
      }

      const tableMap: Record<string, string> = {
        proposal: "proposals",
        change_order: "change_orders",
        invoice: "invoices",
      };

      const { data: txnRow, error: txnError } = await supabaseAdmin
        .from(tableMap[transactionType])
        .select("organization_id")
        .eq("id", transactionId)
        .maybeSingle();

      if (txnError || !txnRow) {
        return jsonResponse({ error: "Transaction not found" }, 404);
      }
      transactionOrgId = txnRow.organization_id;

      // ── Verify the user belongs to the transaction's organization ────────
      if (userOrgId !== transactionOrgId) {
        return jsonResponse(
          { error: "You do not have access to this transaction" },
          403
        );
      }

      // ── Load org-scoped company_settings for TaxJar credentials ──────────
      const { data: settings } = await supabaseAdmin
        .from("company_settings")
        .select("taxjar_api_key, organization_id")
        .eq("organization_id", transactionOrgId)
        .maybeSingle();

      const apiKey = settings?.taxjar_api_key;

      // Step 1: Call the MJV calculation engine to get the full decision context
      const { data: calcResult, error: calcError } = await supabaseAdmin.rpc(
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
        if (preview) return jsonResponse({ error: 'TaxJar API key not configured' }, 422);
        const { data: failResult } = await supabaseAdmin.rpc(
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
        if (preview) return jsonResponse({ error: reason }, 502);
        const { data: failResult } = await supabaseAdmin.rpc(
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
        if (preview) return jsonResponse({ error: reason }, 502);
        const { data: failResult } = await supabaseAdmin.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      // TaxJar returns flat breakdown fields. Keep them and supply the
      // nested jurisdiction fields expected by the snapshot writer.
      const taxjarData = await taxjarResponse.json().catch(() => null) as TaxJarTaxesResponse | null;
      const tax = taxjarData?.tax;
      const breakdown = tax?.breakdown;
      const rates = [
        breakdown?.state_tax_rate,
        breakdown?.county_tax_rate,
        breakdown?.city_tax_rate,
        breakdown?.special_tax_rate,
      ];
      if (!tax || tax.has_nexus !== true ||
          !Number.isFinite(tax.amount_to_collect) || tax.amount_to_collect < 0 ||
          !Number.isFinite(tax.rate) || tax.rate < 0 || tax.rate > 1 ||
          !tax.jurisdictions?.state ||
          rates.some(rate => typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1)) {
        const reason = "TaxJar did not confirm collection and return a complete jurisdiction breakdown.";
        if (preview) return jsonResponse({ error: reason }, 502);
        const { data: failResult } = await supabaseAdmin.rpc(
          "mark_tax_review_required",
          {
            p_transaction_type: transactionType,
            p_transaction_id: transactionId,
            p_failure_reason: reason,
          }
        );
        return jsonResponse(failResult ?? { error: reason });
      }

      if (preview) {
        return jsonResponse({
          tax_calculation_status: "ready",
          tax_amount: tax.amount_to_collect,
          tax_rate: tax.rate,
          taxable_subtotal: taxableSubtotal,
          source: "taxjar_preview",
        });
      }

      // Step 8: Persist the authoritative TaxJar result
      const { data: persistResult, error: persistError } = await supabaseAdmin.rpc(
        "persist_taxjar_result",
        {
          p_transaction_type: transactionType,
          p_transaction_id: transactionId,
          p_taxjar_result: {
            ...tax,
            ...(transactionType === "invoice" ? {
              invoice_tax_inputs: [
                calcStatus, calcResult.origin_result ?? null, calcResult.destination_result ?? null,
                calcResult.taxable_subtotal ?? null, calcResult.taxability_results ?? null,
                calcResult.collection_status ?? null, calcResult.exemption_reference ?? null,
              ],
            } : {}),
            breakdown: {
              ...breakdown,
              state: { state_abbrev: tax.jurisdictions.state, state_rate: rates[0] },
              county: { county_name: tax.jurisdictions.county, county_rate: rates[1] },
              city: { city_name: tax.jurisdictions.city, city_rate: rates[2] },
              special: { special_rate: rates[3] },
            },
          },
        }
      );

      if (persistError) {
        console.error("persist_taxjar_result RPC error:", persistError.message);
        const reason = "Failed to persist TaxJar result: " + persistError.message;
        const { data: failResult } = await supabaseAdmin.rpc(
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

    // ── For test and rates actions, require auth and org-scoped settings ────
    if (!userOrgId) {
      return jsonResponse(
        { error: "Authentication required" },
        401
      );
    }

    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("taxjar_api_key, organization_id")
      .eq("organization_id", userOrgId)
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

    const zipCode: string | undefined = payload.zipCode;
    const street: string | undefined = payload.street;
    const city: string | undefined = payload.city;
    const state: string | undefined = payload.state;
    const verifyAddress = payload.verifyAddress === true;
    const autoSave: boolean = payload.autoSave === true;

    // ── TEST ──────────────────────────────────────────────────────────────────
    if (action === "test") {
      // Synthetic quote. This endpoint does not create an order in TaxJar.
      let response: Response;
      try {
        response = await fetch("https://api.taxjar.com/v2/taxes", {
          method: "POST",
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            from_country: "US", from_state: "KS", from_zip: "66603",
            to_country: "US", to_state: "KS", to_zip: "66603",
            amount: 100, shipping: 0,
          }),
        });
      } catch {
        return jsonResponse({ error: "TaxJar calculation service is unreachable." }, 502);
      }

      if (!response.ok) {
        const error = response.status === 401 || response.status === 403
          ? "TaxJar rejected the configured credential."
          : `TaxJar calculation failed (HTTP ${response.status}).`;
        return jsonResponse({ error }, response.status);
      }

      const data = await response.json().catch(() => null) as TaxJarTaxesResponse | null;
      const tax = data?.tax;
      if (!tax || typeof tax.has_nexus !== "boolean" ||
          !Number.isFinite(tax.amount_to_collect) || tax.amount_to_collect < 0 ||
          !Number.isFinite(tax.rate) || tax.rate < 0 || tax.rate > 1) {
        return jsonResponse({ error: "TaxJar returned an invalid test calculation." }, 502);
      }

      return jsonResponse({ ok: true, message: "TaxJar calculation service verified." });
    }

    // ── RATES ─────────────────────────────────────────────────────────────────
    if (action === "rates") {
      if (!zipCode) {
        return jsonResponse({ error: "zipCode is required" }, 400);
      }

      let verifiedAddress: { street: string; city: string; state: string; zip: string } | null = null;
      if (verifyAddress) {
        if (!street?.trim() || !city?.trim() || !state || !/^[A-Z]{2}$/.test(state) ||
            !/^\d{5}(?:-\d{4})?$/.test(zipCode) || autoSave) {
          return jsonResponse({ error: "A complete U.S. street address is required for verification." }, 400);
        }

        const validation = await fetch("https://api.taxjar.com/v2/addresses/validate", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ country: "US", street, city, state, zip: zipCode }),
        });
        if (!validation.ok) {
          return jsonResponse({ error: "TaxJar could not verify this street address." }, 422);
        }
        const { addresses } = await validation.json();
        const match = Array.isArray(addresses) && addresses.length === 1 ? addresses[0] : null;
        if (typeof match?.street !== "string" || !match.street.trim() ||
            typeof match.city !== "string" || !match.city.trim() || match.state !== state ||
            typeof match.zip !== "string" || !/^\d{5}(?:-\d{4})?$/.test(match.zip) ||
            match.zip.slice(0, 5) !== zipCode.slice(0, 5) ||
            (zipCode.length > 5 && match.zip !== zipCode)) {
          return jsonResponse({ error: "TaxJar did not return one matching street address." }, 422);
        }
        verifiedAddress = { street: match.street, city: match.city, state: match.state, zip: match.zip };
      }

      const params = new URLSearchParams();
      if (verifiedAddress) {
        params.set("street", verifiedAddress.street);
        params.set("city", verifiedAddress.city);
        params.set("state", verifiedAddress.state);
      } else {
        if (street) params.set("street", street);
        if (city) params.set("city", city);
        if (state) params.set("state", state);
      }
      const query = params.toString();
      const url = `https://api.taxjar.com/v2/rates/${encodeURIComponent(verifiedAddress?.zip ?? zipCode)}${query ? `?${query}` : ""}`;

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
      const rawRate = rate.combined_rate;
      const verifiedRate = typeof rawRate === "number" || (typeof rawRate === "string" && rawRate.trim())
        ? Number(rawRate)
        : NaN;
      if (verifyAddress && (!Number.isFinite(verifiedRate) || verifiedRate < 0 || verifiedRate > 1 ||
          rate.state !== verifiedAddress?.state || typeof rate.zip !== "string" ||
          rate.zip.slice(0, 5) !== zipCode.slice(0, 5))) {
        return jsonResponse({ error: "TaxJar did not return a valid rate for the verified address." }, 422);
      }
      const combinedRate = verifyAddress ? verifiedRate : toNumber(rawRate);
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
        ...(verifiedAddress ? { verifiedAddress } : {}),
      };

      // Auto-save: upsert into tax_jurisdictions as a TaxJar-sourced cached entry
      // Organization is always derived from the authenticated user — never from
      // a client-supplied organizationId — so a signed-in user cannot write to
      // another organization's tax jurisdiction cache.
      if (autoSave) {
        const orgId = userOrgId;
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
          const { error: upsertError } = await supabaseAdmin
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
