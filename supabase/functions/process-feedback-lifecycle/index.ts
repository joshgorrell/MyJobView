import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type SurveyType = "job_completion" | "post_test_tune" | "one_year";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return new Response("Unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date();
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  const anniversary = oneYearAgo.toISOString().slice(0, 10);

  const results: any[] = [];

  async function send(project: any, surveyType: SurveyType) {
    const contact = project.contacts;
    if (!contact?.email) return results.push({ project_id: project.id, survey_type: surveyType, status: "skipped_no_email" });

    const existing = await db.from("customer_satisfaction").select("id")
      .eq("project_id", project.id).eq("survey_type", surveyType).limit(1).maybeSingle();
    if (existing.data) return results.push({ project_id: project.id, survey_type: surveyType, status: "already_sent" });

    let salesRepId = null, leadTechId = null;
    if (project.sales_order_id) {
      const so = await db.from("sales_orders").select("sales_rep_id,lead_technician_id").eq("id", project.sales_order_id).maybeSingle();
      salesRepId = so.data?.sales_rep_id || null;
      leadTechId = so.data?.lead_technician_id || null;
    }

    const response = await fetch(`${url}/functions/v1/send-satisfaction-email`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: project.contact_id,
        customerName: contact.first_name || contact.contact_name || contact.full_name || "",
        customerEmail: contact.email,
        salesRepId, leadTechId,
        surveyType, projectId: project.id, salesOrderId: project.sales_order_id
      })
    });
    if (!response.ok) throw new Error(`${surveyType} send failed: ${response.status} ${await response.text()}`);
    results.push({ project_id: project.id, survey_type: surveyType, status: "sent" });
  }

  const common = "id,name,contact_id,sales_order_id,substantial_completion_date,test_tune_started_at,contacts:contact_id(contact_name,full_name,first_name,email)";

  // Day 0 feedback. <= today also safely catches a transient failed run; uniqueness makes it idempotent.
  const completion = await db.from("projects").select(common).not("substantial_completion_date", "is", null)
    .lte("substantial_completion_date", today).limit(100);
  if (completion.error) throw completion.error;
  for (const project of completion.data || []) {
    try { await send(project, "job_completion"); } catch (e) { results.push({ project_id: project.id, survey_type: "job_completion", status: "error", error: String(e) }); }
  }

  // Post-Test & Tune feedback is anchored to the authoritative Sales Order end date.
  const ended = await db.from("sales_orders").select("id,test_tune_end_date,projects!inner(id,name,contact_id,sales_order_id,substantial_completion_date,test_tune_started_at,contacts:contact_id(contact_name,full_name,first_name,email))")
    .not("test_tune_end_date", "is", null).lte("test_tune_end_date", today).limit(100);
  if (ended.error) throw ended.error;
  for (const order of ended.data || []) {
    for (const project of order.projects || []) {
      try { await send(project, "post_test_tune"); } catch (e) { results.push({ project_id: project.id, survey_type: "post_test_tune", status: "error", error: String(e) }); }
    }
  }

  // One-year check-in uses substantial completion anniversary, independent of T&T timing.
  const yearly = await db.from("projects").select(common).eq("substantial_completion_date", anniversary).limit(100);
  if (yearly.error) throw yearly.error;
  for (const project of yearly.data || []) {
    try { await send(project, "one_year"); } catch (e) { results.push({ project_id: project.id, survey_type: "one_year", status: "error", error: String(e) }); }
  }

  return new Response(JSON.stringify({ date: today, results }), { headers: { "Content-Type": "application/json" } });
});
