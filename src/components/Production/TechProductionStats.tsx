import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  Clock,
  RefreshCw,
  Search,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useAuth } from "../../contexts/AuthContext";
import { validLaborDay, type LaborBundle } from "../../lib/laborDashboard";
import {
  duration,
  percentage,
  priorPeriod,
  productionReport,
  rankProduction,
  reportPeriod,
  summarizeProduction,
  shiftDay,
  type ProductionRow,
} from "../../lib/techProduction";
import {
  loadProduction,
  loadProductionEntries,
  type JobEntry,
} from "../../lib/techProductionData";

const panel = "rounded-2xl border border-subtle bg-surface";
const input =
  "min-h-11 rounded-xl border border-subtle bg-surface px-3 text-sm text-primary";
function companyDay(zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
function Change({
  current,
  previous,
  percent = false,
}: {
  current: number | null;
  previous: number | null;
  percent?: boolean;
}) {
  if (current === null || previous === null)
    return (
      <span className="text-xs text-secondary">No comparable prior data</span>
    );
  const delta = current - previous;
  return (
    <span
      className={`text-xs font-medium ${delta > 0 ? "text-teal-600 dark:text-teal-400" : "text-secondary"}`}
    >
      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
      {percent
        ? Math.abs(delta).toFixed(1) + " pts"
        : duration(Math.abs(delta))}{" "}
      vs prior period
    </span>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
  note,
  wide = false,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
  note: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`${panel} p-4 sm:p-6 min-w-0 ${wide ? "col-span-2 lg:col-span-1" : ""}`}
    >
      <div className="flex justify-between gap-3 text-secondary">
        <span className="text-sm font-medium">{label}</span>
        <Icon size={19} className="text-teal-600" />
      </div>
      <strong className="block my-3 text-2xl sm:text-3xl xl:text-4xl font-semibold tracking-tight text-primary tabular-nums break-words">
        {value}
      </strong>
      <p className="text-xs text-secondary">{note}</p>
    </div>
  );
}
function ProductionTrend({
  data,
}: {
  data: ReturnType<typeof productionReport>["trend"];
}) {
  const [grouping, setGrouping] = useState("auto");
  // Group from matched hours, never by averaging percentages.
  const chart = useMemo(() => {
    const mode =
      grouping === "auto"
        ? data.length > 90
          ? "month"
          : data.length > 31
            ? "week"
            : "day"
        : grouping;
    if (mode === "day") return data;
    const months = new Map<
      string,
      {
        day: string;
        job: number | null;
        matchedPayroll: number;
        matchedJob: number;
      }
    >();
    for (const row of data) {
      const weekday = new Date(row.day + "T12:00:00Z").getUTCDay();
      const key =
          mode === "month"
            ? row.day.slice(0, 7)
            : shiftDay(row.day, -(weekday === 0 ? 6 : weekday - 1)),
        month = months.get(key) ?? {
          day: key,
          job: null,
          matchedPayroll: 0,
          matchedJob: 0,
        };
      if (row.job !== null) month.job = (month.job ?? 0) + row.job;
      month.matchedPayroll += row.matchedPayroll;
      month.matchedJob += row.matchedJob;
      months.set(key, month);
    }
    return [...months.values()].map((month) => ({
      ...month,
      utilization:
        month.matchedPayroll > 0
          ? (month.matchedJob / month.matchedPayroll) * 100
          : null,
    }));
  }, [data, grouping]);
  if (!data.some((day) => day.job !== null))
    return (
      <p className="p-6 text-secondary text-sm">
        No production data for these dates.
      </p>
    );
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-end gap-2 text-xs text-secondary">
        View by
        <select
          aria-label="Trend grouping"
          className={input}
          value={grouping}
          onChange={(event) => setGrouping(event.target.value)}
        >
          <option value="auto">Automatic</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </label>
      <div
        className="h-64 sm:h-80 w-full min-w-0"
        aria-label="Production and utilization trend"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chart}
            margin={{ top: 15, right: 8, bottom: 0, left: -15 }}
          >
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="currentColor"
              opacity={0.1}
            />
            <XAxis
              dataKey="day"
              tickFormatter={(day) =>
                day.length === 7
                  ? new Date(day + "-15T12:00:00Z").toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        year: "2-digit",
                        timeZone: "UTC",
                      },
                    )
                  : new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })
              }
              tick={{ fontSize: 11, fill: "rgb(var(--text-secondary))" }}
              minTickGap={35}
            />
            <YAxis
              yAxisId="hours"
              tick={{ fontSize: 11, fill: "rgb(var(--text-secondary))" }}
              tickFormatter={(value) => `${Math.round(value)}h`}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={{ fontSize: 11, fill: "rgb(var(--text-secondary))" }}
              tickFormatter={(value) => `${Math.round(value)}%`}
            />
            <Tooltip
              formatter={(
                value: number | undefined,
                name: string | undefined,
              ) => [
                name === "Utilization" ? percentage(value) : duration(value),
                name ?? "",
              ]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                background: "rgb(var(--surface))",
                borderRadius: 12,
                border: "1px solid #64748b",
              }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
            />
            <Bar
              yAxisId="hours"
              dataKey="job"
              name="Job hours"
              fill="#14b8a6"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
            <Line
              yAxisId="rate"
              dataKey="utilization"
              name="Utilization"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
