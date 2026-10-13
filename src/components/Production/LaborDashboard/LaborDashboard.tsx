import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, RefreshCw, Settings, X, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import {
  laborHistory,
  laborRanking,
  laborSummary,
  periodDates,
  validLaborDay,
  type LaborBundle,
  type LaborSource,
} from "../../../lib/laborDashboard";
const f = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
function lastDay(zone = "America/Chicago") {
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(now + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export default function LaborDashboard() {
  const { profile } = useAuth();
  const [mode, setMode] = useState("month"),
    [anchor, setAnchor] = useState(() => lastDay()),
    [rangeStart, setRangeStart] = useState(
      () => lastDay().slice(0, 4) + "-01-01",
    ),
    [rangeEnd, setRangeEnd] = useState(() => lastDay()),
    [by, setBy] = useState<"efficiency" | "job">("efficiency");
  const [bundle, setBundle] = useState<LaborBundle | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [saving, setSaving] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [detailDay, setDetailDay] = useState<string | null>(null),
    [holidayDraft, setHolidayDraft] = useState("");
  const dialog = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          "button,input,select,summary,a[href]",
        ),
      ).filter((e) => !e.hasAttribute("disabled"));
      const first = items[0],
        last = items[items.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = priorOverflow;
      previous?.focus();
    };
  }, [selected]);
  useEffect(() => {
    if (bundle) setHolidayDraft(bundle.holidays.join("\n"));
  }, [bundle?.holidays]);
  const timezone = bundle?.timezone ?? "America/Chicago";
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  const value =
    mode === "day"
      ? anchor
      : mode === "month"
        ? anchor.slice(0, 7)
        : anchor.slice(0, 4);
  const [start, end] =
    mode === "range" ? [rangeStart, rangeEnd] : periodDates(mode, value);
  const valid =
    validLaborDay(start) &&
    validLaborDay(end) &&
    start <= end &&
    Date.parse(end) - Date.parse(start) <= 1830 * 86400000;
  const load = useCallback(async () => {
    if (!profile?.organization_id || !valid) return;
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .rpc("get_labor_dashboard", {
          p_start: start,
          p_end: end < lastDay(timezone) ? end : lastDay(timezone),
        })
        .abortSignal(abort.signal);
      if (error) throw error;
      if (request === generation.current) setBundle(data as LaborBundle);
    } catch (e) {
      if (request === generation.current)
        setError(
          abort.signal.aborted
            ? "Report request timed out. Retry to refresh."
            : e instanceof Error
              ? e.message
              : String((e as any)?.message ?? e),
        );
    } finally {
      clearTimeout(timeout);
      if (request === generation.current) setLoading(false);
    }
  }, [profile?.organization_id, start, end, valid, timezone]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [load]);
  async function updateSource(
    source: LaborSource,
    changes: Partial<LaborSource>,
  ) {
    if (!profile?.organization_id) return;
    setSaving(source.source);
    setError("");
    try {
      const { data, error } = await supabase
        .from("labor_import_sources")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("organization_id", profile.organization_id)
        .eq("source", source.source)
        .select()
        .single();
      if (error) throw error;
      setBundle((b) =>
        b
          ? {
              ...b,
              sources: b.sources.map((s) =>
                s.source === source.source ? data : s,
              ),
            }
          : b,
      );
    } catch (e) {
      setError((e as any).message ?? "Source settings could not save");
    } finally {
      setSaving("");
    }
  }
  async function updateHolidays() {
    if (!profile?.organization_id) return;
    const holidays = [
      ...new Set(holidayDraft.split(/[\s,]+/).filter(Boolean)),
    ].sort();
    if (holidays.length > 500 || holidays.some((d) => !validLaborDay(d))) {
      setError("Enter valid holiday dates, one YYYY-MM-DD per line.");
      return;
    }
    setSaving("calendar");
    setError("");
    try {
      const { data, error } = await supabase
        .from("labor_dashboard_calendars")
        .update({ holidays })
        .eq("organization_id", profile.organization_id)
        .select()
        .single();
      if (error) throw error;
      setBundle((b) => (b ? { ...b, holidays: data.holidays } : b));
    } catch (e) {
      setError((e as any).message ?? "Holiday calendar could not save");
    } finally {
      setSaving("");
    }
  }
  const asOf = lastDay(timezone),
    rows = bundle && valid ? laborRanking(bundle, start, end, asOf, by) : [],
    person = rows.find((r) => r.id === selected);
  const history =
      bundle && selected
        ? laborHistory(
            bundle,
            selected,
            detailDay ?? start,
            detailDay ?? end,
            asOf,
          )
        : [],
    summary = laborSummary(history);
  const totalJob = rows.some((r) => r.job !== null)
      ? rows.reduce((v, r) => v + (r.job ?? 0), 0)
      : null,
    totalPayroll = rows.some((r) => r.payroll !== null)
      ? rows.reduce((v, r) => v + (r.payroll ?? 0), 0)
      : null;
  const projects = bundle?.project_snapshot?.payload.records ?? [];
  const nativeProjectMode =
    !!bundle?.sources.find((s) => s.source === "ipoint")?.native_from &&
    end >= bundle!.sources.find((s) => s.source === "ipoint")!.native_from!;
  const projectRows = nativeProjectMode
      ? (bundle?.native_projects ?? [])
      : projects,
    latestJob = bundle?.latest_job_day ?? "No import",
    latestPayroll = bundle?.latest_payroll_day ?? "No import";
  if (profile?.role !== "admin")
    return (
      <p className="p-6">
        Labor reporting requires organization administrator access.
      </p>
    );
  return (
    <section className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary flex items-center gap-2">
            <BarChart3 />
            Labor dashboard
          </h1>
          <p className="text-sm text-secondary mt-2">
            Job hours, payroll work hours and project labor in one place.
          </p>
          <p className="text-xs text-secondary mt-1">
            Job data through {latestJob} · Payroll data through {latestPayroll}{" "}
            · {bundle?.timezone ?? "America/Chicago"}
          </p>
        </div>
        <button
          className="border border-subtle rounded-lg p-2 text-primary flex gap-2 items-center"
          onClick={() => setSettings(!settings)}
        >
          <Settings size={16} />
          Data sources
        </button>
      </header>
      <div className="flex flex-wrap gap-3 items-center bg-surface border border-subtle p-3 rounded-xl">
        <select
          aria-label="Report period"
          className="bg-surface border border-subtle rounded-lg p-2 text-primary"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setDetailDay(null);
          }}
        >
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="range">Date range</option>
        </select>
        {mode === "range" ? (
          <>
            <label className="text-sm text-secondary">
              From{" "}
              <input
                aria-label="Report start date"
                className="bg-surface border border-subtle rounded p-2 text-primary"
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </label>
            <label className="text-sm text-secondary">
              Through{" "}
              <input
                aria-label="Report end date"
                className="bg-surface border border-subtle rounded p-2 text-primary"
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </label>
          </>
        ) : (
          <input
            aria-label="Reporting date"
            className="bg-surface border border-subtle rounded-lg p-2 text-primary"
            type={
              mode === "day" ? "date" : mode === "month" ? "month" : "number"
            }
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (mode === "day") setAnchor(v);
              else if (mode === "month") setAnchor(v + "-01");
              else setAnchor(v + "-01-01");
              setDetailDay(null);
            }}
          />
        )}
        <button
          onClick={() => void load()}
          disabled={loading || !valid}
          className="flex gap-2 items-center text-blue-600 p-2"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing" : "Refresh"}
        </button>
        <span className="text-xs text-secondary">
          Current periods include completed dates through {asOf}.
        </span>
      </div>
      {!valid && (
        <p role="alert">Choose a valid date range of up to five years.</p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3"
        >
          {error}
          {bundle && " Showing the last successful report."}
        </div>
      )}
      {settings && (
        <div className="bg-surface border border-subtle rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-primary">Import controls</h2>
          <p className="text-sm text-secondary">
            Turning off a source stops new imports into MJV and keeps its
            history. Set a cutover date when native MJV records should take
            over. The existing Electronic Life dashboard continues
            independently.
          </p>
          {bundle?.sources.map((s) => (
            <div
              key={s.source}
              className="flex flex-wrap gap-4 items-center border-t border-subtle pt-3"
            >
              <strong className="text-primary w-36">
                {s.source === "ipoint" ? "iPoint" : "QuickBooks Time"}
              </strong>
              <label className="text-sm text-primary">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  disabled={saving === s.source}
                  onChange={(e) =>
                    void updateSource(s, { enabled: e.target.checked })
                  }
                />{" "}
                Import enabled
              </label>
              <label className="text-sm text-secondary">
                MJV begins{" "}
                <input
                  aria-label={s.source + " native cutover date"}
                  type="date"
                  className="bg-surface text-primary border border-subtle rounded p-2"
                  value={s.native_from ?? ""}
                  disabled={saving === s.source}
                  onChange={(e) =>
                    void updateSource(s, {
                      native_from: e.target.value || null,
                    })
                  }
                />
              </label>
              <span className="text-xs text-secondary">
                Last successful sync:{" "}
                {s.last_success_at
                  ? new Date(s.last_success_at).toLocaleString()
                  : "Not synced"}
                {s.last_error && " · " + s.last_error}
              </span>
            </div>
          ))}
          <div className="border-t border-subtle pt-3">
            <label
              className="block text-sm text-primary"
              htmlFor="labor-holidays"
            >
              Company holidays (YYYY-MM-DD, one per line)
            </label>
            <textarea
              id="labor-holidays"
              className="bg-surface text-primary border border-subtle rounded p-2 my-2 w-full max-w-sm"
              rows={3}
              value={holidayDraft}
              onChange={(e) => setHolidayDraft(e.target.value)}
            />
            <button
              className="block text-blue-600 underline text-sm"
              disabled={saving === "calendar"}
              onClick={() => void updateHolidays()}
            >
              Save holidays
            </button>
            <p className="text-xs text-secondary mt-2">
              {bundle?.holidays.length
                ? "Configured holidays reduce assumed salaried work hours."
                : "No company holidays configured yet."}{" "}
              Recorded leave is handled separately.
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ["Job hours", totalJob],
          ["Payroll work hours", totalPayroll],
          ["Technicians", bundle?.roster.length ?? null],
        ].map(([label, hours]) => (
          <div
            key={String(label)}
            className="bg-surface border border-subtle rounded-xl p-4"
          >
            <span className="text-sm text-secondary">{label}</span>
            <strong className="block text-3xl text-primary mt-2">
              {f(hours as number | null)}
            </strong>
          </div>
        ))}
      </div>
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <div className="p-4 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              Technician ranking
            </h2>
            <p className="text-sm text-secondary">
              Click any technician to explore daily history.
            </p>
          </div>
          <label className="text-sm text-secondary">
            Rank by{" "}
            <select
              aria-label="Rank technicians by"
              className="bg-surface text-primary border border-subtle rounded-lg p-2"
              value={by}
              onChange={(e) => setBy(e.target.value as "efficiency" | "job")}
            >
              <option value="efficiency">Payroll/job efficiency</option>
              <option value="job">Job hours</option>
            </select>
          </label>
        </div>
        <div aria-label="Technician ranking chart" className="px-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ left: 12, right: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" unit={by === "efficiency" ? "%" : " h"} />
              <YAxis
                type="category"
                dataKey="name"
                width={115}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Bar
                dataKey={by}
                name={
                  by === "efficiency" ? "Matched efficiency (%)" : "Job hours"
                }
                fill={by === "efficiency" ? "#0d9488" : "#2563eb"}
                cursor="pointer"
                onClick={(entry: any) => {
                  const id = entry?.payload?.id ?? entry?.id;
                  if (id) {
                    setSelected(id);
                    setDetailDay(null);
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-subtle text-secondary">
              <tr>
                {[
                  "Rank",
                  "Technician",
                  "Job hours",
                  "Payroll work hours",
                  "Leave",
                  "Efficiency",
                  "Review",
                ].map((c) => (
                  <th key={c} className="text-left p-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-subtle hover:bg-blue-50/10"
                >
                  <td className="p-3">
                    {r.rank === null ? "—" : "#" + r.rank}
                  </td>
                  <td className="p-3">
                    <button
                      className="text-blue-600 underline font-semibold"
                      onClick={() => {
                        setSelected(r.id);
                        setDetailDay(null);
                      }}
                    >
                      {r.name}
                    </button>
                  </td>
                  <td className="p-3 text-primary">{f(r.job)}</td>
                  <td className="p-3 text-primary">{f(r.payroll)}</td>
                  <td className="p-3 text-primary">{f(r.leave)}</td>
                  <td className="p-3 font-semibold text-primary">
                    {r.efficiency === null ? "—" : f(r.efficiency) + "%"}
                  </td>
                  <td className="p-3">
                    <button
                      className="text-amber-600"
                      onClick={() => {
                        setSelected(r.id);
                        setDetailDay(null);
                      }}
                    >
                      {r.flags.length ? r.flags.length + " flags" : "—"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="p-4 text-secondary">
            No configured technician roster yet.
          </p>
        )}
        <p className="p-4 text-xs text-secondary">
          Efficiency uses the ratio of matched job and payroll work hours. Leave
          is separate. Missing or unreconciled dates are withheld from
          percentages. Salaried technicians use effective-dated expected weekly
          hours, labeled as assumptions in history.
        </p>
      </div>
      <div className="bg-surface border border-subtle rounded-xl p-4">
        <h2 className="text-lg font-semibold text-primary">
          Project hours sold vs. used
        </h2>
        <p className="text-sm text-secondary mb-3">
          {nativeProjectMode
            ? "MJV approved project time and sales-order labor budgets"
            : bundle?.project_snapshot
              ? "iPoint snapshot as of " + bundle.project_snapshot.day
              : "No verified project snapshot available"}{" "}
          · Cumulative snapshots are not added together.
        </p>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Project",
                  "Sold hours",
                  "Used hours",
                  "Remaining",
                  "Budget used",
                  "Status / bid assessment",
                ].map((t) => (
                  <th key={t} className="text-left p-2 text-secondary">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectRows.map((p: any) => (
                <tr key={p.project_id} className="border-t border-subtle">
                  <td className="p-2 text-primary">{p.project_name}</td>
                  <td className="p-2 text-primary">{f(p.hours_sold)}</td>
                  <td className="p-2 text-primary">{f(p.hours_used)}</td>
                  <td className="p-2 text-primary">
                    {p.hours_used == null || p.hours_sold == null
                      ? "—"
                      : f(p.hours_sold - p.hours_used)}
                  </td>
                  <td className="p-2 text-primary">
                    {p.hours_sold > 0 && p.hours_used != null
                      ? f((p.hours_used / p.hours_sold) * 100) + "%"
                      : "—"}
                  </td>
                  <td className="p-2 text-secondary">
                    {p.status ?? "unknown"}
                    {["completed", "complete"].includes(p.status) &&
                      p.hours_sold > 0 &&
                      p.hours_used != null && (
                        <small className="block">
                          {p.hours_used / p.hours_sold > 1.05
                            ? "Potential underbid"
                            : p.hours_used / p.hours_sold < 0.95
                              ? "Potential overbid"
                              : "Just right (±5%)"}
                        </small>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex justify-center items-center p-3"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <section
            ref={dialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={person?.name + " time history"}
            className="bg-surface rounded-xl w-full max-w-6xl max-h-[92vh] overflow-auto p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between gap-4 items-center">
              <h2 className="text-xl font-semibold text-primary">
                {person?.name} · Time history
              </h2>
              <button
                aria-label="Close history"
                onClick={() => setSelected(null)}
                className="p-2 text-primary"
              >
                <X />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 my-4">
              <span className="text-sm text-secondary">
                {detailDay ? "One day" : start + " through " + end}
              </span>
              <label className="text-sm text-secondary">
                Inspect day{" "}
                <input
                  aria-label="Technician history day"
                  type="date"
                  className="bg-surface text-primary border border-subtle rounded p-2"
                  min={start}
                  max={end < asOf ? end : asOf}
                  value={detailDay ?? ""}
                  onChange={(e) => setDetailDay(e.target.value || null)}
                />
              </label>
              <button
                onClick={() => setDetailDay(null)}
                className="text-blue-600 underline text-sm"
              >
                Whole selected range
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                ["Job hours", f(summary.job)],
                ["Payroll work hours", f(summary.payroll)],
                ["Leave hours", f(summary.leave)],
                [
                  "Matched efficiency",
                  summary.efficiency === null
                    ? "—"
                    : f(summary.efficiency) + "%",
                ],
              ].map(([label, v]) => (
                <div
                  key={label}
                  className="border border-subtle rounded-lg p-3"
                >
                  <span className="text-xs text-secondary">{label}</span>
                  <strong className="block text-xl text-primary">{v}</strong>
                </div>
              ))}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="job" name="Job hours" fill="#2563eb" />
                  <Bar
                    dataKey="payroll"
                    name="Payroll work hours"
                    fill="#94a3b8"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Job hrs",
                      "Payroll work hrs",
                      "Leave hrs",
                      "Efficiency",
                      "Source / review",
                    ].map((t) => (
                      <th key={t} className="p-2 text-left text-secondary">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((r) => (
                    <tr key={r.day} className="border-t border-subtle">
                      <td className="p-2 text-primary">{r.day}</td>
                      <td className="p-2 text-primary">{f(r.job)}</td>
                      <td className="p-2 text-primary">
                        {f(r.payroll)}
                        {r.assumed && (
                          <small className="block text-secondary">
                            Assumed weekly schedule
                          </small>
                        )}
                      </td>
                      <td className="p-2 text-primary">{f(r.leave)}</td>
                      <td className="p-2 text-primary">
                        {r.efficiency === null ? "—" : f(r.efficiency) + "%"}
                      </td>
                      <td className="p-2 text-secondary">
                        <small>
                          {r.jobSource} / {r.payrollSource}
                        </small>
                        {r.flags.length > 0 && (
                          <details>
                            <summary className="text-amber-600 cursor-pointer flex items-center gap-1">
                              <AlertTriangle size={12} />
                              {r.flags.length} review flags
                            </summary>
                            {r.flags.map((flag) => (
                              <p key={flag}>{flag}</p>
                            ))}
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-secondary mt-3">
              — means unavailable, not zero. Recorded corrections remain
              visible; flagged dates are excluded from efficiency. Use the
              shared report selector to explore another date range.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
