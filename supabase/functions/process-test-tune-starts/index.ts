import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${serviceKey}`) return new Response("Unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const today = new Date();
  const due = new Date(today);
  due.setUTCDate(due.getUTCDate() - 7);
  const dueDate = due.toISOString().slice(0, 10);

  const { data: settings } = await supabase.from("test_tune_settings").select("test_tune_period_days").limit(1).maybeSingle();
  const ttDays = settings?.test_tune_period_days || 90;

  const { data: projects, error } = await supabase.from("projects")
    .select("id,name,contact_id,organization_id,sales_order_id,substantial_completion_date,contacts:contact_id(contact_name,full_name,first_name,last_name,company_name,email)")
    .not("substantial_completion_date", "is", null)
    .lte("substantial_completion_date", dueDate)
    .is("test_tune_started_at", null)
    .limit(100);
  if (error) throw error;

  const results: any[] = [];
  for (const project of projects || []) {
    try {
      const contact: any = project.contacts;
      if (!project.contact_id || !contact?.email) {
        results.push({ project_id: project.id, status: "skipped", reason: "missing contact/email" });
        continue;
      }

      const start = new Date();
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + ttDays);

      // Reuse active access when a human already invited the customer from Punchlist or an invoice.
      let { data: grant } = await supabase.from("punchlist_access_grants")
        .select("id,expiration_date")
        .eq("contact_id", project.contact_id)
        .eq("status", "active")
        .or(`expiration_date.is.null,expiration_date.gte.${start.toISOString().slice(0,10)}`)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (!grant) {
        const inserted = await supabase.from("punchlist_access_grants").insert({
          contact_id: project.contact_id,
          organization_id: project.organization_id,
          project_id: project.id,
          sales_order_id: project.sales_order_id,
          access_type: "test_and_tune",
          status: "active",
          granted_date: start.toISOString(),
          expiration_date: end.toISOString(),
          notes: "Automatic Test & Tune activation 7 days after substantial completion"
        }).select("id,expiration_date").single();
        if (inserted.error) throw inserted.error;
        grant = inserted.data;
      }

      const startedAt = start.toISOString();
      const projectUpdate = await supabase.from("projects").update({ test_tune_started_at: startedAt })
        .eq("id", project.id).is("test_tune_started_at", null).select("id").maybeSingle();
      if (projectUpdate.error) throw projectUpdate.error;
      if (!projectUpdate.data) {
        results.push({ project_id: project.id, status: "already_started" });
        continue;
      }

      if (project.sales_order_id) {
        await supabase.from("sales_orders").update({
          test_tune_status: "active",
          test_tune_start_date: start.toISOString().slice(0,10),
          test_tune_end_date: end.toISOString().slice(0,10)
        }).eq("id", project.sales_order_id);
      }

      // Close any legacy auto-queued pending invite; manual/invoice sends remain available.
      await supabase.from("pending_punchlist_invites").update({
        status: "sent", reviewed_at: startedAt, invite_sent_at: startedAt, access_grant_id: grant.id,
        notes: "Satisfied by automatic Day-7 Test & Tune activation"
      }).eq("project_id", project.id).eq("status", "pending");

      const name = contact.contact_name || contact.full_name || contact.company_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || "there";
      const emailResponse = await fetch(`${url}/functions/v1/send-punchlist-invite`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_email: contact.email, contact_name: name, project_name: project.name,
          expiration_date: grant.expiration_date || end.toISOString(), access_type: "test_and_tune"
        })
      });
      if (!emailResponse.ok) throw new Error(`Invite email failed: ${emailResponse.status}`);
      results.push({ project_id: project.id, status: "started", access_grant_id: grant.id });
    } catch (e) {
      results.push({ project_id: project.id, status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: { "Content-Type": "application/json" } });
});