export default function TechProductionStats() {
  const { profile, loading: authLoading } = useAuth();
  const [bundle, setBundle] = useState<LaborBundle | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [preset, setPreset] = useState("week"),
    [customStart, setCustomStart] = useState(
      () => companyDay("America/Chicago").slice(0, 7) + "-01",
    ),
    [customEnd, setCustomEnd] = useState(() =>
      shiftDay(companyDay("America/Chicago"), -1),
    );
  const [sort, setSort] = useState<"utilization" | "job">("utilization"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const request = useRef({ generation: 0 }),
    controller = useRef<AbortController | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const zone = bundle?.timezone ?? "America/Chicago",
    today = companyDay(zone),
    asOf = shiftDay(today, -1);
  const [start, end] = reportPeriod(preset, today, customStart, customEnd);
  const valid =
    validLaborDay(start) &&
    validLaborDay(end) &&
    start <= end &&
    end <= asOf &&
    Date.parse(end) - Date.parse(start) <= 365 * 86400000;
  const [priorStart] = valid ? priorPeriod(start, end) : [start];
  const viewerKey = [profile?.organization_id, profile?.id, profile?.role].join(
    ":",
  );
  const [loadedKey, setLoadedKey] = useState("");
  const currentKey = [viewerKey, start, end].join(":");
  const visibleBundle = loadedKey === currentKey && valid ? bundle : null;
  const load = useCallback(
    async (refresh = false) => {
      if (!profile?.organization_id || !profile.id || !valid || authLoading)
        return;
      const generation = ++request.current.generation;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const timer = setTimeout(() => abort.abort(), 20000);
      setLoading(true);
      setError("");
      try {
        const next = await loadProduction(
          {
            id: profile.id,
            organization_id: profile.organization_id,
            role: profile.role,
          },
          priorStart,
          end,
          abort.signal,
          refresh,
        );
        if (generation === request.current.generation) {
          setBundle(next);
          setLoadedKey(currentKey);
        }
      } catch (cause) {
        if (generation === request.current.generation)
          setError(
            abort.signal.aborted
              ? "Loading took too long. Please retry."
              : (cause as Error).message || "Production data could not load.",
          );
      } finally {
        clearTimeout(timer);
        if (generation === request.current.generation) setLoading(false);
      }
    },
    [
      profile?.organization_id,
      profile?.id,
      profile?.role,
      currentKey,
      priorStart,
      end,
      valid,
      authLoading,
    ],
  );
  useEffect(() => {
    void load();
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", focus);
    const requestState = request.current;
    return () => {
      window.removeEventListener("focus", focus);
      ++requestState.generation;
      controller.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    heading.current?.focus();
  }, [selected]);
  useEffect(() => {
    setSelected(null);
    setSearch("");
  }, [viewerKey]);
  const report = useMemo(
    () =>
      visibleBundle ? productionReport(visibleBundle, start, end, asOf) : null,
    [visibleBundle, start, end, asOf],
  );
  const rows = useMemo(
    () =>
      report
        ? rankProduction(report.rows, sort).filter((row) =>
            row.name.toLowerCase().includes(search.trim().toLowerCase()),
          )
        : [],
    [report, sort, search],
  );
  const person = report?.rows.find((row) => row.id === selected);
  const select = (id: string | null) => {
    setSelected(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  if (authLoading)
    return (
      <p role="status" className="p-6 text-secondary">
        Loading Tech Stats…
      </p>
    );
  return (
    <section className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6 text-primary">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-600 text-xs font-semibold uppercase tracking-widest">
            <BarChart3 size={15} /> Production & utilization
          </div>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 outline-none"
          >
            {person ? person.name : "Tech Stats"}
          </h1>
          <p className="text-secondary text-sm mt-2">
            {person
              ? "A closer look at the work behind the numbers."
              : "See who’s producing, how time is used, and how your team is trending."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report && (
            <button
              onClick={() => window.print()}
              className={`${input} flex items-center gap-2`}
            >
              <Printer size={16} /> Print
            </button>
          )}
          {selected && (
            <button
              className={`${input} flex items-center gap-2`}
              onClick={() => select(null)}
            >
              <ArrowLeft size={16} /> All technicians
            </button>
          )}
          <button
            disabled={loading || !valid}
            onClick={() => void load(true)}
            className={`${input} flex items-center gap-2 disabled:opacity-50`}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>
      <div
        className={`${panel} p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3`}
      >
        <div className="flex flex-wrap gap-1.5" aria-label="Reporting period">
          {[
            ["day", "Yesterday"],
            ["week", "This week"],
            ["month", "This month"],
            ["year", "This year"],
            ["custom", "Custom"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={preset === key}
              onClick={() => setPreset(key)}
              className={`min-h-11 rounded-xl px-3 sm:px-4 text-sm font-medium transition-colors ${preset === key ? "bg-teal-600 text-white shadow-sm" : "text-secondary hover:bg-elevated"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-secondary">
          {valid
            ? `${dateLabel(start)} – ${dateLabel(end)}`
            : "Choose completed dates"}
        </span>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 w-full border-t border-subtle pt-3">
            <label className="text-sm grid gap-1">
              From
              <input
                aria-label="Report start date"
                className={input}
                type="date"
                max={asOf}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label className="text-sm grid gap-1">
              Through
              <input
                aria-label="Report end date"
                className={input}
                type="date"
                max={asOf}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>
      {!valid && (
        <p role="alert" className="text-sm text-secondary">
          Choose a completed date range of up to one year. Today’s open activity
          is excluded.
        </p>
      )}
      {error && (
        <div role="alert" className={`${panel} p-4 text-sm`}>
          <p>{error}</p>
          {visibleBundle && (
            <p className="text-secondary mt-1">
              Showing the last successful report for these dates.
            </p>
          )}
          <button
            className="text-teal-600 underline mt-2 min-h-11"
            onClick={() => void load(true)}
          >
            Retry loading
          </button>
        </div>
      )}
      {valid && !report && !error && (
        <div
          role="status"
          aria-label="Loading production report"
          className="grid grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`${panel} p-6 animate-pulse h-36 bg-elevated`}
            />
          ))}
        </div>
      )}
      {report && visibleBundle && (
        <>
          <ProductionPrintReport
            rows={rows}
            person={person}
            start={start}
            end={end}
          />
          <p className="text-xs text-secondary">
            Completed activity only · {zone} · Job data through{" "}
            {visibleBundle.latest_job_day
              ? dateLabel(visibleBundle.latest_job_day)
              : "unavailable"}{" "}
            · Payroll clock through{" "}
            {visibleBundle.latest_payroll_day
              ? dateLabel(visibleBundle.latest_payroll_day)
              : "unavailable"}
            {loading ? " · Refreshing…" : ""}
          </p>
          {person ? (
            <TechnicianDetail
              key={`${viewerKey}:${person.id}:${start}:${end}`}
              person={person}
              bundle={visibleBundle}
              start={start}
              end={end}
              organization={profile!.organization_id!}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Metric
                  label="Job Hours"
                  value={duration(report.job)}
                  icon={Clock}
                  note="Recorded production for the selected dates"
                />
                <Metric
                  label="Payroll Clock Hours"
                  value={duration(report.payroll)}
                  icon={Users}
                  note="Actual daily clock time, excluding leave"
                />
                <Metric
                  wide
                  label="Team utilization"
                  value={percentage(report.utilization)}
                  icon={TrendingUp}
                  note="Job hours ÷ payroll clock hours on matched dates"
                />
              </div>
              <ClockBreakdown summary={report} />
              <div className={`${panel} p-4 sm:p-6`}>
                <div className="flex gap-2 items-center mb-5">
                  <TrendingUp size={19} className="text-teal-600" />
                  <h2 className="text-lg font-semibold">
                    Production over time
                  </h2>
                </div>
                <ProductionTrend data={report.trend} />
              </div>
              <section
                className={`${panel} overflow-hidden`}
                aria-label="Technician rankings"
              >
                <div className="p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-b border-subtle">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Trophy size={21} className="text-amber-500" /> Technician
                      rankings
                    </h2>
                    <p className="text-xs text-secondary mt-2">
                      Select a technician to explore their daily production.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="relative">
                      <span className="sr-only">Search technicians</span>
                      <Search
                        size={16}
                        className="absolute left-3 top-3.5 text-secondary"
                      />
                      <input
                        className={`${input} pl-9 w-full sm:w-48`}
                        placeholder="Find a technician"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <label className="sr-only" htmlFor="rank-production">
                      Rank technicians by
                    </label>
                    <select
                      id="rank-production"
                      aria-label="Rank technicians by"
                      value={sort}
                      onChange={(e) =>
                        setSort(e.target.value as "utilization" | "job")
                      }
                      className={input}
                    >
                      <option value="utilization">Utilization</option>
                      <option value="job">Job hours</option>
                    </select>
                  </div>
                </div>
                <div className="divide-y divide-subtle">
                  {rows.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => select(row.id)}
                      className="w-full p-4 sm:px-6 sm:py-5 text-left grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_9rem_9rem_auto] gap-3 sm:gap-5 items-center hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
                    >
                      <span
                        className={`h-8 w-8 rounded-xl flex items-center justify-center text-sm font-semibold ${row.rank === 1 ? "bg-amber-500/15 text-amber-600" : "bg-elevated text-secondary"}`}
                      >
                        {row.rank === null ? "—" : row.rank}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold block truncate">
                          {row.name}
                        </span>
                        <div className="mt-1">
                          <Change
                            current={row[sort]}
                            previous={row.previous[sort]}
                            percent={sort === "utilization"}
                          />
                        </div>
                        <span className="text-xs text-secondary block mt-1">
                          Payroll clock: {duration(row.payroll)}
                        </span>
                        <span className="sm:hidden text-xs text-secondary block mt-1">
                          {duration(row.job)} on jobs ·{" "}
                          {percentage(row.utilization)} utilized
                        </span>
                      </div>
                      <div className="hidden sm:block">
                        <strong className="font-semibold tabular-nums">
                          {duration(row.job)}
                        </strong>
                        <span className="block text-xs text-secondary mt-1">
                          Job hours
                        </span>
                      </div>
                      <div className="hidden sm:block">
                        <strong className="font-semibold tabular-nums">
                          {percentage(row.utilization)}
                        </strong>
                        <span className="block text-xs text-secondary mt-1">
                          Utilization · {row.matchedDays} matched days
                        </span>
                      </div>
                      <ArrowRight size={17} className="text-secondary" />
                    </button>
                  ))}
                </div>
                {!rows.length && (
                  <p className="p-8 text-sm text-secondary text-center">
                    {search
                      ? "No technicians match your search."
                      : "No technicians are available for this report."}
                  </p>
                )}
                <p className="p-4 sm:px-6 text-xs text-secondary border-t border-subtle">
                  Rankings use the selected dates. Ties share a rank.
                  Utilization uses matched work dates; unavailable values are
                  unranked. Prior period is the same number of calendar days
                  immediately before this range.
                </p>
              </section>
            </>
          )}
          <p className="text-xs text-secondary leading-relaxed">
            Utilization compares recorded job hours with actual payroll clock
            hours, including salaried technicians. Leave is excluded; schedules
            are never substituted. {duration(report.matchedPayroll)} of{" "}
            {duration(report.payroll)} payroll clock hours have comparable job
            data. Shop and training use recorded entries only. Missing category
            data stays missing; overlapping or excess entries are flagged for
            reconciliation.
          </p>
        </>
      )}
    </section>
  );
}
function TechnicianDetail({
  person,
  bundle,
  start,
  end,
  organization,
}: {
  person: ProductionRow;
  bundle: LaborBundle;
  start: string;
  end: string;
  organization: string;
}) {
  const [entries, setEntries] = useState<JobEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 20000);
    let active = true;
    setLoading(true);
    setError("");
    loadProductionEntries(organization, person.id, start, end, abort.signal)
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            abort.signal.aborted
              ? "Job detail took too long to load."
              : (cause as Error).message,
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [organization, person.id, start, end, retry]);
  const byDay = useMemo(() => {
    const map = new Map<string, JobEntry[]>();
    for (const entry of entries)
      map.set(entry.entry_date, [...(map.get(entry.entry_date) ?? []), entry]);
    return map;
  }, [entries]);
  const historicalTiming = useMemo(() => {
    const name = bundle.mappings.find(
      (mapping) =>
        mapping.profile_id === person.id && mapping.source === "ipoint",
    )?.external_employee_id;
    const pairs = new Map<string, { first: string; last: string }>();
    for (const snapshot of bundle.snapshots) {
      if (snapshot.kind !== "technician") continue;
      const record = snapshot.payload.records.find(
        (record) => record.technician === name,
      );
      if (
        !record?.job_timing_complete ||
        record.review_flags?.length ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.first_job_in) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(record.last_job_out) ||
        record.last_job_out < record.first_job_in
      )
        continue;
      const label = (clock: string) =>
        new Date("2000-01-01T" + clock + ":00Z").toLocaleTimeString("en-US", {
          timeZone: "UTC",
          hour: "numeric",
          minute: "2-digit",
        });
      pairs.set(snapshot.day, {
        first: label(record.first_job_in),
        last: label(record.last_job_out),
      });
    }
    return pairs;
  }, [bundle, person.id]);
  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString("en-US", {
          timeZone: bundle.timezone || "America/Chicago",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
  const trend = person.history.map((day) => ({
    day: day.day,
    ...productionSummary(day),
  }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Metric
          label="Job Hours"
          value={duration(person.job)}
          icon={Clock}
          note="Recorded production in this period"
        />
        <Metric
          label="Utilization"
          value={percentage(person.utilization)}
          icon={TrendingUp}
          note={`${person.matchedDays} matched work dates`}
        />
        <Metric
          wide
          label="Payroll Clock Hours"
          value={duration(person.payroll)}
          icon={Users}
          note="Actual daily clock time, excluding leave"
        />
      </div>
      <ClockBreakdown summary={person} />
      <div className={`${panel} p-4 sm:p-6`}>
        <h2 className="font-semibold text-lg mb-2">Production trend</h2>
        <Change
          current={person.utilization}
          previous={person.previous.utilization}
          percent
        />
        <ProductionTrend data={trend} />
      </div>
      <section className={`${panel} overflow-hidden`}>
        <div className="p-4 sm:p-6 border-b border-subtle">
          <h2 className="font-semibold text-xl">Daily activity</h2>
          <p className="text-sm text-secondary mt-2">
            Expand a day to see its recorded jobs, shop time and training.
            Payroll clock hours use actual records for everyone.
          </p>
          {loading && (
            <p role="status" className="text-xs text-secondary mt-2">
              Loading time entries…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm mt-2">
              {error}{" "}
              <button
                onClick={() => setRetry((v) => v + 1)}
                className="underline text-teal-600 min-h-11"
              >
                Retry job detail
              </button>
            </p>
          )}
        </div>
        <div className="divide-y divide-subtle">
          {[...person.history].reverse().map((day) => (
            <details key={day.day} className="group">
              <summary className="cursor-pointer list-none p-4 sm:px-6 grid grid-cols-[1rem_1fr_auto_auto] items-center gap-2 sm:gap-6 hover:bg-elevated">
                <ChevronDown
                  size={16}
                  className="text-secondary group-open:rotate-180 transition-transform"
                />
                <div className="min-w-0">
                  <span className="font-medium text-sm">
                    {dateLabel(day.day)}
                  </span>
                  <span className="text-xs text-secondary block mt-1">
                    {day.jobSource === "MJV"
                      ? "MJV activity"
                      : "Historical production"}
                  </span>
                </div>
                <div className="text-right">
                  <strong className="text-sm tabular-nums">
                    {duration(day.job)}
                  </strong>
                  <span className="text-xs text-secondary block mt-1">
                    Job time
                  </span>
                </div>
                <div className="text-right">
                  <strong className="text-sm tabular-nums">
                    {percentage(day.efficiency)}
                  </strong>
                  <span className="text-xs text-secondary block mt-1">
                    Utilization
                  </span>
                </div>
              </summary>
              <div className="px-4 sm:px-6 pb-5 space-y-3">
                <p className="text-xs text-secondary">
                  Payroll clock: {duration(day.payroll)} · Shop:{" "}
                  {duration(day.shop)} · Training: {duration(day.training)} ·
                  Unaccounted: {duration(day.unaccounted)}.{" "}
                  {day.efficiency === null
                    ? "Comparable time is unavailable for this date."
                    : ""}
                </p>
                {!day.clockDataComplete &&
                  day.job !== null &&
                  day.payroll !== null && (
                    <p className="text-xs text-secondary">
                      Clock records are incomplete or flagged; utilization and
                      reconciliation are withheld for this date.
                    </p>
                  )}
                {day.excess !== null && day.excess > 0 && (
                  <p className="text-sm text-amber-600">
                    Recorded job, shop and training time exceeds payroll clock
                    time by {duration(day.excess)}. Check for overlapping or
                    incorrect entries.
                  </p>
                )}
                {(day.shop === null || day.training === null) && (
                  <p className="text-xs text-secondary">
                    Shop/training breakdown missing for this date; unaccounted
                    time cannot be calculated.
                  </p>
                )}
                {day.jobSource !== "MJV" && historicalTiming.has(day.day) && (
                  <p className="text-sm text-secondary">
                    First job: {historicalTiming.get(day.day)!.first} · Last
                    job: {historicalTiming.get(day.day)!.last} ·{" "}
                    {bundle.timezone}
                  </p>
                )}
                {day.jobSource !== "MJV" && (
                  <p className="text-sm text-secondary">
                    Historical reports provide daily totals. Individual job
                    entries were not included in that report.
                  </p>
                )}
                {(byDay.get(day.day) ?? []).map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-subtle bg-elevated p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-sm">
                          {entry.entry_type === "shop_time"
                            ? "Shop Time"
                            : entry.entry_type === "training"
                              ? "Training Time"
                              : entry.work_order?.title ||
                                entry.project?.name ||
                                entry.contact?.full_name ||
                                "Customer activity"}
                        </h3>
                        <p className="text-xs text-secondary mt-1">
                          {[
                            entry.contact?.full_name ||
                              entry.contact?.company_name,
                            entry.project?.name,
                            entry.work_order?.work_order_number,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="text-sm tabular-nums">
                        <strong>{duration(Number(entry.total_hours))}</strong>
                        <span className="text-xs text-secondary block mt-1">
                          {time(entry.clock_in)} – {time(entry.clock_out)}
                        </span>
                      </div>
                    </div>
                    {day.jobSource !== "MJV" && (
                      <p className="text-xs text-secondary mt-2">
                        Native MJV entry, shown for context; not added to the
                        historical total.
                      </p>
                    )}
                    {entry.notes && (
                      <p className="mt-3 text-sm whitespace-pre-wrap">
                        {entry.notes}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-teal-600">
                      {entry.work_order_id && (
                        <a
                          className="underline min-h-11 inline-flex items-center"
                          href={`/work-orders?workOrderId=${encodeURIComponent(entry.work_order_id)}`}
                        >
                          Open work order
                        </a>
                      )}
                      {entry.project_id && (
                        <a
                          className="underline min-h-11 inline-flex items-center"
                          href={`/projects?projectId=${encodeURIComponent(entry.project_id)}`}
                        >
                          Open project
                        </a>
                      )}
                      {entry.contact_id && (
                        <a
                          className="underline min-h-11 inline-flex items-center"
                          href={`/contacts?contactId=${encodeURIComponent(entry.contact_id)}`}
                        >
                          Open customer
                        </a>
                      )}
                    </div>
                  </article>
                ))}
                {!loading &&
                  !error &&
                  !byDay.get(day.day)?.length &&
                  day.jobSource === "MJV" && (
                    <p className="text-sm text-secondary">
                      No completed job, shop or training entries are recorded
                      for this day.
                    </p>
                  )}
              </div>
            </details>
          ))}
        </div>
        {!person.history.length && (
          <p className="p-6 text-sm text-secondary">
            No completed dates are available in this range.
          </p>
        )}
      </section>
    </div>
  );
}
function ClockBreakdown({
  summary,
}: {
  summary: ReturnType<typeof summarizeProduction>;
}) {
  return (
    <div className={`${panel} p-4 sm:p-6 space-y-4`}>
      <h2 className="text-lg font-semibold">Payroll clock breakdown</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            ["Job Hours", summary.job],
            ["Shop Time", summary.shop],
            ["Training Time", summary.training],
            ["Unaccounted Time", summary.unaccounted],
          ] as const
        ).map(([label, hours]) => (
          <div key={label}>
            <p className="text-xs text-secondary">{label}</p>
            {label !== "Job Hours" &&
              hours !== null &&
              (label === "Unaccounted Time"
                ? summary.reconciliationDays
                : summary.categoryDays) < summary.clockDays && (
                <span className="text-xs text-amber-600">Partial total</span>
              )}
            <p className="text-xl font-semibold tabular-nums mt-1">
              {duration(hours)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-secondary">
        Shop/training recorded on {summary.categoryDays} technician dates;
        unaccounted time covers {summary.reconciliationDays} of{" "}
        {summary.clockDays} payroll clock dates. Missing categories show —.
        Unaccounted time = payroll clock − jobs − shop − training, calculated
        per date.
      </p>
      {(summary.excess ?? 0) > 0 && (
        <p className="text-sm text-amber-600">
          Recorded categories exceed payroll clock time by{" "}
          {duration(summary.excess)} across affected dates. Check for
          overlapping or incorrect entries.
        </p>
      )}
    </div>
  );
}

function productionSummary(day: ProductionRow["history"][number]) {
  return summarizeProduction([day]);
}

function ProductionPrintReport({
  rows,
  person,
  start,
  end,
}: {
  rows: ReturnType<typeof rankProduction>;
  person?: ProductionRow;
  start: string;
  end: string;
}) {
  return createPortal(
    <div className="tech-stats-print">
      <style>{`.tech-stats-print { display: none; } @media print { @page { size: letter portrait; margin: .5in; } body > *:not(.tech-stats-print) { display: none !important; } .tech-stats-print { display: block !important; color: #111827; background: white; font: 9pt Arial, sans-serif; } .tech-stats-print h1 { font-size: 22pt; margin-bottom: 8pt; } .tech-stats-print p { margin: 8pt 0; } .tech-stats-print table { width: 100%; border-collapse: collapse; margin-top: 20pt; } .tech-stats-print th, .tech-stats-print td { padding: 7pt 3pt; overflow-wrap: anywhere; text-align: left; border-bottom: 1px solid #ddd; } .tech-stats-print tr { break-inside: avoid; } .tech-stats-print thead { display: table-header-group; } }`}</style>
      <h1>
        {person
          ? person.name + " · Production"
          : "Tech Stats · Technician rankings"}
      </h1>
      <p>
        {dateLabel(start)} – {dateLabel(end)}
      </p>
      <table>
        <thead>
          <tr>
            {(person
              ? [
                  "Date",
                  "Payroll",
                  "Jobs",
                  "Shop",
                  "Training",
                  "Unaccounted",
                  "Utilization",
                ]
              : [
                  "Rank",
                  "Technician",
                  "Payroll",
                  "Jobs",
                  "Shop",
                  "Training",
                  "Unaccounted",
                  "Utilization",
                ]
            ).map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {person
            ? person.history.map((day) => (
                <tr key={day.day}>
                  <td>{dateLabel(day.day)}</td>
                  <td>{duration(day.payroll)}</td>
                  <td>{duration(day.job)}</td>
                  <td>{duration(day.shop)}</td>
                  <td>{duration(day.training)}</td>
                  <td>
                    {duration(day.unaccounted)}
                    {(day.excess ?? 0) > 0 ? " *" : ""}
                  </td>
                  <td>{percentage(day.efficiency)}</td>
                </tr>
              ))
            : rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.rank ?? "—"}</td>
                  <td>{row.name}</td>
                  <td>{duration(row.payroll)}</td>
                  <td>{duration(row.job)}</td>
                  <td>{duration(row.shop)}</td>
                  <td>{duration(row.training)}</td>
                  <td>
                    {duration(row.unaccounted)}
                    {(row.excess ?? 0) > 0 ? " *" : ""}
                  </td>
                  <td>{percentage(row.utilization)}</td>
                </tr>
              ))}
        </tbody>
      </table>
      <p>
        Utilization = job hours ÷ actual payroll clock hours on matched dates.
        Leave excluded. — means missing data. Shop/training and unaccounted
        totals cover recorded, comparable dates only. * Recorded categories
        exceed payroll clock hours; reconciliation needed.
      </p>
    </div>,
    document.body,
  );
}
