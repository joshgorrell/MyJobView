import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const canonical = (v: any): string =>
  Array.isArray(v)
    ? "[" + v.map(canonical).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .filter((k) => k !== "updatedAt")
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}"
      : JSON.stringify(v);
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers
    .get("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{40,200})$/)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: key, error: keyError } = await admin
    .from("labor_sync_credentials")
    .select("organization_id")
    .eq("token_hash", hash)
    .eq("enabled", true)
    .maybeSingle();
  if (keyError || !key) return json({ error: "Unauthorized" }, 401);
  try {
    const raw = await req.text();
    if (raw.length > 4000000) return json({ error: "Import too large" }, 413);
    const body = JSON.parse(raw);
    if (
      !["ipoint", "quickbooks_time"].includes(body.source) ||
      !Array.isArray(body.snapshots) ||
      body.snapshots.length > 1000
    )
      throw Error("Invalid import");
    for (const s of body.snapshots) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(s.day) ||
        !Array.isArray(s.records) ||
        !s.records.length
      )
        throw Error("Invalid snapshot");
      if (
        !(
          (body.source === "ipoint" &&
            ["technician", "project"].includes(s.kind)) ||
          (body.source === "quickbooks_time" && s.kind === "payroll")
        )
      )
        throw Error("Invalid source kind");
      const seen = new Set();
      for (const r of s.records) {
        const id =
          s.kind === "project"
            ? r.project_id
            : s.kind === "payroll"
              ? r.user_id
              : r.technician;
        if (id == null || seen.has(id))
          throw Error("Duplicate or missing record identity");
        seen.add(id);
        const fields =
          s.kind === "project"
            ? ["hours_sold", "hours_used"]
            : s.kind === "payroll"
              ? [
                  "worked_hours",
                  "leave_hours",
                  "paid_break_hours",
                  "unpaid_break_hours",
                  "unknown_hours",
                ]
              : ["job_hours"];
        for (const f of fields)
          if (
            typeof r[f] !== "number" ||
            !Number.isFinite(r[f]) ||
            (f !== "job_hours" && r[f] < 0)
          )
            throw Error("Invalid hours");
        if (s.kind === "project" && typeof r.project_name !== "string")
          throw Error("Project name required");
      }
    }
    const { data, error } = await admin.rpc("ingest_external_labor", {
      p_organization_id: key.organization_id,
      p_source: body.source,
      p_snapshots: body.snapshots,
    });
    if (error) return json({ error: "Labor import was not saved" }, 400);
    if (data.disabled) return json({ verified: false, ...data });
    const { data: source, error: sourceError } = await admin
      .from("labor_import_sources")
      .select("native_from")
      .eq("organization_id", key.organization_id)
      .eq("source", body.source)
      .single();
    if (sourceError)
      return json({ error: "Labor import readback failed" }, 503);
    const expected = body.snapshots.filter(
      (s: any) => !source.native_from || s.day < source.native_from,
    );
    if (expected.length) {
      const { data: stored, error: readError } = await admin
        .from("external_labor_snapshots")
        .select("kind,day,payload")
        .eq("organization_id", key.organization_id)
        .eq("source", body.source)
        .in(
          "day",
          expected.map((s: any) => s.day),
        );
      if (
        readError ||
        expected.some(
          (s: any) =>
            canonical(
              stored?.find((r: any) => r.kind === s.kind && r.day === s.day)
                ?.payload,
            ) !== canonical(s),
        )
      )
        return json({ error: "Labor import readback did not match" }, 503);
    }
    return json({ verified: true, ...data });
  } catch {
    return json({ error: "Invalid labor import" }, 400);
  }
});
