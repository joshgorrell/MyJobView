import {
  laborHistory,
  laborSummary,
  type LaborBundle,
  type LaborDay,
} from "./laborDashboard";

export function duration(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const minutes = Math.round(Math.abs(hours) * 60);
  return `${hours < 0 && minutes ? "−" : ""}${Math.floor(minutes / 60).toLocaleString("en-US")}h ${String(minutes % 60).padStart(2, "0")}m`;
}
export const percentage = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
export function shiftDay(day: string, days: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function reportPeriod(
  preset: string,
  today: string,
  from: string,
  through: string,
) {
  const yesterday = shiftDay(today, -1);
  if (preset === "day") return [yesterday, yesterday];
  if (preset === "week") {
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    // On Monday, show the last completed week rather than an empty period.
    const monday = shiftDay(today, -(dow === 0 ? 6 : dow - 1));
    return monday > yesterday
      ? [shiftDay(monday, -7), yesterday]
      : [monday, yesterday];
  }
  if (preset === "month")
    return today.endsWith("-01")
      ? [shiftDay(yesterday, 1 - Number(yesterday.slice(8))), yesterday]
      : [today.slice(0, 7) + "-01", yesterday];
  if (preset === "year")
    return today.endsWith("-01-01")
      ? [yesterday.slice(0, 4) + "-01-01", yesterday]
      : [today.slice(0, 4) + "-01-01", yesterday];
  return [from, through];
}
export function priorPeriod(start: string, end: string) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return [shiftDay(start, -days), shiftDay(start, -1)];
}
export function summarizeProduction(history: LaborDay[]) {
  const summary = laborSummary(history);
  return {
    job: summary.job,
    available: summary.payroll,
    utilization: summary.efficiency,
    matchedJob: summary.matchedJob,
    matchedAvailable: summary.matchedPayroll,
    matchedDays: summary.matchedDays,
    assumed: history.some((day) => day.assumed),
    // Missing coverage stays unknown; it never becomes wasted time.
    outside:
      summary.matchedPayroll > 0
        ? history.reduce(
            (sum, day) =>
              sum +
              (day.matched
                ? Math.max(0, day.matchedPayroll - day.matchedJob)
                : 0),
            0,
          )
        : null,
  };
}
export function productionReport(
  bundle: LaborBundle,
  start: string,
  end: string,
  asOf: string,
) {
  const [priorStart, priorEnd] = priorPeriod(start, end);
  const rows = bundle.roster.map((person) => {
    const history = laborHistory(bundle, person.id, start, end, asOf);
    const previous = summarizeProduction(
      laborHistory(bundle, person.id, priorStart, priorEnd, asOf),
    );
    return { ...person, history, ...summarizeProduction(history), previous };
  });
  const historyByDay = new Map<string, LaborDay[]>();
  for (const row of rows)
    for (const day of row.history) {
      const group = historyByDay.get(day.day) ?? [];
      group.push(day);
      historyByDay.set(day.day, group);
    }
  const trend = [...historyByDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, history]) => ({ day, ...summarizeProduction(history) }));
  const job = rows.some((r) => r.job !== null)
    ? rows.reduce((sum, r) => sum + (r.job ?? 0), 0)
    : null;
  const available = rows.some((r) => r.available !== null)
    ? rows.reduce((sum, r) => sum + (r.available ?? 0), 0)
    : null;
  const matchedAvailable = rows.reduce((sum, r) => sum + r.matchedAvailable, 0);
  const matchedJob = rows.reduce((sum, r) => sum + r.matchedJob, 0);
  return {
    rows,
    trend,
    job,
    available,
    matchedAvailable,
    utilization:
      matchedAvailable > 0 ? (matchedJob / matchedAvailable) * 100 : null,
  };
}
export type ProductionRow = ReturnType<typeof productionReport>["rows"][number];
export function rankProduction(
  rows: ProductionRow[],
  by: "utilization" | "job",
) {
  const sorted = [...rows].sort(
    (a, b) =>
      (b[by] ?? -Infinity) - (a[by] ?? -Infinity) ||
      a.name.localeCompare(b.name),
  );
  let last: number | null = null,
    rank = 0;
  return sorted.map((row, index) => {
    const value =
      row[by] == null ? null : Math.round(row[by]! * (by === "job" ? 60 : 10));
    if (value !== null && value !== last) rank = index + 1;
    last = value;
    return { ...row, rank: value === null ? null : rank };
  });
}
