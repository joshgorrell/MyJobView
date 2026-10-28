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
export type ProductionDay = LaborDay & {
  shop: number | null;
  training: number | null;
  unaccounted: number | null;
  excess: number | null;
};
export function productionHistory(
  bundle: LaborBundle,
  id: string,
  start: string,
  end: string,
  asOf: string,
): ProductionDay[] {
  const nativeDays = new Map(
    bundle.native_jobs
      .filter((row) => row.profile_id === id)
      .map((row) => [row.day, row]),
  );
  return laborHistory(bundle, id, start, end, asOf, true).map((day) => {
    // Imported daily totals do not contain shop/training clocks. Never infer categories from the gap.
    const native =
      day.jobSource === "MJV" ? nativeDays.get(day.day) : undefined;
    const shop = native?.shop_hours ?? null;
    const training = native?.training_hours ?? null;
    const reconciled =
      day.clockDataComplete &&
      day.payroll! >= 0 &&
      shop !== null &&
      training !== null &&
      shop >= 0 &&
      training >= 0;
    const difference = reconciled
      ? day.payroll! - day.job! - shop! - training!
      : null;
    return {
      ...day,
      shop,
      training,
      unaccounted:
        difference === null
          ? null
          : Math.max(0, Math.abs(difference) < 0.000001 ? 0 : difference),
      excess:
        difference === null
          ? null
          : Math.max(0, Math.abs(difference) < 0.000001 ? 0 : -difference),
    };
  });
}
export function summarizeProduction(history: ProductionDay[]) {
  const summary = laborSummary(history);
  const total = (key: "shop" | "training" | "unaccounted" | "excess") =>
    history.some((day) => day[key] !== null)
      ? history.reduce((sum, day) => sum + (day[key] ?? 0), 0)
      : null;
  return {
    job: summary.job,
    payroll: summary.payroll,
    utilization: summary.efficiency,
    matchedJob: summary.matchedJob,
    matchedPayroll: summary.matchedPayroll,
    matchedDays: summary.matchedDays,
    shop: total("shop"),
    training: total("training"),
    unaccounted: total("unaccounted"),
    excess: total("excess"),
    clockDays: history.filter((day) => day.payroll !== null).length,
    categoryDays: history.filter(
      (day) => day.shop !== null && day.training !== null,
    ).length,
    reconciliationDays: history.filter((day) => day.unaccounted !== null)
      .length,
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
    const history = productionHistory(bundle, person.id, start, end, asOf);
    const previous = summarizeProduction(
      productionHistory(bundle, person.id, priorStart, priorEnd, asOf),
    );
    return { ...person, history, ...summarizeProduction(history), previous };
  });
  const historyByDay = new Map<string, ProductionDay[]>();
  for (const row of rows)
    for (const day of row.history) {
      const group = historyByDay.get(day.day) ?? [];
      group.push(day);
      historyByDay.set(day.day, group);
    }
  const trend = [...historyByDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, history]) => ({ day, ...summarizeProduction(history) }));
  return {
    rows,
    trend,
    ...summarizeProduction(rows.flatMap((row) => row.history)),
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
