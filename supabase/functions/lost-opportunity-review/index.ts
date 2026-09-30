import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { wrapInEmailLayout } from "../_shared/emailTemplates.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reasons = [
  "price",
  "value",
  "company",
  "design",
  "equipment",
  "communication",
  "process",
  "timing",
  "cancelled",
  "other",
];
const types = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
const hash = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const b = await req.json();
    const checked = async (result: any) => {
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    if (["load", "submit"].includes(b.action)) {
      if (typeof b.token !== "string" || b.token.length > 100) {
        return json({ error: "Invalid link" }, 400);
      }
      const token = await checked(
        await admin.from("lost_review_tokens").select("request_id,expires_at")
          .eq("token_hash", await hash(b.token)).maybeSingle(),
      );
      if (!token || Date.parse(token.expires_at) < Date.now()) {
        return json({ error: "This review link is invalid or expired." }, 404);
      }
      const detail = await checked(
        await admin.from("lost_review_details").select("*").eq(
          "request_id",
          token.request_id,
        ).single(),
      );
      if (b.action === "load") {
        const settings = await checked(
          await admin.from("company_settings").select(
            "company_name,company_logo_url",
          ).eq("organization_id", detail.organization_id).maybeSingle(),
        );
        return json({
          title: detail.title,
          opportunity_name: detail.opportunity_name,
          company_name: settings?.company_name || "Our team",
          company_logo_url: settings?.company_logo_url,
          completed: !!detail.responded_at,
        });
      }
      if (detail.responded_at) {
        return json({ success: true, already_submitted: true });
      }
      const selected = Array.isArray(b.reasons) ? [...new Set(b.reasons)] : [];
      if (
        selected.some((r) => !reasons.includes(r as string)) ||
        typeof b.message !== "string" || b.message.length > 10000 ||
        (!selected.length && !b.message.trim()) ||
        !["yes", "maybe", "no"].includes(b.recoverable) ||
        typeof b.recovery_message !== "string" ||
        b.recovery_message.length > 10000
      ) {
        return json({
          error:
            "Please select a reason or add a message, and answer whether we have another chance.",
        }, 400);
      }
      const files = b.files || [];
      if (!Array.isArray(files) || files.length > 5) {
        return json({ error: "Upload up to five files." }, 400);
      }
      const decoded = [];
      for (const f of files) {
        if (
          !types.includes(f.type) || typeof f.name !== "string" ||
          f.name.length > 200 || typeof f.data !== "string" ||
          f.data.length > 14000000
        ) {
          return json({
            error: "Use PDF, JPG, PNG or WebP files, up to 10 MB each.",
          }, 400);
        }
        const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
        if (bytes.length > 10485760) {
          return json({ error: "File exceeds 10 MB." }, 400);
        }
        const valid = f.type === "application/pdf"
          ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
          : f.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : f.type === "image/png"
          ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 &&
            bytes[3] === 71
          : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
        if (!valid) {
          return json({ error: "File contents do not match its type." }, 400);
        }
        decoded.push({ f, bytes });
      }
      const attachments = [];
      try {
        for (const { f, bytes } of decoded) {
          const path =
            `${detail.organization_id}/${detail.request_id}/${crypto.randomUUID()}`;
          await checked(
            await admin.storage.from("lost-review-bids").upload(path, bytes, {
              contentType: f.type,
            }),
          );
          attachments.push({ path, name: f.name, type: f.type });
        }
        const result = await admin.from("lost_review_responses").insert({
          request_id: detail.request_id,
          reasons: selected,
          message: b.message.trim(),
          recoverable: b.recoverable,
          recovery_message: b.recovery_message.trim(),
          attachments,
        });
        if (result.error) {
          if (attachments.length) {
            await admin.storage.from("lost-review-bids").remove(
              attachments.map((a) => a.path),
            );
          }
          if (result.error.code === "23505") {
            return json({ success: true, already_submitted: true });
          }
          throw result.error;
        }
      } catch (e) {
        if (attachments.length) {
          await admin.storage.from("lost-review-bids").remove(
            attachments.map((a) => a.path),
          );
        }
        throw e;
      }
      return json({ success: true });
    }
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
      },
    );
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const profile = await checked(
      await admin.from("profiles").select("organization_id,role,is_active").eq(
        "id",
        user.id,
      ).single(),
    );
    if (!profile.organization_id || !profile.is_active) {
      return json({ error: "Employee access required" }, 403);
    }
    const access = await checked(
      await client.rpc("flow_has_module_access", { p_module: "reviews" }),
    );
    if (!access) return json({ error: "Reviews access required" }, 403);
    const org = profile.organization_id;
    const owner = await checked(
      await admin.from("lost_review_owners").select("owner_id").eq(
        "organization_id",
        org,
      ).maybeSingle(),
    );
    if (b.action === "set_owner") {
      if (
        owner
          ? owner.owner_id !== user.id
          : !["admin", "owner"].includes(profile.role)
      ) {
        return json({
          error: "Only the designated owner can change this setting.",
        }, 403);
      }
      const target = await checked(
        await admin.from("profiles").select("id").eq("id", b.owner_id).eq(
          "organization_id",
          org,
        ).eq("is_active", true).single(),
      );
      await checked(
        await admin.from("lost_review_owners").upsert({
          organization_id: org,
          owner_id: target.id,
        }),
      );
      return json({ success: true });
    }
    if (!owner) {
      return json({
        error: "Designate the owner in Reviews before sending requests.",
      }, 400);
    }
    if (b.action === "create") {
      // Use the user's RLS-scoped customer lookup as well as an explicit tenant check.
      const contact = await checked(
        await client.from("contacts").select(
          "id,organization_id,email,contact_name,first_name,company_name",
        ).eq("id", b.contact_id).eq("organization_id", org).single(),
      );
      if (!contact.email) {
        return json({ error: "This customer needs an email address." }, 400);
      }
      if (
        typeof b.opportunity_name !== "string" || !b.opportunity_name.trim() ||
        b.opportunity_name.length > 200 || typeof b.title !== "string" ||
        !b.title.trim() || b.title.length > 300
      ) return json({ error: "Enter an opportunity name and title." }, 400);
      if (b.proposal_id) {
        await checked(
          await client.from("proposals").select("id").eq("id", b.proposal_id)
            .eq("contact_id", contact.id).eq("organization_id", org).single(),
        );
      }
      const settings = await checked(
        await admin.from("company_settings").select(
          "company_name,company_email,company_logo_url,from_email,from_name,reply_to_email,app_url",
        ).eq("organization_id", org).maybeSingle(),
      );
      const organization = await checked(
        await admin.from("organizations").select("subdomain").eq("id", org)
          .single(),
      );
      const base = organization.subdomain
        ? `https://${organization.subdomain}.myjobview.com`
        : settings?.app_url;
      if (!base || !/^https:\/\//.test(base)) {
        return json(
          { error: "Configure the dealer app URL before sending." },
          400,
        );
      }
      if (!Deno.env.get("RESEND_API_KEY")) {
        return json({ error: "Email delivery is not configured." }, 503);
      }
      const request = await checked(
        await admin.from("review_requests").insert({
          contact_id: contact.id,
          sent_by: user.id,
          organization_id: org,
          method: "email",
          request_type: "lost_opportunity",
          auto_followup_enabled: false,
          recipient_email: contact.email,
          recipient_name: contact.contact_name,
        }).select("id").single(),
      );
      await checked(
        await admin.from("lost_review_details").insert({
          request_id: request.id,
          organization_id: org,
          proposal_id: b.proposal_id || null,
          opportunity_name: b.opportunity_name.trim(),
          title: b.title.trim(),
        }),
      );
      const token = crypto.randomUUID() + crypto.randomUUID();
      await checked(
        await admin.from("lost_review_tokens").insert({
          request_id: request.id,
          token_hash: await hash(token),
        }),
      );
      const url = new URL("/lost-opportunity-review", base);
      url.searchParams.set("token", token);
      const company = escape(settings?.company_name || "Our team");
      const html = wrapInEmailLayout(
        `<p>Hi ${
          escape(contact.first_name || contact.contact_name || "there")
        },</p><p>Thank you for giving ${company} the opportunity to help with your <strong>${
          escape(b.opportunity_name)
        }</strong>.</p><h2>${
          escape(b.title)
        }</h2><p>Was it price, the design, another company, or something we could have done better?</p><p><strong>Your response goes directly to our owner first.</strong> Our owner personally reviews every response before sharing it with your salesperson or anyone else on our team. Constructive criticism is absolutely welcome. We want to improve and earn another chance to win you over.</p><p><a href="${
          escape(url.toString())
        }" style="display:inline-block;padding:16px 24px;background:#0e7490;color:white;border-radius:8px;text-decoration:none">Tell Our Owner Why →</a></p><p>${company} price matches. If you would prefer to work with us but price is standing in the way, upload the competing proposal through the form. For comparable equipment and scope, we will work to <strong>meet or beat their price. If we can't, we'll buy you dinner.</strong></p><p>Thank you again for considering us.</p><p><em>Innovate. Integrate. Inspire.</em></p>`,
        company,
        escape(settings?.company_email || ""),
        "#0e7490",
        settings?.company_logo_url || "",
      ).replace(
        "You received this email because you recently worked with us.<br>Thank you for your business.",
        "Thank you for giving us the opportunity to earn your business.",
      );
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${
            settings?.from_name || settings?.company_name || "Our team"
          } <${settings?.from_email || settings?.company_email}>`,
          to: contact.email,
          reply_to: settings?.reply_to_email || settings?.company_email,
          subject: b.title,
          html,
        }),
      });
      await checked(
        await admin.from("lost_review_details").update({
          delivery_status: result.ok ? "sent" : "failed",
        }).eq("request_id", request.id),
      );
      if (!result.ok) {
        return json({
          error:
            "Email could not be delivered. The failed request is recorded in Reviews.",
        }, 502);
      }
      return json({ success: true, request_id: request.id });
    }
    const detail = await checked(
      await admin.from("lost_review_details").select("*").eq(
        "request_id",
        b.request_id,
      ).eq("organization_id", org).single(),
    );
    if (["review", "share", "outcome"].includes(b.action)) {
      if (owner.owner_id !== user.id) {
        return json({
          error: "Only the designated owner can review or share feedback.",
        }, 403);
      }
      if (!detail.responded_at) {
        return json({ error: "There is no response yet." }, 400);
      }
      const now = new Date().toISOString();
      const update = b.action === "review"
        ? { reviewed_at: now }
        : b.action === "share"
        ? { reviewed_at: detail.reviewed_at || now, shared_at: now }
        : { recovery_outcome: b.outcome };
      if (
        b.action === "outcome" &&
        !["following_up", "recovered", "closed"].includes(b.outcome)
      ) return json({ error: "Invalid outcome" }, 400);
      await checked(
        await admin.from("lost_review_details").update(update).eq(
          "request_id",
          detail.request_id,
        ),
      );
      return json({ success: true });
    }
    if (b.action === "download") {
      if (owner.owner_id !== user.id && !detail.shared_at) {
        return json({ error: "Feedback is owner only." }, 403);
      }
      const response = await checked(
        await admin.from("lost_review_responses").select("attachments").eq(
          "request_id",
          detail.request_id,
        ).single(),
      );
      if (!response.attachments.some((a: any) => a.path === b.path)) {
        return json({ error: "Attachment not found" }, 404);
      }
      const signed = await checked(
        await admin.storage.from("lost-review-bids").createSignedUrl(
          b.path,
          60,
        ),
      );
      return json({ url: signed.signedUrl });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("Lost review request failed", e);
    return json(
      { error: "Unable to process this request. Please try again." },
      400,
    );
  }
});
