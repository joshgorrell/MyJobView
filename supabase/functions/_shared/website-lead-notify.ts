import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
export async function notifyWebsiteLead(db: SupabaseClient, leadId: string) {
  const {data:job,error} = await db.from("website_lead_notification_outbox").update({state:"sending",attempted_at:new Date().toISOString()}).eq("lead_id",leadId).eq("state","pending").select("organization_id").maybeSingle();
  if(error || !job) return;
  let state = "review";
  try {
    const {data:lead,error:leadError} = await db.from("leads").select("assigned_to,is_fishbowl").eq("id",leadId).eq("organization_id",job.organization_id).single();
    if(leadError || !lead) throw new Error("Lead unavailable");
    let query = db.from("profiles").select("email").eq("organization_id",job.organization_id).eq("is_active",true).eq("email_leads",true);
    if(lead.assigned_to) query=query.eq("id",lead.assigned_to);
    else if(!lead.is_fishbowl) throw new Error("Unknown routing");
    const {data:people,error:peopleError}=await query;
    if(peopleError) throw peopleError;
    const to=[...new Set((people??[]).map(p=>p.email).filter((v):v is string=>typeof v==="string" && !!v))];
    if(to.length) {
      const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const response=await fetch(Deno.env.get("SUPABASE_URL")+"/functions/v1/send-lead-notification",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({leadId,to}),signal:AbortSignal.timeout(15000)});
      if(!response.ok || !(await response.json()).success) throw new Error("Delivery uncertain");
    }
    state="sent";
  } catch { /* Ambiguous delivery must be reviewed, not blindly retried. */ }
  await db.from("website_lead_notification_outbox").update({state}).eq("lead_id",leadId).eq("state","sending");
}
