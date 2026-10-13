export type LaborSource = {
  source: "ipoint" | "quickbooks_time";
  enabled: boolean;
  native_from: string | null;
  last_success_at: string | null;
  last_error: string | null;
};
export type LaborBundle = {
  timezone: string;
  roster: { id: string; name: string; hire_date?: string | null }[];
  configs: {
    profile_id: string;
    compensation_type: string;
    expected_weekly_hours: number;
    work_days: string[] | null;
    effective_from: string;
    effective_to: string | null;
  }[];
  mappings: {
    source: string;
    external_employee_id: string;
    profile_id: string;
  }[];
  holidays: string[];
  sources: LaborSource[];
  snapshots: {
    source: string;
    kind: string;
    day: string;
    payload: { records: any[]; source?: string; updatedAt?: string };
  }[];
  project_snapshot: LaborBundle["snapshots"][number] | null;
  latest_job_day: string | null;
  latest_payroll_day: string | null;
  native_jobs: { profile_id: string; day: string; hours: number }[];
  native_payroll: {
    profile_id: string;
    day: string;
    hours: number;
    leave_hours: number;
    needs_review: boolean;
  }[];
  native_projects: {
    project_id: string;
    project_name: string;
    hours_sold: number | null;
    hours_used: number | null;
    status: string;
  }[];
};
export type LaborDay = {
  day: string;
  job: number | null;
  payroll: number | null;
  leave: number | null;
  unknown: number | null;
  efficiency: number | null;
  assumed: boolean;
  jobSource: string;
  payrollSource: string;
  flags: string[];
  matchedJob: number;
  matchedPayroll: number;
  matched: boolean;
};
const week = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const n = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
export const validLaborDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export function periodDates(mode: string, value: string): [string, string] {
  if (mode === "day") return [value, value];
  if (mode === "month") {
    const [y, m] = value.split("-").map(Number);
    return [
      value + "-01",
      value +
        "-" +
        String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0"),
    ];
  }
  return [value + "-01-01", value + "-12-31"];
}
export function laborHistory(
  b: LaborBundle,
  id: string,
  start: string,
  end: string,
  asOf: string,
): LaborDay[] {
  if (
    !validLaborDay(start) ||
    !validLaborDay(end) ||
    start > end ||
    Date.parse(end) - Date.parse(start) > 1830 * 86400000
  )
    return [];
  const mapping = (source: string) =>
    b.mappings.find((m) => m.profile_id === id && m.source === source)
      ?.external_employee_id;
  const native = (source: string, day: string) => {
    const cutoff = b.sources.find((s) => s.source === source)?.native_from;
    return !!cutoff && day >= cutoff;
  };
  const rows: LaborDay[] = [];
  for (
    let t = Date.parse(start + "T12:00:00Z");
    t <=
    Math.min(Date.parse(end + "T12:00:00Z"), Date.parse(asOf + "T12:00:00Z"));
    t += 86400000
  ) {
    const day = new Date(t).toISOString().slice(0, 10),
      flags: string[] = [];
    const hire = b.roster.find((r) => r.id === id)?.hire_date;
    if (hire && day < hire) continue;
    const cfg = b.configs
      .filter(
        (c) =>
          c.profile_id === id &&
          c.effective_from <= day &&
          (!c.effective_to || c.effective_to >= day),
      )
      .sort((a, c) => c.effective_from.localeCompare(a.effective_from))[0];
    const jobNative = native("ipoint", day),
      payNative = native("quickbooks_time", day);
    const j = jobNative
      ? b.native_jobs.find((j) => j.profile_id === id && j.day === day)
      : b.snapshots
          .find((s) => s.kind === "technician" && s.day === day)
          ?.payload.records.find((r) => r.technician === mapping("ipoint"));
    const p = payNative
      ? b.native_payroll.find((p) => p.profile_id === id && p.day === day)
      : b.snapshots
          .find((s) => s.kind === "payroll" && s.day === day)
          ?.payload.records.find(
            (r) => String(r.user_id) === mapping("quickbooks_time"),
          );
    const job = j ? n(jobNative ? j.hours : j.job_hours) : null,
      leave = p ? n(p.leave_hours) : null,
      unknown = p ? n(payNative ? 0 : p.unknown_hours) : null;
    flags.push(...(j?.review_flags ?? []), ...(p?.flags ?? []));
    if (p?.needs_review) flags.push("Open or unreviewed payroll clock entry");
    const assumed = cfg?.compensation_type === "salary";
    const workdays = cfg?.work_days?.length
      ? cfg.work_days
      : ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const workday =
      workdays.includes(week[new Date(day + "T12:00:00Z").getUTCDay()]) &&
      !b.holidays.includes(day);
    const payroll = assumed
      ? !p || cfg.expected_weekly_hours == null
        ? null
        : workday
          ? Math.max(
              0,
              Number(cfg.expected_weekly_hours) / workdays.length -
                (leave ?? 0),
            )
          : 0
      : p
        ? n(payNative ? p.hours : p.worked_hours)
        : null;
    if (!cfg)
      flags.push("Employee payroll configuration missing for this date");
    if (job === null && ((payroll ?? 0) > 0 || (!p && workday)))
      flags.push("Job report or entry missing");
    if (!p && (workday || (job ?? 0) > 0))
      flags.push("Payroll/leave coverage missing");
    if (unknown && unknown > 0) flags.push("Unclassified payroll hours");
    if (payroll === 0 && job !== null && job > 0 && !assumed)
      flags.push("Job hours without payroll work hours");
    if (payroll !== null && payroll > 0 && job === 0)
      flags.push("Paid work hours but no positive job time");
    if (!assumed && workday && payroll === 0 && leave === 0)
      flags.push("No payroll or leave record; review attendance");
    const sourceClean =
      !!cfg &&
      !!p &&
      job !== null &&
      job >= 0 &&
      payroll !== null &&
      !j?.review_flags?.length &&
      !p?.flags?.length &&
      !p?.needs_review &&
      !(unknown && unknown > 0);
    const matched =
      sourceClean &&
      ((payroll! > 0 && (assumed || job! <= payroll! + 0.05)) ||
        (assumed && payroll === 0 && job! > 0));
    if (
      !assumed &&
      job !== null &&
      payroll !== null &&
      payroll > 0 &&
      job > payroll + 0.05
    )
      flags.push("Job hours exceed payroll; efficiency withheld");
    if (assumed && job !== null && payroll !== null && job > payroll + 0.05)
      flags.push("Job hours exceed assumed paid hours");
    rows.push({
      day,
      job,
      payroll,
      leave,
      unknown,
      assumed,
      jobSource: jobNative ? "MJV" : "iPoint",
      payrollSource: assumed
        ? "Salary assumption"
        : payNative
          ? "MJV"
          : "QuickBooks Time",
      flags: [...new Set(flags)],
      matched,
      matchedJob: matched ? job! : 0,
      matchedPayroll: matched ? payroll! : 0,
      efficiency: matched && payroll! > 0 ? (job! / payroll!) * 100 : null,
    });
  }
  return rows;
}
export function laborSummary(rows: LaborDay[]) {
  const total = (key: "job" | "payroll" | "leave") =>
    rows.some((r) => r[key] !== null)
      ? rows.reduce((v, r) => v + (r[key] ?? 0), 0)
      : null;
  const matchedPayroll = rows.reduce((v, r) => v + r.matchedPayroll, 0),
    matchedJob = rows.reduce((v, r) => v + r.matchedJob, 0);
  return {
    job: total("job"),
    payroll: total("payroll"),
    leave: total("leave"),
    matchedPayroll,
    matchedJob,
    matchedDays: rows.filter((r) => r.matched).length,
    efficiency: matchedPayroll > 0 ? (matchedJob / matchedPayroll) * 100 : null,
    flags: rows.flatMap((r) => r.flags.map((f) => r.day + ": " + f)),
  };
}
export function laborRanking(
  b: LaborBundle,
  start: string,
  end: string,
  asOf: string,
  by: "efficiency" | "job",
) {
  const metric = (r: any) => r[by] ?? -Infinity;
  const sorted = b.roster
    .map((p) => ({
      ...p,
      ...laborSummary(laborHistory(b, p.id, start, end, asOf)),
    }))
    .sort((a, c) => metric(c) - metric(a) || a.name.localeCompare(c.name));
  return sorted.map((r) => ({
    ...r,
    rank:
      r[by] === null
        ? null
        : sorted.findIndex(
            (p) =>
              p[by] !== null &&
              Math.round(p[by]! * 100) === Math.round(r[by]! * 100),
          ) + 1,
  }));
}
