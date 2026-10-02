export interface CommissionPeriod {
  label: string;
  start: string;
  end: string;
}
const dayMs = 86400000;
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * dayMs);

// today is a calendar date in the organization's timezone, not the browser's.
export function commissionPeriods(
  frequency: string,
  anchor: string | null,
  today: string,
): CommissionPeriod[] {
  const current = date(today);
  const periods: CommissionPeriod[] = [];
  if (!Number.isFinite(current.getTime())) return periods;
  if (frequency === "weekly" || frequency === "bi-weekly") {
    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return periods;
    const first = date(anchor);
    if (!Number.isFinite(first.getTime())) return periods;
    const length = frequency === "weekly" ? 7 : 14;
    const offset =
      Math.floor((current.getTime() - first.getTime()) / dayMs / length) *
      length;
    for (let i = 0; i < 6; i++) {
      const start = addDays(first, offset - i * length);
      const end = addDays(start, length - 1);
      periods.push({
        label: `${iso(start)} – ${iso(end)}`,
        start: iso(start),
        end: iso(end),
      });
    }
    return periods;
  }
  if (frequency !== "monthly" && frequency !== "semi-monthly") return periods;
  let start =
    frequency === "monthly" || current.getUTCDate() <= 15
      ? new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))
      : new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 16));
  for (let i = 0; i < 6; i++) {
    const end =
      frequency === "semi-monthly" && start.getUTCDate() === 1
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 15))
        : new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
          );
    periods.push({
      label: `${iso(start)} – ${iso(end)}`,
      start: iso(start),
      end: iso(end),
    });
    start =
      frequency === "semi-monthly" && start.getUTCDate() === 16
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
        : new Date(
            Date.UTC(
              start.getUTCFullYear(),
              start.getUTCMonth() - 1,
              frequency === "semi-monthly" ? 16 : 1,
            ),
          );
  }
  return periods;
}

export function organizationToday(timezone = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
