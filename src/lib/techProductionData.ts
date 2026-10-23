import { supabase } from "./supabase";
import type { LaborBundle } from "./laborDashboard";

type Identity = { id: string; organization_id: string; role: string };
// In-memory only, bounded, and keyed by the complete viewer identity. No report survives sign-out.
let cacheGeneration = 0;
const reports = new Map<string, { at: number; data: LaborBundle }>();
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    cacheGeneration++;
    reports.clear();
  }
});
export async function readPages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  signal: AbortSignal,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    if (signal.aborted) throw new Error("Report request cancelled");
    const { data, error } = await query(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
export async function loadProduction(
  viewer: Identity,
  start: string,
  end: string,
  signal: AbortSignal,
  refresh = false,
) {
  const sessionGeneration = cacheGeneration;
  const key = [viewer.organization_id, viewer.id, viewer.role, start, end].join(
    ":",
  );
  const cached = reports.get(key);
  if (!refresh && cached && Date.now() - cached.at < 60000) return cached.data;
  let bundle: LaborBundle;
  // The production RPC enforces Tech Stats authorization and organization isolation.
  // All authorized viewers must receive the same report rather than a native-only fallback.
  const { data, error } = await supabase
    .rpc("get_tech_production", { p_start: start, p_end: end })
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Production report is unavailable");
  bundle = data as LaborBundle;
  if (signal.aborted || sessionGeneration !== cacheGeneration)
    throw new Error("Report request cancelled");
  if (reports.size >= 6) reports.delete(reports.keys().next().value!);
  reports.set(key, { at: Date.now(), data: bundle });
  return bundle;
}
export type JobEntry = {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  notes: string | null;
  work_order_id: string | null;
  project_id: string | null;
  contact_id: string | null;
  work_order: { title: string; work_order_number: string } | null;
  project: { name: string } | null;
  contact: { full_name: string; company_name: string } | null;
};
export async function loadProductionEntries(
  organization: string,
  technician: string,
  start: string,
  end: string,
  signal: AbortSignal,
) {
  return readPages<JobEntry>(
    (from, to) =>
      supabase
        .from("time_entries")
        .select(
          "id, entry_date, clock_in, clock_out, total_hours, notes, work_order_id, project_id, contact_id, work_order:work_orders!work_order_id(title, work_order_number), project:projects!project_id(name), contact:contacts!contact_id(full_name, company_name)",
        )
        .eq("organization_id", organization)
        .eq("technician_id", technician)
        .gte("entry_date", start)
        .lte("entry_date", end)
        .in("entry_type", ["work_order", "project", "customer_activity"])
        .eq("status", "approved")
        .not("clock_out", "is", null)
        .order("entry_date", { ascending: false })
        .order("id")
        .range(from, to)
        .abortSignal(signal) as unknown as PromiseLike<{
        data: JobEntry[] | null;
        error: { message: string } | null;
      }>,
    signal,
  );
}
