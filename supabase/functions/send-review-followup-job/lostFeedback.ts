const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function lostFeedbackEmail(
  name: string,
  company: string,
  opportunity: string,
  url: string,
  logo = "",
) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px"><div style="max-width:600px;margin:auto;background:white;border-radius:16px;padding:32px">${logo ? `<img src="${escape(logo)}" alt="${escape(company)}" style="max-width:220px;max-height:60px">` : `<h2>${escape(company)}</h2>`}<h1 style="color:#0e7490">Could you tell us why?</h1><p>Hi ${escape(name || "there")},</p><p>We recently asked for your feedback about ${escape(opportunity)}. Since we did not earn your business, could you take 30 seconds to tell us why? Your honest answer helps us improve.</p><p><a href="${escape(url)}" style="display:inline-block;background:#0e7490;color:white;padding:16px 24px;border-radius:8px;text-decoration:none">Tell Us Why</a></p><p>This is our final email reminder. Your feedback is shared privately with authorized company reviewers. You can also reply if you prefer.</p><p>Thank you for the opportunity,<br>${escape(company)}</p></div></body></html>`;
}
async function tokenFor(id: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode("lost-feedback-reminder:" + id),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const hash = async (token: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
async function checked(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function proposalAnswered(db: any, proposalId: string, org: string) {
  const p = await checked(
    db
      .from("proposals")
      .select("status,decline_reason,declined_by")
      .eq("id", proposalId)
      .eq("organization_id", org)
      .maybeSingle(),
  );
  if (
    !p ||
    ["approved", "approved_pending_action", "cancelled"].includes(p.status)
  )
    return true;
  if (
    p.declined_by === "customer" &&
    p.decline_reason &&
    !["unknown", "no_response"].includes(p.decline_reason)
  )
    return true;
  const manual = await checked(
    db
      .from("proposal_loss_feedback")
      .select("id")
      .eq("proposal_id", proposalId)
      .eq("organization_id", org)
      .in("source", ["phone", "email"])
      .limit(1),
  );
  return !!manual?.length;
}
export async function sendLostFeedbackReminders(
  db: any,
  send: any,
  settings: any,
  org: any,
  secret: string,
  now = new Date(),
) {
  if (!org.lost_review_followup_enabled) return { sent: 0, errors: 0 };
  const cutoff = new Date(
      now.getTime() - (org.lost_review_followup_days ?? 7) * 86400000,
    ).toISOString(),
    claimCutoff = new Date(now.getTime() - 15 * 60000).toISOString();
  const rows = await checked(
    db
      .from("lost_review_details")
      .select(
        "request_id,proposal_id,opportunity_name,title,review_requests:request_id(sent_at,recipient_name,recipient_email)",
      )
      .eq("organization_id", org.organization_id)
      .eq("auto_followup_enabled", true)
      .eq("delivery_status", "sent")
      .is("responded_at", null)
      .is("follow_up_sent_at", null)
      .or(`followup_claimed_at.is.null,followup_claimed_at.lt.${claimCutoff}`),
  );
  let sent = 0,
    errors = 0;
  for (const row of rows || []) {
    let claimed = false;
    try {
      const request = Array.isArray(row.review_requests)
        ? row.review_requests[0]
        : row.review_requests;
      if (
        !request?.sent_at ||
        request.sent_at > cutoff ||
        !request.recipient_email
      )
        continue;
      if (
        row.proposal_id &&
        (await proposalAnswered(db, row.proposal_id, org.organization_id))
      )
        continue;
      const claim = await checked(
        db
          .from("lost_review_details")
          .update({ followup_claimed_at: now.toISOString() })
          .eq("request_id", row.request_id)
          .eq("organization_id", org.organization_id)
          .is("responded_at", null)
          .is("follow_up_sent_at", null)
          .eq("auto_followup_enabled", true)
          .or(
            `followup_claimed_at.is.null,followup_claimed_at.lt.${claimCutoff}`,
          )
          .select("request_id")
          .maybeSingle(),
      );
      if (!claim) continue;
      claimed = true;
      const token = await tokenFor(row.request_id, secret);
      const saved = await checked(
        db
          .from("lost_review_tokens")
          .update({ followup_token_hash: await hash(token) })
          .eq("request_id", row.request_id)
          .gt("expires_at", now.toISOString())
          .select("request_id")
          .maybeSingle(),
      );
      if (!saved) throw new Error("Feedback token is missing or expired.");
      const base = settings.subdomain
        ? `https://${settings.subdomain}.myjobview.com`
        : settings.app_url;
      if (!base || !base.startsWith("https://"))
        throw new Error("Configure a secure dealer app URL.");
      const url = new URL("/lost-opportunity-review", base);
      url.searchParams.set("token", token);
      const latest = await checked(
        db
          .from("lost_review_details")
          .select("responded_at,auto_followup_enabled")
          .eq("request_id", row.request_id)
          .eq("organization_id", org.organization_id)
          .single(),
      );
      if (
        latest.responded_at ||
        !latest.auto_followup_enabled ||
        (row.proposal_id &&
          (await proposalAnswered(db, row.proposal_id, org.organization_id)))
      )
        continue;
      const result = await send({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `lost-feedback-${row.request_id}`,
        },
        body: JSON.stringify({
          from: settings.from_address,
          to: request.recipient_email,
          reply_to: settings.reply_to_email,
          subject: `Could you tell us why? ${row.title || row.opportunity_name}`,
          html: lostFeedbackEmail(
            request.recipient_name,
            settings.company_name,
            row.opportunity_name,
            url.toString(),
            settings.company_logo_url,
          ),
        }),
      });
      if (!result.ok) throw new Error("Feedback reminder delivery failed.");
      await checked(
        db
          .from("lost_review_details")
          .update({ follow_up_sent_at: now.toISOString() })
          .eq("request_id", row.request_id)
          .eq("organization_id", org.organization_id),
      );
      sent++;
    } catch (e) {
      console.error("Lost feedback reminder failed", row.request_id, e);
      errors++;
    } finally {
      if (claimed)
        await checked(
          db
            .from("lost_review_details")
            .update({ followup_claimed_at: null })
            .eq("request_id", row.request_id)
            .eq("organization_id", org.organization_id)
            .eq("followup_claimed_at", now.toISOString()),
        );
    }
  }
  return { sent, errors };
}
