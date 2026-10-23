import { supabase } from "./supabase";
import { getOrganizationTimezone } from "./timezoneUtils";
import type { LaborBundle } from "./laborDashboard";

type NativeEntry = {
  id: string;
  technician_id: string;
  entry_date: string;
  total_hours: number | string | null;
  leave_type?: string | null;
  status?: string | null;
};
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
  if (viewer.role === "admin") {
    const { data, error } = await supabase
      .rpc("get_tech_production", { p_start: start, p_end: end })
      .abortSignal(signal);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Production report is unavailable");
    bundle = data as LaborBundle;
  } else {
    // Keep the existing native-data access path for staff. Imported reports remain admin-only.
    const { data: people, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", viewer.organization_id)
      .in("role", ["tech", "manager"])
      .order("full_name")
      .abortSignal(signal);
    if (error) throw new Error(error.message);
    const [jobs, clocks] = await Promise.all([
      readPages<NativeEntry>(
        (from, to) =>
          supabase
            .from("time_entries")
            .select("id, technician_id, entry_date, total_hours")
            .eq("organization_id", viewer.organization_id)
            .gte("entry_date", start)
            .lte("entry_date", end)
            .in("entry_type", ["work_order", "project", "customer_activity"])
            .eq("status", "approved")
            .not("clock_out", "is", null)
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
      readPages<NativeEntry>(
        (from, to) =>
          supabase
            .from("daily_clock_entries")
            .select(
              "id, technician_id, entry_date, total_hours, leave_type, status",
            )
            .eq("organization_id", viewer.organization_id)
            .gte("entry_date", start)
            .lte("entry_date", end)
            .or("status.in.(clocked_out,approved),payroll_hours_only.eq.true")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
    ]);
    const aggregate = (entries: NativeEntry[]) => {
      const map = new Map<
        string,
        { profile_id: string; day: string; hours: number }
      >();
      for (const entry of entries) {
        const key = entry.technician_id + ":" + entry.entry_date;
        const row = map.get(key) ?? {
          profile_id: entry.technician_id,
          day: entry.entry_date,
          hours: 0,
        };
        row.hours += Number(entry.total_hours) || 0;
        map.set(key, row);
      }
      return [...map.values()];
    };
    const workClocks = aggregate(clocks.filter((entry) => !entry.leave_type));
    const leaveClocks = aggregate(clocks.filter((entry) => entry.leave_type));
    const clockDays = new Map(
      [...workClocks, ...leaveClocks].map((row) => [
        row.profile_id + ":" + row.day,
        row,
      ]),
    );
    bundle = {
      timezone: await getOrganizationTimezone(viewer.organization_id),
      roster: (people ?? []).map((p) => ({ id: p.id, name: p.full_name })),
      configs: (people ?? []).map((p) => ({
        profile_id: p.id,
        compensation_type: "hourly",
        expected_weekly_hours: 40,
        work_days: null,
        effective_from: "1900-01-01",
        effective_to: null,
      })),
      mappings: [],
      holidays: [],
      sources: (["ipoint", "quickbooks_time"] as const).map((source) => ({
        source,
        native_from: "1900-01-01",
        enabled: true,
        last_success_at: null,
        last_error: null,
      })),
      snapshots: [],
      project_snapshot: null,
      native_projects: [],
      native_jobs: aggregate(jobs),
      native_payroll: [...clockDays.values()].map((row) => ({
        ...row,
        hours:
          workClocks.find(
            (clock) =>
              clock.profile_id === row.profile_id && clock.day === row.day,
          )?.hours ?? 0,
        leave_hours:
          leaveClocks.find(
            (clock) =>
              clock.profile_id === row.profile_id && clock.day === row.day,
          )?.hours ?? 0,
        needs_review: clocks.some(
          (clock) =>
            clock.technician_id === row.profile_id &&
            clock.entry_date === row.day &&
            (!["clocked_out", "approved"].includes(clock.status ?? "") ||
              clock.total_hours == null ||
              !Number.isFinite(Number(clock.total_hours)) ||
              Number(clock.total_hours) < 0),
        ),
      })),
      latest_job_day: jobs.length
        ? jobs.map((j) => j.entry_date).sort()[jobs.length - 1]
        : null,
      latest_payroll_day: clocks.length
        ? clocks.map((c) => c.entry_date).sort()[clocks.length - 1]
        : null,
    };
  }
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
